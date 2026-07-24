import CellStates from "../CellStates";
import type { CellState } from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";
import Directions from "../../Directions";
import Observation from "../../Perception/Observation";

/* The owning organism as the grid hands it back, taken off BodyCellOrganism so
   the shape is described in one place. */
type OrganismLike = ReturnType<BodyCellOrganism['env']['grid_map']['ownerOf']>;

class EyeCell extends BodyCell{
    /* Not set in the constructor -- one of initInherit/initRandom/initDefault
       always runs immediately afterwards (see BodyCellFactory), and
       OrganismEditor also writes it directly when the user rotates an eye.
       The assertion is about assignment, not about the value being meaningful:
       initInherit copies parent.direction, and on the save-load path
       Anatomy.loadRaw feeds createInherited plain save objects, so a save that
       predates this field assigns undefined here. That is a silent misbehaviour
       (getAbsoluteDirection goes NaN and the eye scans its own cell), not a
       crash, and not what this assertion is claiming. */
    direction!: number;

    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.eye, org, loc_col, loc_row);
        this.org.anatomy.has_eyes = true;
    }

    initInherit(parent: EyeCell): void {
        // deep copy parent values
        super.initInherit(parent);
        this.direction = parent.direction;
    }

    initRandom(): void {
        // initialize values randomly
        this.direction = Directions.getRandomDirection();
    }

    initDefault(): void {
        // initialize to default values
        this.direction = Directions.up;
    }

    getAbsoluteDirection(): number {
        var dir = this.org.rotation + this.direction;
        if (dir > 3)
            dir -= 4;
        return dir;
    }

    performFunction(): void {
        var obs = this.look();
        this.org.brain.observe(obs);
    }

    look(): Observation {
        var env = this.org.env;
        var direction = this.getAbsoluteDirection();
        var addCol = 0;
        var addRow = 0;
        switch(direction) {
            case Directions.up:
                addRow = -1;
                break;
            case Directions.down:
                addRow = 1;
                break;
            case Directions.right:
                addCol = 1;
                break;
            case Directions.left:
                addCol = -1;
                break;
        }
        var start_col = this.getRealCol();
        var start_row = this.getRealRow();
        var col = start_col;
        var row = start_row;
        var grid_map = env.grid_map;
        /* The last cell the ray reached, carried out of the loop the way the
           cell object used to be: null once the ray leaves the grid, which is
           the "saw nothing" observation the brain skips. */
        var state: CellState | null = null;
        var owner: OrganismLike | null = null;

        var maxRange = Hyperparams.lookRange;
        if (env.is_night) {
            maxRange = Math.min(5, maxRange);
        }

        for (var i=0; i<maxRange; i++){
            col+=addCol;
            row+=addRow;
            var idx = grid_map.indexAt(col, row);
            if (idx < 0) {
                state = null;
                owner = null;
                break;
            }
            state = grid_map.stateOf(idx);
            owner = grid_map.ownerOf(idx);
            if (owner === this.org && Hyperparams.seeThroughSelf) {
                continue;
            }
            if (owner && owner !== this.org && owner.anatomy.has_chameleon) {
                continue;
            }
            if (state !== CellStates.empty) {
                var distance = Math.abs(start_col-col) + Math.abs(start_row-row);
                return new Observation(state, owner, distance, direction);
            }
        }
        return new Observation(state, owner, maxRange, direction);
    }
}

export default EyeCell;
