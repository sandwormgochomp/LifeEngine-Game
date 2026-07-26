import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

/* How many brain cells one body needs before it can build a wall.

   Lives here rather than in Hyperparameters because it is the *definition* of
   what a brain cell is for, not a dial on the world: every other tunable in
   Hyperparameters changes how strongly an existing behaviour pays, whereas
   this number is the behaviour. Exported so that Organism.buildWall and the
   palette's description quote one figure instead of two that can drift. */
export const WALL_BRAIN_CELLS = 10;

/* Nervous tissue. The only cell type with no per-tick function at all: it is
   counted, not run.

   That is the whole design. Every other cell earns its place one at a time --
   a single mouth eats, a single killer kills -- so a body pays for what it
   uses cell by cell. A brain cell alone does nothing and is pure upkeep
   (lifespan and the food to reproduce both scale with cell count), and only
   the tenth one in the same body turns wall-building on. Building is therefore
   something a lineage has to commit to rather than stumble into by a lucky
   mutation, which is what makes a wall-builder worth recognising when one
   finally evolves. */
class BrainCell extends BodyCell {
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number) {
        super(CellStates.brain, org, loc_col, loc_row);
    }
}

export default BrainCell;
