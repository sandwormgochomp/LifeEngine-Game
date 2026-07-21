import CellStates from "./CellStates";
import type { CellState, RenderCellOwnerLike, RenderOrganismLike } from "./CellStates";
import Hyperparams from "../../Hyperparameters";

// A cell exists in a grid map.
class Cell{
    /* Assigned through setType() rather than directly, hence the definite
       assignment assertion. */
    state!: CellState;
    owner: RenderOrganismLike | null;
    cell_owner: RenderCellOwnerLike | null;
    col: number;
    row: number;
    x: number;
    y: number;
    /* Only present on wall cells -- setType() deletes it for every other
       state, so it has to stay optional. */
    durability?: number;
    /* Bolted on externally by WorldEnvironment.buildPetriDish and read back by
       InvincibleWall.render. */
    dish_glass?: boolean;
    dish_tier?: number;
    dish_light?: number;

    constructor(state: CellState, col: number, row: number, x: number, y: number){
        this.owner = null; // owner organism
        this.cell_owner = null; // specific body cell of the owner organism that occupies this grid cell
        this.setType(state);
        this.col = col;
        this.row = row;
        this.x = x;
        this.y = y;
    }

    setType(state: CellState): void {
        this.state = state;
        if (state === CellStates.wall) {
            this.durability = Hyperparams.wallDurability;
        } else {
            delete this.durability;
        }
    }
}

export default Cell;
