import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

class MoverCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.mover, org, loc_col, loc_row);
        this.org.anatomy.is_mover = true;
    }
}

export default MoverCell;
