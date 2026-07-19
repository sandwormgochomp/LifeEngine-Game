const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class CommonCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.common, org, loc_col, loc_row);
    }
}

module.exports = CommonCell;
