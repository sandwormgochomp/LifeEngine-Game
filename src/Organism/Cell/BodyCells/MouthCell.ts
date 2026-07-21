import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";

/* The grid cell / environment shapes are taken straight off BodyCellOrganism so
   there is only ever one description of them. */
type GridCellLike = ReturnType<BodyCellOrganism['env']['grid_map']['cellAt']>;
type EnvLike = BodyCellOrganism['env'];

class MouthCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.mouth, org, loc_col, loc_row);
    }

    performFunction(): void {
        var env = this.org.env;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        for (var loc of Hyperparams.edibleNeighbors){
            var cell = env.grid_map.cellAt(real_c+loc[0], real_r+loc[1]);
            this.eatNeighbor(cell, env);
        }
    }

    eatNeighbor(n_cell: GridCellLike, env: EnvLike): void {
        if (n_cell == null)
            return;
        if (n_cell.state == CellStates.food){
            env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
            this.org.food_collected++;
        }
    }
}

export default MouthCell;
