import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

/* Taken straight off BodyCellOrganism so there is only ever one description. */
type EnvLike = BodyCellOrganism['env'];

/* GridMap's food_adj counter covers the four orthogonal neighbours, so the
   fast path below is only sound while the edible set is exactly those four.
   That set is configurable and arrives from a saved world's controls as a
   fresh plain array, so it is checked by value rather than by identity
   against Neighbors.adjacent -- and memoised on the array's identity, which
   changes only when controls are loaded (or when a preview organism reads its
   own injected set). Any other set (Neighbors.all, a custom range) simply
   falls back to the full scan. */
let cached_edible: number[][] | null = null;
let cached_is_orthogonal = false;

function edibleIsOrthogonal(set: number[][]): boolean {
    if (set === cached_edible)
        return cached_is_orthogonal;
    cached_edible = set;
    var mask = 0;
    for (var i = 0; i < set.length; i++) {
        var c = set[i][0], r = set[i][1];
        if (c === 0 && r === 1) mask |= 1;
        else if (c === 0 && r === -1) mask |= 2;
        else if (c === 1 && r === 0) mask |= 4;
        else if (c === -1 && r === 0) mask |= 8;
        else { mask = -1; break; } // an offset the counter does not cover
    }
    // All four present and nothing else; duplicates leave a bit unset.
    cached_is_orthogonal = mask === 15;
    return cached_is_orthogonal;
}

class MouthCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.mouth, org, loc_col, loc_row);
    }

    performFunction(): void {
        var env = this.org.env;
        var edible = this.org.hyperparams.edibleNeighbors;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        /* Rule the whole neighbourhood out with one read. The mouth's own
           cell carries the count of adjacent food, so food_adj === 0 means
           the scan below could not find anything -- which is the case for
           99%+ of mouth cells on every world measured. A mouth standing off
           the grid gets -1 rather than 0, and so falls through to the scan. */
        if (edibleIsOrthogonal(edible) && env.grid_map.foodAdjAt(real_c, real_r) === 0)
            return;
        for (var loc of edible){
            this.eatNeighbor(real_c+loc[0], real_r+loc[1], env);
        }
    }

    eatNeighbor(col: number, row: number, env: EnvLike): void {
        if (env.grid_map.stateAt(col, row) == CellStates.food){
            env.changeCell(col, row, CellStates.empty, null);
            this.org.food_collected++;
        }
    }
}

export default MouthCell;
