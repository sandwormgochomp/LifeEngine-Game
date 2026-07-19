const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Neighbors = require("../../../Grid/Neighbors");
const Directions = require("../../Directions");

class ParasiteCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.parasite, org, loc_col, loc_row);
        this.org.anatomy.has_parasite = true;
    }

    performFunction() {
        var env = this.org.env;
        var start_col = this.getRealCol();
        var start_row = this.getRealRow();

        for (var offset of Neighbors.adjacent) {
            var col = start_col + offset[0];
            var row = start_row + offset[1];
            var cell = env.grid_map.cellAt(col, row);
            
            if (cell != null && cell.owner != null && cell.owner !== this.org && cell.owner.food_collected) {
                // Steal 1 food if they have it
                if (cell.owner.food_collected >= 1) {
                    cell.owner.food_collected--;
                    this.org.food_collected++;
                }
            }
        }
    }
}

module.exports = ParasiteCell;
