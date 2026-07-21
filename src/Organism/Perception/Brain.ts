import Hyperparams from "../../Hyperparameters";
import Directions from "../Directions";
import CellStates from "../Cell/CellStates";
import type { CellName } from "../Cell/CellStates";
import type Observation from "./Observation";
/* Type-only: Organism imports Brain for its value (`new Brain(this)`), so a
   value import back would close a runtime cycle. `import type` is erased. */
import type Organism from "../Organism";

/* Weights and actions are keyed by cell state name. Both are partial on
   purpose: saved worlds predating a cell type arrive without its key, which is
   exactly what the `=== undefined` probes below and in load() are for. */
export type DecisionWeights = Partial<Record<CellName, number>>;
export type BrainActions = Partial<Record<CellName, string>>;

export interface BrainTransition {
    condition_type: string;
    operator: string;
    value: number;
    target: number;
}

export interface BrainState {
    name: string;
    decisions: DecisionWeights;
    actions: BrainActions;
    transitions: BrainTransition[];
}

const Decision = {
    neutral: 0,
    retreat: 1,
    chase: 2,
    getRandom: function(){
        return Math.floor(Math.random() * 3);
    },
    getRandomNonNeutral: function() {
        return Math.floor(Math.random() * 2)+1;
    }
}

class Brain {
    static Decision = Decision;

    owner: Organism;
    observations: Observation[];
    active_state_index: number;
    states: BrainState[];

    constructor(owner: Organism){
        this.owner = owner;
        this.observations = [];

        this.active_state_index = 0; // The state currently active in simulation

        this.states = [
            {
                name: "State 1",
                decisions: this.createDefaultDecisions(),
                actions: {},
                transitions: []
            }
        ];
    }

    createDefaultDecisions(): DecisionWeights {
        let decs: DecisionWeights = {};
        for (let cell of CellStates.all) {
            decs[cell.name] = 0;
        }
        decs[CellStates.food.name] = 10;
        decs[CellStates.killer.name] = -10;
        decs[CellStates.pheromone.name] = 10;
        return decs;
    }

    get decisions(): DecisionWeights {
        if (!this.states[this.active_state_index]) this.active_state_index = 0;
        return this.states[this.active_state_index].decisions;
    }

    copy(brain: Brain): void {
        this.states = JSON.parse(JSON.stringify(brain.states)) as BrainState[];
        this.active_state_index = 0;
    }

    getRandomWeight(): number {
        // Return a weight matching one of the reactions
        const weights = [-10, -8, -5, -2, 0, 2, 5, 8, 10];
        return weights[Math.floor(Math.random() * weights.length)];
    }

    randomizeDecisions(randomize_all=false): void {
        for (let s = 0; s < this.states.length; s++) {
            let decs = this.states[s].decisions;
            if (randomize_all) {
                decs[CellStates.food.name] = this.getRandomWeight();
                decs[CellStates.killer.name] = this.getRandomWeight();
                if (decs[CellStates.pheromone.name] !== undefined)
                    decs[CellStates.pheromone.name] = this.getRandomWeight();
            }
            decs[CellStates.mouth.name] = this.getRandomWeight();
            decs[CellStates.producer.name] = this.getRandomWeight();
            decs[CellStates.mover.name] = this.getRandomWeight();
            decs[CellStates.armor.name] = this.getRandomWeight();
            decs[CellStates.eye.name] = this.getRandomWeight();
            decs[CellStates.healer.name] = this.getRandomWeight();
            decs[CellStates.explosive.name] = this.getRandomWeight();
            if (decs[CellStates.poison.name] !== undefined)
                decs[CellStates.poison.name] = this.getRandomWeight();
        }
    }

    observe(observation: Observation): void {
        this.observations.push(observation);
    }

    evaluateCondition(transition: BrainTransition): boolean {
        let val1 = 0;
        if (transition.condition_type === "Health") {
            val1 = (this.owner.damage / this.owner.maxHealth()) * 100;
            // E.g. damage=2, max=4 => 50%. So health is 50%. Wait, this is DAMAGE percentage.
            // "Health < 50" means damage > 50%. Let's use actual health percentage.
            val1 = 100 - val1;
        } else if (transition.condition_type === "Food") {
            val1 = (this.owner.food_collected / this.owner.foodNeeded()) * 100;
        } else if (transition.condition_type === "Always") {
            return true;
        }

        /* parseFloat is declared to take a string, but `value` is a number both
           in saves and in the editor. The cast keeps the call byte-for-byte
           what it was (parseFloat stringifies its argument itself) rather than
           wrapping it in String(). */
        let val2 = parseFloat(transition.value as unknown as string);
        if (transition.operator === "<") return val1 < val2;
        if (transition.operator === ">") return val1 > val2;
        if (transition.operator === "=") return val1 === val2;
        return false;
    }

    updateState(): void {
        if (!this.states[this.active_state_index]) this.active_state_index = 0;
        let current_state = this.states[this.active_state_index];
        for (let t of current_state.transitions) {
            if (this.evaluateCondition(t)) {
                if (this.states[t.target]) {
                    this.active_state_index = t.target;
                    break;
                }
            }
        }
    }

