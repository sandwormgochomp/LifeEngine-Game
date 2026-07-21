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
const Hyperparams = {
    setDefaults: function(this: HyperparamsSingleton): void {
        this.lifespanMultiplier = 100;
        this.foodProdProb = 5;
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.adjacent;
        this.growableNeighbors = Neighbors.adjacent;

        this.useGlobalMutability = false;
        this.globalMutability = 5;
        this.addProb = 33;
        this.changeProb = 33;
        this.removeProb = 33;

        this.rotationEnabled = true;

        this.foodBlocksReproduction = true;
        this.moversCanProduce = false;

        this.instaKill = false;

        this.lookRange = 20;
        this.seeThroughSelf = false;

        this.foodDropProb = 0;

        this.extraMoverFoodCost = 0;

        this.healerFoodCost = 1;

        this.explosionRadius = 2;

        this.wallDurability = 15;

        this.maxOrganisms = -1;
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
