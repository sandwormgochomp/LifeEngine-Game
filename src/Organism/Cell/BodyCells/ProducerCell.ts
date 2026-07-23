import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";

class ProducerCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.producer, org, loc_col, loc_row);
        this.org.anatomy.is_producer = true;
    }

    performFunction(): void {
        if (this.org.anatomy.is_mover && !Hyperparams.moversCanProduce)
            return;
        /* The roll comes first: at the default 5% production chance this
           returns for 19 of every 20 producer cells, where the coordinate
           math and grid lookup below used to be paid by all twenty. Same
           Math.random() calls in the same order, so production behaviour is
           unchanged. Worth knowing before optimizing further here: this
           measured no aggregate tick improvement on the plant-heavy
           shrubland world (org_cells 2.46 -> 2.46 us/org-tick over 5 trials
           of 120 ticks). It is kept for being strictly less work and for
           reading in the order it happens, not for a measured win -- the
           per-cell loop's cost is grid-lookup volume, not this arithmetic. */
        if (Math.random() * 100 > Hyperparams.foodProdProb)
            return;
        var env = this.org.env;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        var loc = Hyperparams.growableNeighbors[Math.floor(Math.random() * Hyperparams.growableNeighbors.length)]
        var loc_c=loc[0];
        var loc_r=loc[1];
        var cell = env.grid_map.cellAt(real_c+loc_c, real_r+loc_r);
        if (cell != null && cell.state == CellStates.empty){
            env.changeCell(real_c+loc_c, real_r+loc_r, CellStates.food, null);
        }
    }
}

export default ProducerCell;
