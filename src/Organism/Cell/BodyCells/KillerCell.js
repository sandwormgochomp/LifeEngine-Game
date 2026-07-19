const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class KillerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Hyperparams.killableNeighbors) {
            var cell = env.grid_map.cellAt(c+loc[0], r+loc[1]);
            this.killNeighbor(cell);
        }
    }

    killNeighbor(n_cell) {
        if(n_cell == null) 
            return;
        if (n_cell.state == CellStates.wall) {
            if (typeof n_cell.durability !== 'undefined') {
                n_cell.durability--;
                if (n_cell.durability <= 0) {
                    this.org.env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
                }
            } else {
                this.org.env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
            }
            return;
        }
        if(n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living || n_cell.state == CellStates.armor) 
            return;
        if(n_cell.owner.anatomy.isEqual(this.org.anatomy))
            return; // Don't attack own species
        var is_hit = n_cell.state == CellStates.killer; // has to be calculated before death
        if (n_cell.state == CellStates.poison) {
            this.org.poison_ticks = 10; // Apply poison for 10 ticks
        }
        n_cell.owner.harm();
        if (Hyperparams.instaKill && is_hit) {
            this.org.harm();
        }
    }
}

module.exports = KillerCell;
