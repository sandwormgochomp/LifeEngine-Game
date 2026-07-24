import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

class KillerCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    performFunction(): void {
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of this.org.hyperparams.killableNeighbors) {
            this.killNeighbor(c+loc[0], r+loc[1]);
        }
    }

    killNeighbor(col: number, row: number): void {
        var env = this.org.env;
        var grid = env.grid_map;
        var idx = grid.indexAt(col, row);
        if(idx < 0)
            return;
        var state = grid.stateOf(idx);
        if (state == CellStates.wall) {
            /* Every cell now carries a durability (0 off a wall) instead of
               the property GridMap used to delete, so the undefined-durability
               branch this used to carry is gone: a wall always has hit points
               to take off, and damageWall says when they run out. */
            if (grid.damageWall(idx, 1)) {
                env.changeCell(col, row, CellStates.empty, null);
            }
            return;
        }
        var owner = grid.ownerOf(idx);
        if(owner == null || owner == this.org || !owner.living || state == CellStates.armor)
            return;
        if(owner.anatomy.isEqual(this.org.anatomy))
            return; // Don't attack own species
        var is_hit = state == CellStates.killer; // has to be calculated before death
        if (state == CellStates.poison) {
            this.org.poison_ticks = 10; // Apply poison for 10 ticks
        }
        owner.harm();
        if (this.org.hyperparams.instaKill && is_hit) {
            this.org.harm();
        }
    }
}

export default KillerCell;
