const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class PoisonCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.poison, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        const Neighbors = require("../../../Grid/Neighbors");
        for (var loc of Neighbors.adjacent) {
            var cell = env.grid_map.cellAt(c+loc[0], r+loc[1]);
            if (cell != null && cell.owner != null && cell.owner !== this.org && cell.owner.living) {
                // Don't poison own species/family
                if (!cell.owner.anatomy.isEqual(this.org.anatomy)) {
                    cell.owner.poison_ticks = this.org.poison_duration;
                }
            }
        }
    }
}

module.exports = PoisonCell;
