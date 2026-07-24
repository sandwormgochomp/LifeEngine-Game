import type { CellState } from '../Cell/CellStates';

/* What an eye's raycast saw, or what a pheromone broadcast synthesised.
 *
 * The two fields used to arrive wrapped in a cell object -- a real GridCell
 * from the raycast, a `{state, owner}` stand-in from the broadcast. The grid no
 * longer keeps a cell object to hand out (see GridMap), so the two fields are
 * stored here directly rather than having the eye build a wrapper per look
 * purely to be unwrapped again by Brain.
 *
 * `state` is null when the ray left the grid without hitting anything -- the
 * old "cell == null" case, which the brain skips. `owner` is the organism the
 * observed cell belongs to, or null; it is `unknown` here only to keep this
 * module below Organism in the dependency order. */
class Observation {
    state: CellState | null;
    owner: unknown;
    distance: number;
    direction: number;

    constructor(state: CellState | null, owner: unknown, distance: number, direction: number){
        this.state = state;
        this.owner = owner;
        this.distance = distance;
        this.direction = direction;
    }
}

export default Observation;
