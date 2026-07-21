import CellStates from "../Organism/Cell/CellStates";
import SerializeHelper from "../Utils/SerializeHelper";
import Species from "./Species";
import type { AnatomyLike, CellCountMap } from "./Species";

/* Minimal structural views of WorldEnvironment and Organism, both still .js.
   They collapse to real imports once those files are converted. */
export interface FossilRecordEnvLike {
    total_ticks: number;
    organisms: unknown[];
    averageMutability(): number;
}

export interface FossilRecordOrganismLike {
    anatomy: AnatomyLike | null;
    /* A write target, not a read: addSpecies() mints a Species and assigns it
       here. Organisms legitimately arrive without one -- that is the whole
       reason to call addSpecies -- so this accepts the absent case rather than
       forcing callers to assert a value they are about to supply. */
    species: Species | null | undefined;
}

/* The parallel history arrays, as they are nested under `records` by
   serialize() and read back by loadRaw(). The index signature is what lets
   loadRaw()'s reflective `for...in` copy read them by dynamic key. */
export interface SerializedFossilRecordSeries {
    tick_record: number[];
    pop_counts: number[];
    species_counts: number[];
    av_mut_rates: number[];
    av_cells: number[];
    av_cell_counts: CellCountMap[];
    [key: string]: unknown;
}

/* What SerializeHelper.copyNonObjects leaves of a Species: its non-object
   fields only. `name` is deleted on the way out because it becomes the key of
   the enclosing map. */
export interface SerializedSpecies {
    name?: string;
    population?: number;
    cumulative_pop?: number;
    start_tick?: number;
    end_tick?: number;
    extinct?: boolean;
}

export interface SerializedFossilRecord {
    min_discard?: number;
    record_size_limit?: number;
    records: SerializedFossilRecordSeries;
    species: Record<string, SerializedSpecies>;
    [key: string]: unknown;
}

export interface FossilRecordType {
    /* Assigned by init(), which runs at module evaluation below -- so these are
       always present by the time anything can observe them. */
    extant_species: Record<string, Species>;
    extinct_species: Record<string, Species>;
    min_discard: number;
    record_size_limit: number;
    /* Assigned by setEnv(), which the WorldEnvironment constructor calls before
       any method that reads env can run. */
    env: FossilRecordEnvLike;
    /* Assigned by setData(), reached via setEnv() / clear_record(). */
    tick_record: number[];
    pop_counts: number[];
    species_counts: number[];
    av_mut_rates: number[];
    av_cells: number[];
    av_cell_counts: CellCountMap[];

    init(): void;
    setEnv(env: FossilRecordEnvLike): void;
    addSpecies(org: FossilRecordOrganismLike, ancestor: Species | null): Species;
    addSpeciesObj(species: Species): Species | undefined;
    changeSpeciesName(species: Species, new_name: string): void;
    numExtantSpecies(): number;
    numExtinctSpecies(): number;
    speciesIsExtant(species_name: string): boolean;
    fossilize(species: Species): boolean;
    resurrect(species: Species): void;
    setData(): void;
    updateData(): void;
    calcCellCountAverages(): void;
    getMostPopulousSpecies(): Species | undefined;
    clear_record(): void;
    serialize(): SerializedFossilRecord;
    loadRaw(record: unknown): void;
}

/* Annotated *and* asserted: the assertion is what lets the literal omit the
   fields that init(), setEnv() and setData() assign at runtime, and the
   annotation is what makes the exported type the interface rather than the
   literal. Each method also declares an explicit `this: FossilRecordType`
   parameter -- erased at emit -- because contextual `this` typing for object
   literals only kicks in under noImplicitThis, which is off until strict is
   turned on; without it `this` would silently be `any` today. */
