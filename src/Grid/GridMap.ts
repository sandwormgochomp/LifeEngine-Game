import Cell from '../Organism/Cell/GridCell';
import CellStates from '../Organism/Cell/CellStates';
import Hyperparams from '../Hyperparameters';
import type { CellState, RenderCellOwnerLike, RenderOrganismLike } from '../Organism/Cell/CellStates';

/* One food or wall tile in a serialized grid: only its coordinates, since the
   state is implied by which list it lands in. */
export interface SerializedGridLoc {
    c: number;
    r: number;
}

export interface SerializedGridMap {
    cell_size: number;
    cols: number;
    rows: number;
    food: SerializedGridLoc[];
    walls: SerializedGridLoc[];
}

/* The grid is stored as parallel arrays indexed by `col * rows + row`, not as a
   column-of-rows of Cell objects.
 *
 * Everything scalar about a cell lives in a typed array: one byte for the state
 * (an index into CellStates.all), one for the food-adjacency counter, two for
 * wall durability, one for the renderer's stale flag. Only the two genuinely
 * object-valued fields -- the owning organism and the owning body cell -- need
 * a JS array, and those hold references the world already owns.
 *
 * That is ~21 bytes per cell against the ~100+ an object per cell cost, and it
 * removes a per-cell allocation from world construction, which is what used to
 * block the main thread for a fifth of a second to half a second on the large
 * bundled worlds. A lookup is an integer multiply-add and a typed-array load
 * instead of two pointer chases into a nested array.
 *
 * Reads come in two flavours. The scalar accessors (stateAt/ownerAt/... and
 * their -Of variants, which take an index that is already known good) are what
 * the simulation uses; they allocate nothing. cellAt() builds a Cell view for
 * the cold paths that want to pass a cell around as one value. Views are not
 * identity-stable -- see GridCell -- so anything that remembers cells across
 * calls remembers indices.
 */
class GridMap {
    cols!: number;
    rows!: number;
    cell_size!: number;
    size!: number;

    /* CellStates.all index per cell. Zero is `empty`, so a fresh array is a
       fresh empty world with nothing written. */
    state_ids!: Uint8Array;
    /* See the invariant note on bumpFoodAdj. Values are 0..4. */
    food_adj!: Uint8Array;
    /* Wall hit points; 0 wherever the state is not `wall`. */
    durability!: Uint16Array;
    /* Renderer bookkeeping: 1 when the cell is dirty but was skipped as off
       screen, so pan/zoom can promote it back into the dirty set. */
    stale_flags!: Uint8Array;
    owners!: (RenderOrganismLike | null)[];
    cell_owners!: (RenderCellOwnerLike | null)[];

    /* Petri-dish glass. Allocated only by setDish(), i.e. only on worlds that
       actually have a dish; null everywhere else, which is the common case and
       saves two more arrays' worth of memory on the big worlds. dish_light is
       the -1..1 light factor scaled by 100 -- the renderer quantises it into
       colour bands 0.07 apart, so a hundredth is well below what it can see. */
    dish_tier: Uint8Array | null;
    dish_light: Int8Array | null;

    /* Lazily materialized Cell[][], for tests and debugging only -- see the
       `grid` getter. Dropped by resize(). */
    private grid_views: Cell[][] | null;

    constructor(cols: number | string, rows: number | string, cell_size: number | string) {
        this.dish_tier = null;
        this.dish_light = null;
        this.grid_views = null;
        this.resize(cols, rows, cell_size);
    }

    resize(cols: number | string, rows: number | string, cell_size: number | string): void {
        // Saved worlds can carry these as strings; coerce so arithmetic and
        // the renderer never see a string cell size
        cols = Number(cols);
        rows = Number(rows);
        cell_size = Number(cell_size);
        this.cols = cols;
        this.rows = rows;
        this.cell_size = cell_size;
        this.size = cols * rows;
        this.state_ids = new Uint8Array(this.size);
        this.food_adj = new Uint8Array(this.size);
        this.durability = new Uint16Array(this.size);
        this.stale_flags = new Uint8Array(this.size);
        /* fill(null) rather than a bare `new Array(n)`: a holey array reads
           through a slower element kind for the life of the grid. */
        this.owners = new Array(this.size).fill(null);
        this.cell_owners = new Array(this.size).fill(null);
        this.dish_tier = null;
        this.dish_light = null;
        this.grid_views = null;
    }

    // ---- indexing ----

    isValidLoc(col: number, row: number): boolean {
        return col<this.cols && row<this.rows && col>=0 && row>=0;
    }

