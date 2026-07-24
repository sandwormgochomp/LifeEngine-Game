import CellStates from "../CellStates";
import type { CellState } from "../CellStates";
import type Observation from "../../Perception/Observation";
import Directions from "../../Directions";
import type { Direction } from "../../Directions";
import type Organism from "../../Organism";

/* The body-cell hierarchy's view of its owning Organism. This was a
   hand-maintained structural mirror of Organism while Organism was untyped;
   it is now the real class. The import is type-only and therefore erased, so
   it closes no runtime cycle -- which matters, because Organism does sit above
   this file in the runtime dependency order (Organism -> Anatomy ->
   BodyCellFactory -> every BodyCell). The alias is kept as the name the 14
   subclasses spell so that the boundary stays greppable. */
export type BodyCellOrganism = Organism;

// A body cell defines the relative location of the cell in it's parent organism. It also defines their functional behavior.
class BodyCell{
    state: CellState;
    org: BodyCellOrganism;
    loc_col: number;
    loc_row: number;
    custom_color: string | null;

    constructor(state: CellState, org: BodyCellOrganism, loc_col: number, loc_row: number){
        this.state = state;
        this.org = org;
        this.loc_col = loc_col;
        this.loc_row = loc_row;
        this.custom_color = null;

        var distance = Math.max(Math.abs(loc_row)*2 + 2, Math.abs(loc_col)*2 + 2);
        if (this.org.anatomy.birth_distance < distance) {
            this.org.anatomy.birth_distance = distance;
        }
    }

    initInherit(parent: BodyCell) {
        // deep copy parent values
        this.loc_col = parent.loc_col;
        this.loc_row = parent.loc_row;
        this.custom_color = parent.custom_color;
    }

    initRandom() {
        // initialize values randomly
    }

    initDefault() {
        // initialize to default values
    }

    /* No parameter: all fourteen subclasses override this as performFunction(),
       and the sole caller (Organism.update) passes nothing. The `env` parameter
       the JS declared here was vestigial -- never supplied, never read. */
    performFunction() {
        // default behavior: none
    }


    getRealCol() {
        return this.org.c + this.rotatedCol(this.org.rotation);
    }

    getRealRow() {
        return this.org.r + this.rotatedRow(this.org.rotation);
    }

    /* The linear grid index this cell currently sits on, or -1 if the organism
       hangs off the edge of the world. Organism.getRealCellIndex is the same
       query for a cell that is not `this`. */
    getRealCellIndex() {
        return this.org.env.grid_map.indexAt(this.getRealCol(), this.getRealRow());
    }

    /* No default branch: `dir` is always one of the four Directions values in
       practice, so every real call returns a number. Once Directions exports a
       literal union these switches become provably exhaustive and the inferred
       return type stays `number` under strictNullChecks -- without adding a
       default arm that would change behavior. */
    rotatedCol(dir: Direction){
        switch(dir){
            case Directions.up:
                return this.loc_col;
            case Directions.down:
                return this.loc_col * -1;
            case Directions.left:
                return this.loc_row;
            case Directions.right:
                return this.loc_row * -1;
        }
    }

    rotatedRow(dir: Direction){
        switch(dir){
            case Directions.up:
                return this.loc_row;
            case Directions.down:
                return this.loc_row * -1;
            case Directions.left:
                return this.loc_col * -1;
            case Directions.right:
                return this.loc_col;
        }
    }
}

export default BodyCell;
