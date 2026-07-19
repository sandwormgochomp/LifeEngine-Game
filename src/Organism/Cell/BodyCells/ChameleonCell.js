const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class ChameleonCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.chameleon, org, loc_col, loc_row);
        this.org.anatomy.has_chameleon = true;
    }

    performFunction() {
        // Passive effect. Logic is handled in EyeCell and Renderer
    }
}

module.exports = ChameleonCell;
