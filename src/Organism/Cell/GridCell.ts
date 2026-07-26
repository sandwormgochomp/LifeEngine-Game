import CellStates from "./CellStates";
import type { CellState, RenderCellOwnerLike, RenderOrganismLike } from "./CellStates";
/* Type-only, and therefore erased: GridMap imports this module for real, so a
   runtime import here would close the cycle. */
import type GridMap from "../../Grid/GridMap";

/* A view onto one cell of a GridMap.
 *
 * The grid itself is columns of typed arrays -- see GridMap -- and holds no per
 * cell object at all. This class is the object the old grid used to store: a
 * (map, index) pair whose accessors read and write straight through to those
 * arrays. It carries no state of its own beyond the index, so a view is always
 * live, and two views of the same cell are interchangeable but NOT identical.
 * Nothing may key a Set or Map on one; the renderer, the wall list and the
 * cursor overlay all track cells by index for exactly that reason.
 *
 * Views are for the cold paths -- controllers, the editor, the bespoke cell
 * renderers, tests -- where one allocation per lookup is free. The simulation's
 * hot paths call GridMap's scalar accessors and never build one.
 */
class Cell {
    map: GridMap;
    idx: number;

    constructor(map: GridMap, idx: number) {
        this.map = map;
        this.idx = idx;
    }

    get col(): number { return (this.idx / this.map.rows) | 0; }
    get row(): number { return this.idx - ((this.idx / this.map.rows) | 0) * this.map.rows; }
    get x(): number { return this.col * this.map.cell_size; }
    get y(): number { return this.row * this.map.cell_size; }

    /* Read-only on purpose. GridMap.setCellType is the only sanctioned writer
       because a state change across `food` has to move the neighbours'
       food_adj counters with it; assigning here would silently drift them, so
       the accessor pair is deliberately half-finished and an assignment throws
       (modules are strict mode) instead of corrupting the invariant. */
    get state(): CellState { return CellStates.all[this.map.state_ids[this.idx]]; }

    get owner(): RenderOrganismLike | null { return this.map.owners[this.idx]; }
    set owner(v: RenderOrganismLike | null) { this.map.owners[this.idx] = v; }

    get cell_owner(): RenderCellOwnerLike | null { return this.map.cell_owners[this.idx]; }
    set cell_owner(v: RenderCellOwnerLike | null) { this.map.cell_owners[this.idx] = v; }

    /* How many of the four orthogonally adjacent cells hold food. Maintained
       exclusively by GridMap -- see the invariant note there -- so that a mouth
       cell can rule out its whole neighbourhood with one read instead of four
       grid lookups. Never serialized: it is derived state, rebuilt from the
       grid whenever a bulk write lands. */
    get food_adj(): number { return this.map.food_adj[this.idx]; }

    /* Meaningful only while the cell is a wall; 0 for every other state, which
       is what setCellType writes on the way out of `wall`. */
    get durability(): number { return this.map.durability[this.idx]; }
    set durability(v: number) { this.map.durability[this.idx] = v; }

    /* Set by Renderer when a dirty cell was skipped because it was off screen
       (or a big-world full repaint deferred it); cleared when it is drawn.
       Renderer.updateView repaints stale cells as pan/zoom reveals them. */
    get stale(): boolean { return this.map.stale_flags[this.idx] !== 0; }
    set stale(v: boolean) { this.map.stale_flags[this.idx] = v ? 1 : 0; }

    /* Petri-dish glass, written by WorldEnvironment.buildPetriDish and read
       back by InvincibleWall.render. Tier 0 means "not glass", so the one
       array answers both questions and both stay unallocated on the worlds
       that have no dish. */
    get dish_glass(): boolean { return this.map.dishTierOf(this.idx) !== 0; }
    get dish_tier(): number { return this.map.dishTierOf(this.idx); }
    get dish_light(): number { return this.map.dishLightOf(this.idx); }
    get dish_active(): boolean { return this.map.dish_tier !== null; }
}

export default Cell;
