import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";

class ExplosiveCell extends BodyCell {
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number) {
        super(CellStates.explosive, org, loc_col, loc_row);
    }

    explode(): void {
        var env = this.org.env;
        var center_c = this.getRealCol();
        var center_r = this.getRealRow();
        /* Hyperparams.explosionRadius is seeded as a number by setDefaults, but
           loadJsonObj/the settings UI can write a string into it, which is why
           this parses. The cast reflects that wider runtime reality rather than
           the narrower type inferred from the untyped Hyperparameters.js. */
        var radius = parseInt(Hyperparams.explosionRadius as unknown as string);
        if (isNaN(radius)) {
            radius = 2;
        }

        for (var c_offset = -radius; c_offset <= radius; c_offset++) {
            for (var r_offset = -radius; r_offset <= radius; r_offset++) {
                if (c_offset * c_offset + r_offset * r_offset <= radius * radius) {
                    var target_c = center_c + c_offset;
                    var target_r = center_r + r_offset;
                    var idx = env.grid_map.indexAt(target_c, target_r);
                    if (idx < 0) continue;
                    var owner = env.grid_map.ownerOf(idx);

                    // If it is another organism cell, harm it
                    if (owner != null && owner !== this.org && owner.living) {
                        owner.harm();
                    }

                    // Deal 10 damage to walls, or immediately convert independent/our own cells to explosions
                    if (env.grid_map.stateOf(idx) === CellStates.wall) {
                        /* Every cell carries a durability now (0 off a wall),
                           so the undefined-durability branch this used to
                           carry is gone -- see KillerCell.killNeighbor. */
                        if (env.grid_map.damageWall(idx, 10)) {
                            env.changeCell(target_c, target_r, CellStates.explosion, null);
                            env.active_explosions.push({col: target_c, row: target_r, ticks: 3});
                        }
                    /* Re-read rather than reusing `owner`: the harm() above can
                       have killed that organism, which turns its cells to food
                       and clears their owner -- and this branch has to see the
                       cell as it is now, exactly as the live cell object it
                       replaces did. */
                    } else if (env.grid_map.ownerOf(idx) == null || env.grid_map.ownerOf(idx) === this.org) {
                        env.changeCell(target_c, target_r, CellStates.explosion, null);
                        env.active_explosions.push({col: target_c, row: target_r, ticks: 3});
                    }
                }
            }
        }
    }
}

export default ExplosiveCell;
