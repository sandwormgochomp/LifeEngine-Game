import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Neighbors from "../../../Grid/Neighbors";
import Directions from "../../Directions";

class ParasiteCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.parasite, org, loc_col, loc_row);
        this.org.anatomy.has_parasite = true;
    }

    performFunction(): void {
        var env = this.org.env;
        var start_col = this.getRealCol();
        var start_row = this.getRealRow();

        for (var offset of Neighbors.adjacent) {
            var col = start_col + offset[0];
            var row = start_row + offset[1];
            var owner = env.grid_map.ownerAt(col, row);

            if (owner != null && owner !== this.org && owner.food_collected) {
                // Steal 1 food if they have it
                if (owner.food_collected >= 1) {
                    owner.food_collected--;
                    this.org.food_collected++;
                }
            }
        }
    }
}

export default ParasiteCell;
