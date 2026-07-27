import Neighbors from "./Grid/Neighbors";

/* The tunable simulation parameters. They live on a module singleton that is
   read (and written) from every corner of the engine, and are persisted to
   JSON, so they are named here explicitly rather than being inferred. */
export interface HyperparamsData {
    lifespanMultiplier: number;
    foodProdProb: number;
    killableNeighbors: number[][];
    edibleNeighbors: number[][];
    growableNeighbors: number[][];

    useGlobalMutability: boolean;
    globalMutability: number;
    addProb: number;
    changeProb: number;
    removeProb: number;

    rotationEnabled: boolean;

    foodBlocksReproduction: boolean;
    moversCanProduce: boolean;

    instaKill: boolean;

    lookRange: number;
    seeThroughSelf: boolean;

    foodDropProb: number;

    extraMoverFoodCost: number;

    healerFoodCost: number;

    explosionRadius: number;

    wallDurability: number;

    maxOrganisms: number;

    randomEvents: boolean;
    randomEventInterval: number;
}

export interface HyperparamsSingleton extends HyperparamsData {
    setDefaults(): void;
    loadJsonObj(obj: Record<string, unknown>): void;
}

/* The data fields are absent from the literal and installed by the
   setDefaults() call below, so the literal is asserted into the full shape
   rather than annotated with it. */
/* The canonical defaults, applied to any target. Shared by the singleton's
   setDefaults() and by makeDefaultHyperparams() below so the two can never
   drift apart. */
function applyDefaults(h: HyperparamsData): void {
    h.lifespanMultiplier = 100;
    h.foodProdProb = 5;
    h.killableNeighbors = Neighbors.adjacent;
    h.edibleNeighbors = Neighbors.adjacent;
    h.growableNeighbors = Neighbors.adjacent;

    h.useGlobalMutability = false;
    h.globalMutability = 5;
    h.addProb = 33;
    h.changeProb = 33;
    h.removeProb = 33;

    h.rotationEnabled = true;

    h.foodBlocksReproduction = true;
    h.moversCanProduce = false;

    h.instaKill = false;

    h.lookRange = 20;
    h.seeThroughSelf = false;

    h.foodDropProb = 0;

    h.extraMoverFoodCost = 0;

    h.healerFoodCost = 1;

    h.explosionRadius = 2;

    h.wallDurability = 15;

    h.maxOrganisms = -1;

    /* Auto-scheduled world events, off by default. On is a deliberate choice:
       the scheduler draws from Math.random, so leaving it off is what keeps a
       benchmark or test run reproducible (see the determinism risk in
       concepts/proposals/07-world-events.md). The interval is in ticks --
       1800 is roughly half a minute at full speed. */
    h.randomEvents = false;
    h.randomEventInterval = 1800;
}

/* A fresh, standalone defaults object -- NOT the shared singleton. The
   PreviewEnvironment injects one of these into the organisms it simulates so a
   hover preview always shows a cell's canonical behaviour, independent of the
   player's live Evolution Controls, without mutating the global. */
export function makeDefaultHyperparams(): HyperparamsData {
    const h = {} as HyperparamsData;
    applyDefaults(h);
    return h;
}

/* What each field is *supposed* to hold, read off the defaults rather than
   restated as a second list: a field's default is already the one declaration
   of its runtime type, and one that cannot drift from applyDefaults.

   Indexed by plain string, not by keyof, because the whole job here is
   deciding whether an arbitrary incoming key names a field at all. */
const FIELD_SHAPE = makeDefaultHyperparams() as unknown as Record<string, unknown>;

const Hyperparams = {
    setDefaults: function(this: HyperparamsSingleton): void {
        applyDefaults(this);
    },

    /* Saved worlds are untyped at the boundary, and the corpus on disk is not
       clean. Sixteen of the twenty-two bundled worlds store numbers as strings
       -- "50", ".7", a 75-digit lifespan -- left over from a settings UI that
       wrote input.value straight through. Assigning those on verbatim put a
       string where every reader expects a number: ExplosiveCell has parsed
       defensively for exactly this reason, and the evolution dials crashed
       outright on `value.toFixed is not a function` the moment you opened the
       window after loading one. Coercing here means no reader downstream has
       to know the difference.

       Keys the singleton does not declare are dropped. Four bundled worlds
       nest an entire save under `controls`, so this is also what keeps `grid`,
       `organisms` and `fossil_record` off the parameter object. */
    loadJsonObj(this: HyperparamsSingleton, obj: Record<string, unknown>): void {
        for (const key of Object.keys(obj)) {
            const shape = FIELD_SHAPE[key];
            if (shape === undefined) continue;
            const raw = obj[key];
            const field = key as keyof HyperparamsData;

            if (typeof shape === 'number') {
                /* Only a number or a string can mean a number. Booleans and
                   null are rejected rather than coerced -- Number(null) is 0,
                   which would read as a deliberate zero. */
                if (typeof raw !== 'number' && typeof raw !== 'string') continue;
                const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
                if (typeof raw === 'string' && raw.trim() === '') continue;
                if (Number.isFinite(value)) this[field] = value as never;
            } else if (typeof shape === 'boolean') {
                if (typeof raw === 'boolean') this[field] = raw as never;
                else if (raw === 'true' || raw === 'false') this[field] = (raw === 'true') as never;
            } else if (Array.isArray(shape)) {
                if (Array.isArray(raw)) this[field] = raw as never;
            }
        }
    }
} as HyperparamsSingleton;

Hyperparams.setDefaults();

export default Hyperparams;
