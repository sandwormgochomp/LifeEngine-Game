import Cell from '../Organism/Cell/GridCell';
import CellStates from '../Organism/Cell/CellStates';
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

class GridMap {
    grid!: Cell[][];
    cols!: number;
    rows!: number;
    cell_size!: number;

    constructor(cols: number | string, rows: number | string, cell_size: number | string) {
        this.resize(cols, rows, cell_size);
    }

    resize(cols: number | string, rows: number | string, cell_size: number | string): void {
        this.grid = [];
        // Saved worlds can carry these as strings; coerce so arithmetic and
        // the renderer never see a string cell size
        cols = Number(cols);
        rows = Number(rows);
        cell_size = Number(cell_size);
        this.cols = cols;
        this.rows = rows;
        this.cell_size = cell_size;
        for(var c=0; c<cols; c++) {
            var row = [];
            for(var r=0; r<rows; r++) {
                var cell = new Cell(CellStates.empty, c, r, c*cell_size, r*cell_size);
                row.push(cell);
            }
            this.grid.push(row);
        }
    }

    /* Cell.food_adj invariant: for every cell, food_adj equals the number of
       its four orthogonal neighbours whose state is food. This class is the
       only writer, and there are exactly three ways the grid's states change:
       setCellType (the funnel for Environment.changeCell and loadRaw, which
       maintains the count incrementally), fillGrid (bulk, rebuilds), and
       resize (fresh cells, all zero and no food). Nothing outside this file
       calls Cell.setType on a grid cell -- if that ever changes, the new
       caller has to maintain the count or rebuild.

       It exists because mouth cells scan their neighbourhood every tick and
       almost never find anything: measured 99.8% empty on the shrubland and
       colony worlds, 99.3% on Epic. One read replaces four lookups on all of
       those, against ~1.7k food writes a tick to keep it honest. */
    bumpFoodAdj(col: number, row: number, delta: number): void {
        if (col > 0)             this.grid[col-1][row].food_adj += delta;
        if (col < this.cols - 1) this.grid[col+1][row].food_adj += delta;
        if (row > 0)             this.grid[col][row-1].food_adj += delta;
        if (row < this.rows - 1) this.grid[col][row+1].food_adj += delta;
    }

    // Recompute the whole invariant from the grid. O(cells), for after a bulk
    // write that did not go through setCellType.
    rebuildFoodAdjacency(): void {
        for (var col of this.grid)
            for (var cell of col)
                cell.food_adj = 0;
        for (var c = 0; c < this.cols; c++)
            for (var r = 0; r < this.rows; r++)
                if (this.grid[c][r].state === CellStates.food)
                    this.bumpFoodAdj(c, r, 1);
    }

    fillGrid(state: CellState, ignore_walls=false): void {
        for (var col of this.grid) {
            for (var cell of col) {
                if (ignore_walls && (cell.state===CellStates.wall || cell.state===CellStates.invincible_wall)) continue;
                cell.setType(state);
                cell.owner = null;
                cell.cell_owner = null;
            }
        }
        // Bulk path: cheaper to recompute once than to track each write, and
        // it cannot drift the way a hand-maintained bulk update could.
        this.rebuildFoodAdjacency();
    }

    cellAt(col: number, row: number): Cell | null {
        if (!this.isValidLoc(col, row)) {
            return null;
        }
        return this.grid[col][row];
    }

    setCellType(col: number, row: number, state: CellState): void {
        if (!this.isValidLoc(col, row)) {
            return;
        }
        var cell = this.grid[col][row];
        // Only a transition across food changes what the neighbours see; a
        // food->food or empty->wall write must not touch the counts.
        var was_food = cell.state === CellStates.food;
        var is_food = state === CellStates.food;
        cell.setType(state);
        if (was_food !== is_food)
            this.bumpFoodAdj(col, row, is_food ? 1 : -1);
    }

    setCellOwner(col: number, row: number, cell_owner: RenderCellOwnerLike | null): void {
        if (!this.isValidLoc(col, row)) {
            return;
        }
        this.grid[col][row].cell_owner = cell_owner;
        if (cell_owner != null)
            /* RenderCellOwnerLike leaves `org` optional, but every real body
               cell carries one. The cast narrows the type only -- the exact
               value written is unchanged. */
            this.grid[col][row].owner = cell_owner.org as RenderOrganismLike | null;
        else
            this.grid[col][row].owner = null;
    }

    isValidLoc(col: number, row: number): boolean {
        return col<this.cols && row<this.rows && col>=0 && row>=0;
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
        for (let col of this.grid) {
            for (let cell of col) {
                if (cell.state===CellStates.wall || cell.state===CellStates.food){
                    let c = {c: cell.col, r: cell.row}; // no need to store state
                    if (cell.state===CellStates.food)
                        grid.food.push(c)
                    else
                        grid.walls.push(c)
                }
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
