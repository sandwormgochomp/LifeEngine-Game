import Notifier from "../Utils/Notifier";
import type { NotificationCell } from "../Utils/Notifier";
import FossilRecord from "./FossilRecord";

/* Self-narrating events. The sim already generates drama -- species emerge,
   lineages die out, size records fall, populations crash -- but nothing surfaces
   it. The Narrator watches for those transitions and announces them as toasts,
   carrying the organism's body plan so the HUD can preview it beside the text.

   Detection is poll-and-diff, sampled once per data-update window from the real
   world's tick loop (WorldEnvironment.update). That placement is deliberate: the
   birth/death choke-points (Organism.reproduce, Species.decreasePop) are also run
   by the Organism Lab's PreviewEnvironment mini-sim, so emitting there would leak
   preview toasts. WorldEnvironment.update() is a separate method the preview never
   calls, so narrating from here gates emission to the real world for free -- with
   no changes to Species/Organism/FossilRecord internals. */

/* The world state the Narrator reads, structurally typed so this module doesn't
   import WorldEnvironment (which would add a needless cycle). A real
   WorldEnvironment satisfies it. `largest_cells` is the body plan of the current
   record holder, captured by addOrganism when the high-water mark is beaten. */
export interface NarratableWorld {
    total_ticks: number;
    organisms: unknown[];
    largest_cell_count: number;
    largest_cells?: NotificationCell[];
}

// The shape the Narrator reads off an extant species. A real Species satisfies
// it; the anatomy is nullable (loadRaw mints species before binding a body).
interface NarratableSpecies {
    name: string;
    start_tick: number;
    anatomy?: { cells: NotificationCell[] } | null;
}

// A population must have been at least this large before a drop counts as a
// crash -- otherwise a lineage flickering 3 -> 1 would cry "mass extinction".
const MIN_POP_FOR_CRASH = 10;
// Fraction of the population that must vanish in one window to read as a crash.
const CRASH_FRAC = 0.4;

// A lineage that emerges and dies within this many ticks barely got going; its
// extinction earns a tongue-in-cheek send-off instead of the sober one.
const SHORT_LIFE_TICKS = 300;

// Send-offs for a lineage that died almost as soon as it appeared. Each takes
// the name and the (formatted) age. Chosen deterministically by name so the same
// lineage always gets the same line -- and so tests aren't at the mercy of RNG.
const SHORT_LIFE_QUIPS: ((name: string, age: string) => string)[] = [
    (n, a) => `${n} came, saw, and immediately gave up (${a} ticks).`,
    (n, a) => `${n} lasted all of ${a} ticks. Blink and you'd miss it.`,
    (n, a) => `Gone in ${a} ticks — ${n} just wasn't built for this world.`,
    (n, a) => `${n} speedran extinction in ${a} ticks.`,
    (n, a) => `A brief ${a}-tick candle: rest well, ${n}.`,
    (n, a) => `${n} evolved, panicked, and expired (${a} ticks).`,
];

