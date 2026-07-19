const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class ExplosiveCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.explosive, org, loc_col, loc_row);
    }

    explode() {
        var env = this.org.env;
        var center_c = this.getRealCol();
        var center_r = this.getRealRow();
        var radius = parseInt(Hyperparams.explosionRadius);
        if (isNaN(radius)) {
            radius = 2;
        }

        for (var c_offset = -radius; c_offset <= radius; c_offset++) {
            for (var r_offset = -radius; r_offset <= radius; r_offset++) {
                if (c_offset * c_offset + r_offset * r_offset <= radius * radius) {
                    var target_c = center_c + c_offset;
                    var target_r = center_r + r_offset;
                    var cell = env.grid_map.cellAt(target_c, target_r);
                    if (cell == null) continue;

                    // If it is another organism cell, harm it
                    if (cell.owner != null && cell.owner !== this.org && cell.owner.living) {
                        cell.owner.harm();
                    }

                    // Deal 10 damage to walls, or immediately convert independent/our own cells to explosions
                    if (cell.state === CellStates.wall) {
                        if (typeof cell.durability !== 'undefined') {
                            cell.durability -= 10;
                            if (cell.durability <= 0) {
                                env.changeCell(target_c, target_r, CellStates.explosion, null);
                                env.active_explosions.push({col: target_c, row: target_r, ticks: 3});
                            }
                        } else {
                            env.changeCell(target_c, target_r, CellStates.explosion, null);
                            env.active_explosions.push({col: target_c, row: target_r, ticks: 3});
                        }
                    } else if (cell.owner == null || cell.owner === this.org) {
                        env.changeCell(target_c, target_r, CellStates.explosion, null);
                        env.active_explosions.push({col: target_c, row: target_r, ticks: 3});
                    }
                }
            }
        }
    }
}

module.exports = ExplosiveCell;
