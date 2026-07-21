import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";

/* Taken off BodyCellOrganism so the grid cell shape is described in one place. */
type GridCellLike = ReturnType<BodyCellOrganism['env']['grid_map']['cellAt']>;

class KillerCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    performFunction(): void {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Hyperparams.killableNeighbors) {
            var cell = env.grid_map.cellAt(c+loc[0], r+loc[1]);
            this.killNeighbor(cell);
        }
    }

    killNeighbor(n_cell: GridCellLike): void {
        if(n_cell == null)
            return;
        if (n_cell.state == CellStates.wall) {
            if (typeof n_cell.durability !== 'undefined') {
                n_cell.durability--;
                if (n_cell.durability <= 0) {
                    this.org.env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
                }
            } else {
                this.org.env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
            }
            return;
        }
        if(n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living || n_cell.state == CellStates.armor)
            return;
        if(n_cell.owner.anatomy.isEqual(this.org.anatomy))
            return; // Don't attack own species
        var is_hit = n_cell.state == CellStates.killer; // has to be calculated before death
        if (n_cell.state == CellStates.poison) {
            this.org.poison_ticks = 10; // Apply poison for 10 ticks
        }
        n_cell.owner.harm();
        if (Hyperparams.instaKill && is_hit) {
            this.org.harm();
        }
    }
}

export default KillerCell;