const FossilRecord: FossilRecordType = {
    init: function(this: FossilRecordType): void {
        this.extant_species = {};
        this.extinct_species = {};

        // if an organism has fewer than this cumulative pop, discard them on extinction
        this.min_discard = 10;

        this.record_size_limit = 500; // store this many data points
    },

    setEnv: function(this: FossilRecordType, env: FossilRecordEnvLike): void {
        this.env = env;
        this.setData();
    },

    addSpecies: function(this: FossilRecordType, org: FossilRecordOrganismLike, ancestor: Species | null): Species {
        var new_species = new Species(org.anatomy, ancestor, this.env.total_ticks);
        this.extant_species[new_species.name] = new_species;
        org.species = new_species;
        return new_species;
    },

    addSpeciesObj: function(this: FossilRecordType, species: Species): Species | undefined {
        if (this.extant_species[species.name]) {
            console.warn('Tried to add already existing species. Add failed.');
            return;
        }
        this.extant_species[species.name] = species;
        return species;
    },

    changeSpeciesName: function(this: FossilRecordType, species: Species, new_name: string): void {
        if (this.extant_species[new_name]) {
            console.warn('Tried to change species name to an existing species name. Change failed.');
            return;
        }
        delete this.extant_species[species.name];
        species.name = new_name;
        this.extant_species[new_name] = species;
    },

    numExtantSpecies(this: FossilRecordType): number {return Object.values(this.extant_species).length},
    numExtinctSpecies(this: FossilRecordType): number {return Object.values(this.extinct_species).length},
    speciesIsExtant(this: FossilRecordType, species_name: string): boolean {return !!this.extant_species[species_name]},

    fossilize: function(this: FossilRecordType, species: Species): boolean {
        if (!this.extant_species[species.name]) {
            console.warn('Tried to fossilize non existing species.');
            return false;
        }
        species.end_tick = this.env.total_ticks;
        species.ancestor = undefined; // garbage collect ancestors
        delete this.extant_species[species.name];
        if (species.cumulative_pop >= this.min_discard) {
            // TODO: store as extinct species
            return true;
        }
        return false;
    },

    resurrect: function(this: FossilRecordType, species: Species): void {
        if (species.extinct) {
            species.extinct = false;
            this.extant_species[species.name] = species;
            delete this.extinct_species[species.name];
        }
    },

    setData(this: FossilRecordType): void {
        // all parallel arrays
        this.tick_record = [];
        this.pop_counts = [];
        this.species_counts = [];
        this.av_mut_rates = [];
        this.av_cells = [];
        this.av_cell_counts = [];
        this.updateData();
    },

    updateData(this: FossilRecordType): void {
        var tick = this.env.total_ticks;
        this.tick_record.push(tick);
        this.pop_counts.push(this.env.organisms.length);
        this.species_counts.push(this.numExtantSpecies());
        this.av_mut_rates.push(this.env.averageMutability());
        this.calcCellCountAverages();
        while (this.tick_record.length > this.record_size_limit) {
            this.tick_record.shift();
            this.pop_counts.shift();
            this.species_counts.shift();
            this.av_mut_rates.shift();
            this.av_cells.shift();
            this.av_cell_counts.shift();
        }
    },

    calcCellCountAverages(this: FossilRecordType): void {
        var total_org = 0;
        var cell_counts: CellCountMap = {};
        for (let c of CellStates.living) {
            cell_counts[c.name] = 0;
        }
        var first=true;
        for (let s of Object.values(this.extant_species)) {
            if (!first && this.numExtantSpecies() > 10 && s.cumulative_pop < this.min_discard){
                continue;
            }
            /* The `for...in` body only runs when s.cell_counts is present, so the
               assertions inside it are what the loop already guarantees. */
            for (let name in s.cell_counts) {
                cell_counts[name] += s.cell_counts![name] * s.population;
            }
            total_org += s.population;
            first=false;
        }
        if (total_org == 0) {
            this.av_cells.push(0);
            this.av_cell_counts.push(cell_counts);
            return;
        }

        var total_cells = 0;
        for (let c in cell_counts) {
            total_cells += cell_counts[c];
            cell_counts[c] /= total_org;
        }
        this.av_cells.push(total_cells / total_org);
        this.av_cell_counts.push(cell_counts);
    },

    getMostPopulousSpecies(this: FossilRecordType): Species | undefined {
        var max_pop = 0;
        var max_species: Species | undefined = undefined;
        for (let s of Object.values(this.extant_species)) {
            if (s.population > max_pop) {
                max_pop = s.population;
                max_species = s;
            }
        }
        return max_species;
    },

    clear_record(this: FossilRecordType): void {
        // Objects, not arrays, to match init() and every access site: these are
        // keyed by species name (extant_species[species.name], delete, and
        // Object.values). Arrays only ever worked here by accident, since they
        // accept string properties too.
        this.extant_species = {};
        this.extinct_species = {};
        this.setData();
    },

    serialize(this: FossilRecordType): SerializedFossilRecord {
        this.updateData();
        /* copyNonObjects walks arbitrary keys, so it takes and returns an
           untyped bag; the shape it produces here is SerializedFossilRecord. */
        let record = SerializeHelper.copyNonObjects(this as unknown as Record<string, unknown>) as SerializedFossilRecord;
        record.records = {
            tick_record:this.tick_record,
            pop_counts:this.pop_counts,
            species_counts:this.species_counts,
            av_mut_rates:this.av_mut_rates,
            av_cells:this.av_cells,
            av_cell_counts:this.av_cell_counts,
        };
        let species: Record<string, SerializedSpecies> = {};
        for (let s of Object.values(this.extant_species)) {
            species[s.name] = SerializeHelper.copyNonObjects(s as unknown as Record<string, unknown>) as SerializedSpecies;
            delete species[s.name].name; // the name will be used as the key, so remove it from the value
        }
        record.species = species;
        return record;
    },

    loadRaw(this: FossilRecordType, record: unknown): void {
        /* Reflective load: `raw` and `self` are type-only views of the two
           values already in hand, so the emitted statements are unchanged. */
        const raw = record as SerializedFossilRecord;
        const self = this as unknown as Record<string, unknown>;
        SerializeHelper.overwriteNonObjects(raw, self);
        for (let key in raw.records) {
            self[key] = raw.records[key];
        }
    }

} as FossilRecordType

FossilRecord.init();

export default FossilRecord;
