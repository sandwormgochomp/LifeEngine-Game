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

const Hyperparams = {
    setDefaults: function(this: HyperparamsSingleton): void {
        applyDefaults(this);
    },

    loadJsonObj(this: HyperparamsSingleton, obj: Record<string, unknown>): void {
        for (let key in obj) {
            /* Saved worlds are untyped at the boundary: the value is only known
               to belong to whichever field the key names, which no type can
               express per-iteration. */
            this[key as keyof HyperparamsData] = obj[key] as never;
        }
    }
} as HyperparamsSingleton;

Hyperparams.setDefaults();

export default Hyperparams;
