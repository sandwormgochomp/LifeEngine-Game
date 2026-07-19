import CellStates from "../CellStates";
import BodyCell from "./BodyCell";

class ShooterCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.shooter, org, loc_col, loc_row);
        this.org.anatomy.has_shooter = true;
    }

    performFunction() {
        // Active effect. Logic is handled by Brain when deciding to shoot
    }
}

export default ShooterCell;
