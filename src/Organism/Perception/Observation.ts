import type { CellState } from '../Cell/CellStates';

/* Minimal structural shape of what gets observed: either a real GridCell (from
   an eye's raycast) or the synthetic {state, owner} stand-in that pheromone
   emission builds. Replace with the real GridCell type once src/Grid/GridCell
   converts. `owner` is left `unknown` because the Organism class is still
   untyped JS. */
export interface ObservedCell {
    state: CellState;
    owner?: unknown;
}

class Observation {
    cell: ObservedCell | null;
    distance: number;
    direction: number;

    constructor(cell: ObservedCell | null, distance: number, direction: number){
        this.cell = cell;
        this.distance = distance;
        this.direction = direction;
    }
}

export default Observation;
