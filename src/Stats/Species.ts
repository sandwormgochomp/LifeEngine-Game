import CellStates from "../Organism/Cell/CellStates";
import { generateOrganismName } from "../Utils/NameGenerator";
// Circular with FossilRecord (which imports Species); safe because both only
// touch each other inside methods, never during module evaluation.
import FossilRecord from "./FossilRecord";
/* Type-only, so it is erased and adds no runtime edge -- unlike the
   FossilRecord import above, which is a real (and deliberate) cycle. */
import type Anatomy from "../Organism/Anatomy";

/* Cell-name -> count. Keyed by CellState.name (a CellName), but every producer
   and consumer of this map builds and walks it with `for...in` / dynamic
   indexing, which yields plain `string` keys, so the index type is `string`. */
export type CellCountMap = Record<string, number>;

/* The one FossilRecord method a Species calls (on extinction). Injectable so
   the PreviewEnvironment can hand its throwaway species a no-op instead of the
   global record -- a preview organism's death then costs nothing and warns
   about nothing. Defaults to the real singleton for every other caller. */
export interface Fossilizer {
    fossilize(species: Species): boolean;
}

class Species {
    /* Nullable for real, not for want of a type: WorldEnvironment.loadRaw mints
       every saved species as `new Species(null, null, 0)` and only attaches the
       anatomy once it meets an organism carrying one. calcAnatomyDetails()
       early-returns over exactly that window. */
    anatomy: Anatomy | null;
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
    /* Where extinction is reported. The global FossilRecord for every real
       species; a no-op for the ones PreviewEnvironment seeds. */
    fossil_record: Fossilizer;

    constructor(anatomy: Anatomy | null, ancestor: Species | null | undefined, start_tick: number, fossil_record: Fossilizer = FossilRecord) {
        this.anatomy = anatomy;
        this.fossil_record = fossil_record;
        this.ancestor = ancestor; // eventually need to garbage collect ancestors to avoid memory problems
        this.population = 1;
        this.cumulative_pop = 1;
        this.start_tick = start_tick;
        this.end_tick = -1;
        this.extinct = false;
        this.calcAnatomyDetails();
        /* Name derived from the body plan (e.g. "Glowgrazer"), once cell_counts
           exists. The anatomy-less case is loadRaw's `new Species(null,...)`,
           whose name is overwritten from the saved key immediately after, so the
           random fallback is only ever a momentary placeholder. FossilRecord
           disambiguates collisions at registration via uniqueSpeciesName. */
        this.name = this.cell_counts
            ? generateOrganismName(this.cell_counts)
            : Math.random().toString(36).substr(2, 10);
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
            this.fossil_record.fossilize(this);
        }
    }

    lifespan(): number {
        return this.end_tick - this.start_tick;
    }
}

export default Species;
