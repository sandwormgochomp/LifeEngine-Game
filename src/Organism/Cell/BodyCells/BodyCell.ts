import CellStates from "../CellStates";
import type { CellState } from "../CellStates";
import type Observation from "../../Perception/Observation";
import Directions from "../../Directions";
import type { Direction } from "../../Directions";

/* The slice of Organism that the body-cell hierarchy reaches through. Organism
   sits far above this file in the dependency order (it imports Anatomy, which
   imports BodyCellFactory, which imports every BodyCell), so importing the real
   class here would close a cycle. Declared structurally instead: the real
   Organism satisfies this, and once Organism is converted this should collapse
   into `import type { Organism }` -- a type-only import is erased, so it closes
   no runtime cycle.

   Subclasses that need more of Organism should widen this interface rather than
   declaring their own. */
export interface BodyCellOrganism {
    c: number;
    r: number;
    /* One of the four cardinal directions, not an arbitrary number: this feeds
       rotatedCol/rotatedRow, whose switches are only exhaustive over Direction. */
    rotation: Direction;
    /* Whether the organism is still alive. Read by ExplosiveCell, KillerCell and
       PoisonCell before harming a neighbour's owner. */
    living: boolean;
    /* Food store. MouthCell and ParasiteCell increment it, HealerCell and
       ParasiteCell spend it. */
    food_collected: number;
    /* Accumulated damage and the per-heal food price -- both HealerCell. */
    damage: number;
    healer_food_cost: number;
    /* Set by the brain when it decides to heal; cleared by HealerCell. */
    brain_triggered_heal: boolean;
    /* Poison bookkeeping: KillerCell writes a fixed 10 onto itself when it bites
       a poison cell, PoisonCell writes its own poison_duration onto victims. */
    poison_ticks: number;
    poison_duration: number;
    /* EyeCell feeds its raycast result to the brain. Brain is still untyped JS,
       so only the one method reached through is declared. */
    brain: { observe(observation: Observation): void };
    /* Applied to neighbours by ExplosiveCell/KillerCell/PoisonCell, and to self
       by KillerCell under instaKill. */
    harm(): void;
    /* PheromoneCell's whole behaviour. */
    emitPheromoneSignal(state_to_emit: CellState): void;
    anatomy: {
        birth_distance: number;
        /* Capability flags each body cell raises on construction: MoverCell,
           ProducerCell, EyeCell, HealerCell, ParasiteCell, ChameleonCell,
           ShooterCell respectively. ProducerCell also reads is_mover and
           HealerCell reads has_eyes. EyeCell reads has_chameleon off the
           anatomy of the organism it is looking at. */
        is_mover: boolean;
        is_producer: boolean;
        has_eyes: boolean;
        has_healer: boolean;
        has_parasite: boolean;
        has_chameleon: boolean;
        has_shooter: boolean;
        /* Species comparison used by KillerCell and PoisonCell to avoid
           attacking kin. */
        isEqual(anatomy: BodyCellOrganism['anatomy']): boolean;
    };
    env: {
        /* cellAt's result is the untyped GridCell class; described structurally
           here because every body cell reaches through it. `owner` is itself an
           organism, so it is typed as this same interface. */
        grid_map: {
            cellAt(col: number, row: number): {
                state: CellState;
                owner: BodyCellOrganism | null;
                cell_owner: unknown;
                col: number;
                row: number;
                /* Only present while the cell is a wall -- GridCell.setType
                   deletes it otherwise. ExplosiveCell and KillerCell both
                   typeof-guard before touching it. */
                durability?: number;
            } | null;
        };
        /* ExplosiveCell, KillerCell, MouthCell and ProducerCell all rewrite grid
           cells. */
        changeCell(c: number, r: number, state: CellState, owner: BodyCellOrganism | null): void;
        /* ExplosiveCell queues the explosion cells it just painted. */
        active_explosions: { col: number; row: number; ticks: number }[];
        /* EyeCell halves its look range at night. */
        is_night: boolean;
    };
}

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

    getRealCell() {
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        return this.org.env.grid_map.cellAt(real_c, real_r);
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
