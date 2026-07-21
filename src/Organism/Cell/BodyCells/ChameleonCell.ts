import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

class ChameleonCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.chameleon, org, loc_col, loc_row);
        this.org.anatomy.has_chameleon = true;
    }

    performFunction(): void {
        // Passive effect. Logic is handled in EyeCell and Renderer
    }
}

export default ChameleonCell;
