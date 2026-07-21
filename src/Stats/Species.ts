import CellStates from "../Organism/Cell/CellStates";
// Circular with FossilRecord (which imports Species); safe because both only
// touch each other inside methods, never during module evaluation.
import FossilRecord from "./FossilRecord";

/* Minimal structural view of Anatomy, which is still .js. It collapses to a
   real import from ../Organism/Anatomy once that file is converted. */
export interface AnatomyLike {
    cells: { state: { name: string } }[];
}

/* Cell-name -> count. Keyed by CellState.name (a CellName), but every producer
   and consumer of this map builds and walks it with `for...in` / dynamic
   indexing, which yields plain `string` keys, so the index type is `string`. */
export type CellCountMap = Record<string, number>;

class Species {
    anatomy: AnatomyLike | null;
    ancestor: Species | null | undefined;
    population: number;
    cumulative_pop: number;
    start_tick: number;
    end_tick: number;
    name: string;
    extinct: boolean;
    /* Genuinely absent for a species built without an anatomy: it is assigned
       only by calcAnatomyDetails(), which early-returns when this.anatomy is
       falsy. Hence `| undefined` rather than a definite-assignment `!`. */
    cell_counts: CellCountMap | undefined;

    constructor(anatomy: AnatomyLike | null, ancestor: Species | null | undefined, start_tick: number) {
        this.anatomy = anatomy;
        this.ancestor = ancestor; // eventually need to garbage collect ancestors to avoid memory problems
        this.population = 1;
        this.cumulative_pop = 1;
        this.start_tick = start_tick;
        this.end_tick = -1;
        this.name = Math.random().toString(36).substr(2, 10);
        this.extinct = false;
        this.calcAnatomyDetails();
    }

    calcAnatomyDetails(): void {
        if (!this.anatomy) return;
        var cell_counts: CellCountMap = {};
        for (let c of CellStates.living) {
            cell_counts[c.name] = 0;
        }
        for (let cell of this.anatomy.cells) {
            cell_counts[cell.state.name]+=1;
        }
        this.cell_counts=cell_counts;
    }

    addPop(): void {
        this.population++;
        this.cumulative_pop++;
    }

    decreasePop(): void {
        this.population--;
        if (this.population <= 0) {
            this.extinct = true;
            FossilRecord.fossilize(this);
        }
    }

    lifespan(): number {
        return this.end_tick - this.start_tick;
    }
}

export default Species;