    decide(): boolean {
        /* Keyed by direction. Declared with a string index signature because
           the aggregation loop below walks it with for...in, which yields
           string keys. */
        var direction_weights: Record<string, number> = {0: 0, 1: 0, 2: 0, 3: 0};
        var best_dir = -1;
        var highest_weight = 0;

        let active_decs = this.decisions;
        let active_acts = this.states[this.active_state_index].actions || {};

        let should_explode = false;
        let should_heal = false;
        let should_hibernate = false;
        let should_build = false;
        let should_shoot = false;

        for (var obs of this.observations) {
            if (obs.cell == null || obs.cell.owner == this.owner) {
                continue;
            }

            var act = active_acts[obs.cell.state.name];
            if (act === "explode" && this.owner.anatomy.has_explosive) should_explode = true;
            if (act === "heal" && this.owner.anatomy.has_healer) should_heal = true;
            if (act === "hibernate") should_hibernate = true;
            if (act === "build") should_build = true;
            if (act === "shoot" && this.owner.anatomy.has_shooter) should_shoot = true;

            var weight = active_decs[obs.cell.state.name];
            if (weight === undefined || weight == 0) continue;

            // Attenuate weight by distance
            var adjusted_weight = weight / (obs.distance + 1);

            if (weight > 0) {
                direction_weights[obs.direction] += adjusted_weight;
            } else if (weight < 0) {
                /* getOppositeDirection has no default case, so it is typed
                   `number | undefined`; every direction observed here is one of
                   the four cardinals, which all match. */
                var opposite = Directions.getOppositeDirection(obs.direction);
                direction_weights[opposite!] += Math.abs(adjusted_weight);
            }
        }

        for (var dir in direction_weights) {
            if (direction_weights[dir] > highest_weight) {
                highest_weight = direction_weights[dir];
                best_dir = parseInt(dir);
            }
        }

        this.observations = [];

        if (should_explode) {
            this.owner.die(); // Triggers explosive cell
            return true;
        }

        if (should_heal) {
            this.owner.brain_triggered_heal = true;
        }

        if (should_hibernate) {
            this.owner.hibernating = true;
        }

        if (should_build) {
            this.owner.buildWall();
        }

        if (should_shoot) {
            this.owner.shoot();
        }

        if (best_dir !== -1) {
            this.owner.changeDirection(best_dir);
            return true;
        }
        return false;
    }

    mutate(): void {
        let s = Math.floor(Math.random() * this.states.length);
        this.states[s].decisions[CellStates.getRandomName()] = this.getRandomWeight();
        this.states[s].decisions[CellStates.empty.name] = 0;
    }

    serialize(): { states: BrainState[] } {
        return {states: this.states};
    }

    load(data: unknown): void {
        /* Three generations of save format land here, distinguished exactly as
           they were: a `states` array of full state objects (modern), a
           `states` array of bare decision dicts (legacy), or a top-level
           `decisions` dict (oldest). Narrowed by a single loose cast rather
           than by Array.isArray-style guards so that every branch condition
           below stays literally the expression the JS evaluated. */
        const raw = data as {
            states?: Partial<BrainState>[];
            condition?: number;
            decisions?: DecisionWeights;
        };
        if (raw.states) {
            if (raw.states.length > 0 && raw.states[0].decisions === undefined) {
                // Backwards compatibility for previous 2-state array of decisions
                this.states = raw.states.map((decs, i) => ({
                    name: "State " + (i+1),
                    /* In this format the array elements *are* the decision
                       dicts, not state objects. */
                    decisions: decs as unknown as DecisionWeights,
                    actions: {},
                    transitions: []
                }));
                // Try to port condition over if it existed
                if (raw.condition !== undefined && raw.condition > 0 && this.states.length > 1) {
                    if (raw.condition === 1) {
                        this.states[0].transitions.push({condition_type: "Health", operator: "<", value: 50, target: 1});
                        this.states[1].transitions.push({condition_type: "Health", operator: ">", value: 50, target: 0});
                    } else if (raw.condition === 2) {
                        this.states[0].transitions.push({condition_type: "Food", operator: "<", value: 50, target: 1});
                        this.states[1].transitions.push({condition_type: "Food", operator: ">", value: 50, target: 0});
                    }
                }
            } else {
                this.states = raw.states as BrainState[];
            }

            // Ensure all states have actions and all cell types are present
            for (let s of this.states) {
                if (!s.actions) s.actions = {};
                for (let cell of CellStates.all) {
                    if (s.decisions[cell.name] === undefined) {
                        s.decisions[cell.name] = 0;
                    }
                }
            }
        } else if (raw.decisions) {
            // Backwards compatibility for single decision dict
            for (let cell of CellStates.all) {
                if (raw.decisions[cell.name] === undefined) {
                    raw.decisions[cell.name] = 0;
                }
            }
            this.states = [{
                name: "State 1",
                decisions: raw.decisions,
                actions: {},
                transitions: []
            }];
        }
        this.active_state_index = 0;
    }
}

export default Brain;