    /* The linear index of (col, row), or -1 if it is off the grid. The single
       bounds test every other accessor is built from. */
    indexAt(col: number, row: number): number {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows)
            return -1;
        return col * this.rows + row;
    }

    colOf(idx: number): number { return (idx / this.rows) | 0; }
    rowOf(idx: number): number { return idx - ((idx / this.rows) | 0) * this.rows; }
    xOf(idx: number): number { return ((idx / this.rows) | 0) * this.cell_size; }
    yOf(idx: number): number { return (idx - ((idx / this.rows) | 0) * this.rows) * this.cell_size; }

    // ---- scalar reads ----

    stateOf(idx: number): CellState { return CellStates.all[this.state_ids[idx]]; }
    ownerOf(idx: number): RenderOrganismLike | null { return this.owners[idx]; }
    cellOwnerOf(idx: number): RenderCellOwnerLike | null { return this.cell_owners[idx]; }

    /* null off the grid, which is what every caller's comparison against a
       CellState wants -- the same answer the old `cellAt(...)?.state` gave. */
    stateAt(col: number, row: number): CellState | null {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows)
            return null;
        return CellStates.all[this.state_ids[col * this.rows + row]];
    }

    ownerAt(col: number, row: number): RenderOrganismLike | null {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows)
            return null;
        return this.owners[col * this.rows + row];
    }

    cellOwnerAt(col: number, row: number): RenderCellOwnerLike | null {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows)
            return null;
        return this.cell_owners[col * this.rows + row];
    }

    /* -1 off the grid, so a caller can tell "no food beside it" from "no cell
       there at all" -- MouthCell needs that distinction to know whether its
       fast path is entitled to skip the scan. */
    foodAdjAt(col: number, row: number): number {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows)
            return -1;
        return this.food_adj[col * this.rows + row];
    }

    dishTierOf(idx: number): number { return this.dish_tier ? this.dish_tier[idx] : 0; }
    dishLightOf(idx: number): number { return this.dish_light ? this.dish_light[idx] / 100 : 0; }

    // ---- views ----

    /* A fresh view onto (col, row), or null off the grid. See GridCell: the
       object is a live window on the arrays, but it is not identity-stable, so
       collections of cells hold indices instead. */
    cellAt(col: number, row: number): Cell | null {
        var idx = this.indexAt(col, row);
        if (idx < 0)
            return null;
        return new Cell(this, idx);
    }

    viewOf(idx: number): Cell {
        return new Cell(this, idx);
    }

    /* The old Cell[][] shape, rebuilt on demand and cached. Test and debug
       affordance only -- nothing in the engine reads it, and touching it
       materializes one view object per cell, which is exactly the allocation
       this class exists to avoid. */
    get grid(): Cell[][] {
        if (this.grid_views)
            return this.grid_views;
        var grid: Cell[][] = [];
        for (var c = 0; c < this.cols; c++) {
            var col: Cell[] = [];
            for (var r = 0; r < this.rows; r++)
                col.push(new Cell(this, c * this.rows + r));
            grid.push(col);
        }
        this.grid_views = grid;
        return grid;
    }

    // ---- writes ----

    /* food_adj invariant: for every cell, food_adj equals the number of its
       four orthogonal neighbours whose state is food. This class is the only
       writer, and there are exactly three ways the grid's states change:
       setCellType (the funnel for Environment.changeCell and loadRaw, which
       maintains the count incrementally), fillGrid (bulk, rebuilds), and
       resize (fresh arrays, all zero and no food). Nothing outside this file
       writes state_ids -- Cell.state is deliberately getter-only -- so if that
       ever changes, the new caller has to maintain the count or rebuild.

       It exists because mouth cells scan their neighbourhood every tick and
       almost never find anything: measured 99.8% empty on the shrubland and
       colony worlds, 99.3% on Epic. One read replaces four lookups on all of
       those, against ~1.7k food writes a tick to keep it honest. */
    bumpFoodAdj(col: number, row: number, delta: number): void {
        var base = col * this.rows + row;
        if (col > 0)             this.food_adj[base - this.rows] += delta;
        if (col < this.cols - 1) this.food_adj[base + this.rows] += delta;
        if (row > 0)             this.food_adj[base - 1] += delta;
        if (row < this.rows - 1) this.food_adj[base + 1] += delta;
    }

    // Recompute the whole invariant from the grid. O(cells), for after a bulk
    // write that did not go through setCellType.
    rebuildFoodAdjacency(): void {
        this.food_adj.fill(0);
        var food_id = CellStates.food.id;
        for (var c = 0; c < this.cols; c++)
            for (var r = 0; r < this.rows; r++)
                if (this.state_ids[c * this.rows + r] === food_id)
                    this.bumpFoodAdj(c, r, 1);
    }

    fillGrid(state: CellState, ignore_walls=false): void {
        var wall_id = CellStates.wall.id;
        var inv_wall_id = CellStates.invincible_wall.id;
        var id = state.id;
        var durability = state === CellStates.wall ? Hyperparams.wallDurability : 0;
        for (var i = 0; i < this.size; i++) {
            if (ignore_walls && (this.state_ids[i] === wall_id || this.state_ids[i] === inv_wall_id)) continue;
            this.state_ids[i] = id;
            this.durability[i] = durability;
            this.owners[i] = null;
            this.cell_owners[i] = null;
        }
        // Bulk path: cheaper to recompute once than to track each write, and
        // it cannot drift the way a hand-maintained bulk update could.
        this.rebuildFoodAdjacency();
    }

    setCellType(col: number, row: number, state: CellState): void {
        var idx = this.indexAt(col, row);
        if (idx < 0) {
            return;
        }
        // Only a transition across food changes what the neighbours see; a
        // food->food or empty->wall write must not touch the counts.
        var food_id = CellStates.food.id;
        var was_food = this.state_ids[idx] === food_id;
        var is_food = state.id === food_id;
        this.state_ids[idx] = state.id;
        this.durability[idx] = state === CellStates.wall ? Hyperparams.wallDurability : 0;
        if (was_food !== is_food)
            this.bumpFoodAdj(col, row, is_food ? 1 : -1);
    }

    setCellOwner(col: number, row: number, cell_owner: RenderCellOwnerLike | null): void {
        var idx = this.indexAt(col, row);
        if (idx < 0) {
            return;
        }
        this.cell_owners[idx] = cell_owner;
        if (cell_owner != null)
            /* RenderCellOwnerLike leaves `org` optional, but every real body
               cell carries one. The cast narrows the type only -- the exact
               value written is unchanged. */
            this.owners[idx] = cell_owner.org as RenderOrganismLike | null;
        else
            this.owners[idx] = null;
    }

    /* Take `amount` hit points off a wall and report whether it is spent, so
       the caller can clear the cell. Clamped at zero: durability lives in a
       Uint16Array, where the bare decrement the callers used to do on a plain
       property would wrap past zero to 65535 and make the wall unbreakable. */
    damageWall(idx: number, amount: number): boolean {
        var left = this.durability[idx] - amount;
        this.durability[idx] = left > 0 ? left : 0;
        return left <= 0;
    }

    /* Stamp one cell's petri-dish glass, allocating the two arrays on the
       first call. tier 0 means the cell is inside the dish and not glass at
       all; light is the -1..1 shading factor. */
    setDish(col: number, row: number, tier: number, light: number): void {
        var idx = this.indexAt(col, row);
        if (idx < 0)
            return;
        if (!this.dish_tier) {
            this.dish_tier = new Uint8Array(this.size);
            this.dish_light = new Int8Array(this.size);
        }
        this.dish_tier[idx] = tier;
        this.dish_light![idx] = Math.round(light * 100);
    }

    getCenter(): [number, number] {
        return [Math.floor(this.cols/2), Math.floor(this.rows/2)]
    }

    xyToColRow(x: number, y: number): [number, number] {
        var c = Math.floor(x/this.cell_size);
        var r = Math.floor(y/this.cell_size);
        if (c >= this.cols)
            c = this.cols-1;
        else if (c < 0)
            c = 0;
        if (r >= this.rows)
            r = this.rows-1;
        else if (r < 0)
            r = 0;
        return [c, r];
    }

    serialize(): SerializedGridMap {
        // Rather than store every single cell, we will store non organism cells (food+walls)
        // and assume everything else is empty. Organism cells will be set when the organism
        // list is loaded. This reduces filesize and complexity.
        /* Asserted rather than annotated because the literal is deliberately
           incomplete for the two statements that follow. */
        let grid = {cell_size:this.cell_size, cols:this.cols, rows:this.rows} as SerializedGridMap;
        grid.food = [];
        grid.walls = [];
        let food_id = CellStates.food.id;
        let wall_id = CellStates.wall.id;
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                let id = this.state_ids[c * this.rows + r];
                if (id === food_id)
                    grid.food.push({c: c, r: r}); // no need to store state
                else if (id === wall_id)
                    grid.walls.push({c: c, r: r});
            }
        }
        return grid;
    }

    loadRaw(grid: SerializedGridMap): void {
        for (let f of grid.food)
            this.setCellType(f.c, f.r, CellStates.food);
        for (let w of grid.walls)
            this.setCellType(w.c, w.r, CellStates.wall);
    }
}

export default GridMap;
