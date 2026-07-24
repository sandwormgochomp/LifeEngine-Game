import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Neighbors from "../../../Grid/Neighbors";

class PoisonCell extends BodyCell {
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number) {
        super(CellStates.poison, org, loc_col, loc_row);
    }

    performFunction(): void {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Neighbors.adjacent) {
            var owner = env.grid_map.ownerAt(c+loc[0], r+loc[1]);
            if (owner != null && owner !== this.org && owner.living) {
                // Don't poison own species/family
                if (!owner.anatomy.isEqual(this.org.anatomy)) {
                    owner.poison_ticks = this.org.poison_duration;
                }
            }
        }
    }
}

export default PoisonCell;
