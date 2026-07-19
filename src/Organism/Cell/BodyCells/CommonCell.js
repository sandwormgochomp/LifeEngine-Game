import CellStates from "../CellStates";
import BodyCell from "./BodyCell";

class CommonCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.common, org, loc_col, loc_row);
    }
}

export default CommonCell;