// Small stable string hash, so a name maps to the same quip every time.
function hashName(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function extinctionMessage(name: string, age: number): string {
    const formatted = age.toLocaleString();
    if (age < SHORT_LIFE_TICKS)
        return SHORT_LIFE_QUIPS[hashName(name) % SHORT_LIFE_QUIPS.length](name, formatted);
    return `${name} went extinct after ${formatted} ticks`;
}

// A species carries its body plan on the toast as a flat snapshot of plain cells,
// rather than the live anatomy: the toast outlives the tick, and for an
// extinction the anatomy is gone by the time we announce it.
function previewOf(species: NarratableSpecies): NotificationCell[] {
    const cells = species.anatomy?.cells;
    if (!cells) return [];
    return cells.map(c => ({
        loc_col: c.loc_col,
        loc_row: c.loc_row,
        direction: c.direction,
        state: { name: c.state?.name },
    }));
}

// What the Narrator remembers about a species between samples: enough to date an
// extinction (start_tick) and to preview the lineage that just vanished (cells).
interface SpeciesSnapshot {
    start: number;
    cells: NotificationCell[];
}

class Narrator {
    // name -> snapshot for every species extant at the last sample. Drives both
    // "new lifeform" (name appeared) and "extinct" (name vanished; age is derived
    // from the remembered start, the preview from the remembered cells).
    private species: Map<string, SpeciesSnapshot> = new Map();
    private population = 0;
    private largest = 0;
    // Until the first sample seeds a baseline, there is nothing to diff against.
    // Seeding silently is what stops a fresh or freshly-loaded world from
    // announcing every species it already contains as brand new.
    private seeded = false;

    /* Running totals that let consecutive samples fold into one updating log line
       ("2 new lifeforms emerged" -> "4 new lifeforms emerged") rather than
       stacking a fresh line each time. The streak counts how many have piled up;
       the generation bumps whenever a streak restarts (a sample with none of that
       kind broke it), so the coalescing key changes and the next burst opens a
       new line instead of editing a stale one. */
    private emergedStreak = 0;
    private emergedGen = 0;
    private extinctStreak = 0;
    private extinctGen = 0;

    // Clear the baseline so the next sample re-seeds silently. Called on world
    // reset and load.
    reset(): void {
        this.species.clear();
        this.population = 0;
        this.largest = 0;
        this.seeded = false;
        this.emergedStreak = 0;
        this.emergedGen = 0;
        this.extinctStreak = 0;
        this.extinctGen = 0;
    }

    sample(env: NarratableWorld): void {
        const tick = env.total_ticks;
        const pop = env.organisms.length;
        const largest = env.largest_cell_count;

        const current = new Map<string, SpeciesSnapshot>();
        for (const s of Object.values(FossilRecord.extant_species) as NarratableSpecies[]) {
            current.set(s.name, { start: s.start_tick, cells: previewOf(s) });
        }

        if (!this.seeded) {
            this.commit(current, pop, largest);
            this.seeded = true;
            return;
        }

        // New lineages: names present now that weren't before. Consecutive
        // samples fold into one running counter (see the streak fields).
        let emerged = 0;
        let last_emerged: SpeciesSnapshot | undefined;
        let last_name = '';
        for (const [name, snap] of current) {
            if (!this.species.has(name)) {
                emerged++;
                last_emerged = snap;
                last_name = name;
            }
        }
        if (emerged > 0) {
            if (this.emergedStreak === 0) this.emergedGen++; // a new streak opens a new line
            this.emergedStreak += emerged;
            const key = `emerged:${this.emergedGen}`;
            if (this.emergedStreak === 1)
                Notifier.notify(`A new lifeform emerged: ${last_name}`, { key, organism: last_emerged!.cells });
            else
                Notifier.notify(`${this.emergedStreak} new lifeforms emerged`, { key });
        } else this.emergedStreak = 0;

        // Extinctions: names gone since the last sample. Age and preview come from
        // the snapshot we remembered for them. A single short-lived lineage gets a
        // tongue-in-cheek send-off; multiples fold into a running count.
        let extinct = 0;
        let last_extinct: SpeciesSnapshot | undefined;
        let last_extinct_name = '';
        for (const [name, snap] of this.species) {
            if (!current.has(name)) {
                extinct++;
                last_extinct = snap;
                last_extinct_name = name;
            }
        }
        if (extinct > 0) {
            if (this.extinctStreak === 0) this.extinctGen++;
            this.extinctStreak += extinct;
            const key = `extinct:${this.extinctGen}`;
            if (this.extinctStreak === 1)
                Notifier.notify(extinctionMessage(last_extinct_name, tick - last_extinct!.start), {
                    key,
                    organism: last_extinct!.cells,
                });
            else
                Notifier.notify(`${this.extinctStreak} lineages went extinct`, { key });
        } else this.extinctStreak = 0;

        // New all-time size record, previewing the record holder. Keyed so a quick
        // succession of records updates one line rather than stacking.
        if (largest > this.largest)
            Notifier.notify(`New largest organism ever: ${largest.toLocaleString()} cells`, {
                key: 'record',
                organism: env.largest_cells,
            });

        // Population crash. No single organism to preview -- it's an aggregate.
        if (this.population >= MIN_POP_FOR_CRASH && pop <= this.population * (1 - CRASH_FRAC))
            Notifier.notify(
                `Mass extinction — population crashed ${this.population.toLocaleString()} → ${pop.toLocaleString()}`
            );

        this.commit(current, pop, largest);
    }

    private commit(species: Map<string, SpeciesSnapshot>, pop: number, largest: number): void {
        this.species = species;
        this.population = pop;
        this.largest = largest;
    }
}

const narrator = new Narrator();
export default narrator;
