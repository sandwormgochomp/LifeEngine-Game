import CellStates from "../Organism/Cell/CellStates";
import SerializeHelper from "../Utils/SerializeHelper";
import Species from "./Species";
import Phylogeny from "./Phylogeny";
import type { CellCountMap } from "./Species";
/* Both type-only, and that is load-bearing rather than stylistic. Organism and
   WorldEnvironment each import this module for its *value* (addSpecies,
   setEnv), so a value import back would close a real cycle -- and init() runs
   at module evaluation below, so that cycle would be observable, not merely
   theoretical. `import type` is erased entirely and adds no runtime edge. */
import type Organism from "../Organism/Organism";
import type WorldEnvironment from "../Environments/WorldEnvironment";

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
    /* Never written: serialize() deletes it. Declared so that delete is
       type-checked, and so a reader knows the omission is deliberate. */
    id?: number;
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
    env: WorldEnvironment;
    /* Assigned by setData(), reached via setEnv() / clear_record(). */
    tick_record: number[];
    pop_counts: number[];
    species_counts: number[];
    av_mut_rates: number[];
    av_cells: number[];
    av_cell_counts: CellCountMap[];

    init(): void;
    setEnv(env: WorldEnvironment): void;
    addSpecies(org: Organism, ancestor: Species | null): Species;
    addSpeciesObj(species: Species, parent?: Species | null): Species | undefined;
    uniqueSpeciesName(base: string): string;
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

    setEnv: function(this: FossilRecordType, env: WorldEnvironment): void {
        this.env = env;
        this.setData();
    },

    /* Speciation on a mutated birth -- the only edge in the tree that is not a
       root. Everything else that mints a species (the origin organism, a
       predator release, an editor drop, a load) goes to addSpeciesObj with no
       parent, because it genuinely has none. */
    addSpecies: function(this: FossilRecordType, org: Organism, ancestor: Species | null): Species {
        var new_species = new Species(org.anatomy, ancestor, this.env.total_ticks);
        /* Generated names describe the body plan, so different lineages with the
           same anatomy collide. This map is keyed by name, so a collision would
           silently overwrite the earlier species -- disambiguate before insert. */
        new_species.name = this.uniqueSpeciesName(new_species.name);
        this.addSpeciesObj(new_species, ancestor);
        org.species = new_species;
        return new_species;
    },

    /* The one place a species enters the world. addSpecies delegates here
       rather than writing the map itself, so the ancestry record has exactly
       one hook to sit on -- and so a future creation site cannot slip past it.
       `parent` is the species this one mutated from, or null for a root. */
    addSpeciesObj: function(this: FossilRecordType, species: Species, parent: Species | null = null): Species | undefined {
        if (this.extant_species[species.name]) {
            console.warn('Tried to add already existing species. Add failed.');
            return;
        }
        this.extant_species[species.name] = species;
        /* The species' own start_tick, not env.total_ticks: loadRaw registers
           saved species before it restores the world clock, and every other
           caller sets start_tick from that same clock anyway. */
        Phylogeny.record(species, parent, species.start_tick);
        return species;
    },

    // Returns `base` if free, else appends a roman-numeral suffix (base II,
    // base III, ...) until it finds an unused name across both the extant and
    // extinct registries, which together own the keyspace.
    uniqueSpeciesName: function(this: FossilRecordType, base: string): string {
        const taken = (name: string): boolean =>
            !!this.extant_species[name] || !!this.extinct_species[name];
        if (!taken(base)) return base;
        const roman = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        let i = 0;
        let candidate: string;
        do {
            candidate = i < roman.length ? `${base} ${roman[i]}` : `${base} ${i + 2}`;
            i++;
        } while (taken(candidate));
        return candidate;
    },

    changeSpeciesName: function(this: FossilRecordType, species: Species, new_name: string): void {
        if (this.extant_species[new_name]) {
            console.warn('Tried to change species name to an existing species name. Change failed.');
            return;
        }
        delete this.extant_species[species.name];
        species.name = new_name;
        this.extant_species[new_name] = species;
        // The ancestry record keys on id but displays the name, so a rename has
        // to reach it or the tree keeps showing the old one forever.
        Phylogeny.rename(species.id, new_name);
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
        /* Before the ancestor pointer goes, and it must: the record is the only
           thing that outlives it. The anatomy is handed over here rather than
           held all along because Phylogeny discards the overwhelming majority
           of nodes at this exact moment -- it snapshots only if this one
           survives, so an ephemeral mutant's extinction allocates nothing. */
        Phylogeny.onExtinct(species.id, species.end_tick, species.anatomy?.cells);
        species.ancestor = undefined; // garbage collect ancestors
        delete this.extant_species[species.name];
        if (species.cumulative_pop >= this.min_discard) {
            /* Keep the fossil. Everything else here already assumed this
               happened: resurrect() deletes from this registry, and
               uniqueSpeciesName() treats its names as taken so a later
               lineage cannot reclaim a dead one's name. The min_discard gate
               above is what bounds the growth -- a lineage that never got past
               a handful of members is dropped, as it always was.

               Not serialized: serialize() walks extant_species by hand and
               copyNonObjects skips objects, so saves are unchanged. */
            this.extinct_species[species.name] = species;
            return true;
        }
        return false;
    },

    resurrect: function(this: FossilRecordType, species: Species): void {
        if (species.extinct) {
            species.extinct = false;
            this.extant_species[species.name] = species;
            delete this.extinct_species[species.name];
            // Its node may have been pruned when it died; re-seat it as a root
            // rather than let a live species be missing from the record.
            Phylogeny.resurrect(species, this.env.total_ticks);
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
        /* Both hoisted out of the loop: numExtantSpecies() materializes
           Object.values() on every call, and calling it per species made this
           pass O(S^2) -- a measured 16ms spike every data update on a world
           with thousands of species. Nothing below mutates extant_species, so
           the snapshot is safe. */
        var extant = Object.values(this.extant_species);
        var discard_small = extant.length > 10;
        for (let s of extant) {
            if (!first && discard_small && s.cumulative_pop < this.min_discard){
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
        /* Shares this lifecycle exactly. Both WorldEnvironment.reset() and
           WorldEnvironment.loadRaw() wipe the record through here, so neither
           needs its own call -- and an ancestry surviving a world wipe would
           attach the new world's roots to the old world's tree. */
        Phylogeny.clear();
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
            /* And the id, for a sharper reason: it is only unique within the
               session that minted it, so loading it back would let a saved
               species collide with a live one and graft two lineages together.
               loadRaw's `new Species(...)` already assigned a fresh one --
               leaving this in would let overwriteNonObjects clobber it. See the
               NOT SERIALIZED note in Phylogeny.ts. */
            delete species[s.name].id;
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
