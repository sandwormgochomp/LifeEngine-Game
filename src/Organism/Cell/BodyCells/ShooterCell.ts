import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

class ShooterCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.shooter, org, loc_col, loc_row);
        this.org.anatomy.has_shooter = true;
    }

    performFunction(): void {
        // Active effect. Logic is handled by Brain when deciding to shoot
    }
}

export default ShooterCell;
