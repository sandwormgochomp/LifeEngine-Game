import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import Directions from "../../Directions";
import type { Direction } from "../../Directions";
import type { BodyCellOrganism } from "./BodyCell";

// Food per shot. Owned here rather than inline in Organism.shoot, so the cell
// deciding whether it can afford one reads the same number that gets spent.
export const SHOT_COST = 2;

/* Fires at what the organism can see.

   This used to be a no-op with a comment saying the brain handled it, and the
   brain still does -- a `shoot` action fires a shot exactly as before. But it
   made this the only cell type in the game that does nothing when you place
   it. Every other one earns its keep unattended: a mouth eats, a killer kills,
   a producer grows food, an explosive detonates. A shooter needed a mover, an
   eye and a hand-authored brain action before it would do anything at all, and
   nothing in the interface said so -- the lab palette and the README both
   promise "fires at targets the organism sees".

   The sharper half of the argument is evolutionary. A cell that confers no
   benefit unless a human edits its brain can never be selected *for*: a
   mutation that grows one is pure upkeep, so in a world left to run, shooters
   could only ever be bred out. In a simulation about natural selection that is
   a defect rather than a design.

   So each shooter cell now looks for itself and fires down the first cardinal
   direction with something worth hitting. Each acts independently, which also
   settles a wart the bestiary notes had already flagged: extra shooter cells
   used to buy nothing, because only `has_shooter` was ever read.

   What it will not shoot, all three matching what an eye reports:
     - its own kind (same body plan), the rule KillerCell already applies;
     - anything behind a chameleon, which is invisible to sight;
     - anything past the look range, clamped at night the way an eye's is.

   The scan is four rays, guarded on being able to afford a shot at all -- the
   same shape as MouthCell's food_adj early-out. A body that cannot pay does
   not pay to search either, which is the overwhelming majority of ticks. */
class ShooterCell extends BodyCell {
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number) {
        super(CellStates.shooter, org, loc_col, loc_row);
        this.org.anatomy.has_shooter = true;
    }

    performFunction(): void {
        // Cannot afford a shot, so do not pay to look for one.
        if (this.org.food_collected < SHOT_COST) return;
        var dir = this.findTarget();
        if (dir === null) return;
        this.org.shoot(dir);
    }

    /* The first cardinal direction with a target in it, or null. Ties go to
       whichever Directions numbers first; nothing here tries to pick the best
       target, because a turret that reasons about which enemy to prefer is the
       behaviour the brain exists for. */
    findTarget(): Direction | null {
        var dirs: Direction[] = [Directions.up, Directions.right, Directions.down, Directions.left];
        for (var dir of dirs) {
            if (this.seesTargetAlong(dir)) return dir;
        }
        return null;
    }

    /* Walk one ray the way EyeCell.look does, and answer whether the first
       thing it stops on is worth shooting. Deliberately the same traversal:
       this is answering "can the organism see a target that way", and it would
       be a lie for it to see further, or through different things, than its
       eyes do. */
    seesTargetAlong(dir: Direction): boolean {
        var env = this.org.env;
        var grid = env.grid_map;
        var step = Directions.scalars[dir];
        var col = this.getRealCol();
        var row = this.getRealRow();

        var range = this.org.hyperparams.lookRange;
        if (env.is_night) range = Math.min(5, range);

        for (var i = 0; i < range; i++) {
            col += step[0];
            row += step[1];
            var idx = grid.indexAt(col, row);
            if (idx < 0) return false;                          // off the world
            var owner = grid.ownerOf(idx);
            if (owner === this.org) continue;                   // never blocked by itself
            if (owner && owner.anatomy.has_chameleon) continue; // unseen, so unshot
            if (grid.stateOf(idx) === CellStates.empty) continue;
            /* The ray stops on the first solid thing either way; whether that
               is worth a shot is only about what it turned out to be. A wall
               or a scrap of food blocks the line and ends the search. */
            if (!owner || !owner.living) return false;
            // Same body plan means same kind -- KillerCell's own rule for this.
            return !owner.anatomy.isEqual(this.org.anatomy);
        }
        return false;
    }
}

export default ShooterCell;
