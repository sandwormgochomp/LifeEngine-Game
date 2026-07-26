import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import { makeBlast } from "../../../Rendering/ExplosionFx";
import type { BodyCellOrganism } from "./BodyCell";

class ExplosiveCell extends BodyCell {
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number) {
        super(CellStates.explosive, org, loc_col, loc_row);
    }

    /* Light the fuse. The charge no longer goes off inside die(): it is armed
       here and lands FUSE_TICKS later, when EnvironmentEffects.stepBlasts()
       calls detonate() on it -- which is what buys the telegraph its beat of
       anticipation, and what makes the blast something a neighbour can be
       caught walking into.

       `body` is the dying organism's footprint, passed in by die() so that
       every charge in one body shares a single array (a predator bomber carries
       three); it is what the telegraph blinks. */
    arm(body: number[]): void {
        /* Hyperparams.explosionRadius is seeded as a number by setDefaults, but
           loadJsonObj/the settings UI can write a string into it, which is why
           this parses. The cast reflects that wider runtime reality rather than
           the narrower type inferred from the untyped Hyperparameters.js. */
        var radius = parseInt(this.org.hyperparams.explosionRadius as unknown as string);
        if (isNaN(radius)) {
            radius = 2;
        }
        this.org.env.active_blasts.push(makeBlast(this.getRealCol(), this.getRealRow(), radius, body));
    }
}

export default ExplosiveCell;
