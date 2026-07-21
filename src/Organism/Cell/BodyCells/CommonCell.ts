import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

class CommonCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.common, org, loc_col, loc_row);
    }
}

export default CommonCell;
