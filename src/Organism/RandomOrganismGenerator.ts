import CellStates from "./Cell/CellStates";
import Organism from "./Organism";
import type { OrganismEnv } from "./Organism";
import Brain from "./Perception/Brain";

/* The environment a random organism is generated into: everything Organism
   itself reaches through, plus the one grid-map method this file calls.
   OrganismEnv's grid_map declares only the accessors the simulation uses, so
   getCenter is intersected in rather than replacing it. Collapses to a real
   WorldEnvironment/OrganismEditor import when those modules convert. */
export interface GeneratorEnv extends OrganismEnv {
    grid_map: OrganismEnv['grid_map'] & { getCenter(): [number, number] };
}

class RandomOrganismGenerator {
    /* Assigned below the class body, as in the JS this replaces -- declared
       without an initializer so the assignment stays the only write. */
    static organismLayers: number;
    static cellSpawnChance: number;

    static generate(env: GeneratorEnv): Organism {

        var center = env.grid_map.getCenter();
        var organism = new Organism(center[0], center[1], env, null);
        organism.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        var outermostLayer = RandomOrganismGenerator.organismLayers;
        var x: number, y: number;

        // iterate from center to edge of organism
        // layer 0 is the central cell of the organism
        for (var layer = 1; layer <= outermostLayer; layer++) {

            var someCellSpawned = false;
            var spawnChance = RandomOrganismGenerator.cellSpawnChance * 1 - ((layer - 1) / outermostLayer);

            // top
            y = -layer;
            for (x = -layer; x <= layer; x++)
                someCellSpawned = RandomOrganismGenerator.trySpawnCell(organism, x, y, spawnChance);

            // bottom
            y = layer;
            for (x = -layer; x <= layer; x++)
                someCellSpawned = RandomOrganismGenerator.trySpawnCell(organism, x, y, spawnChance);

            // left
            x = -layer;
            for (y = -layer + 1; y <= layer - 1; y++)
                someCellSpawned = RandomOrganismGenerator.trySpawnCell(organism, x, y, spawnChance);

            // right
            x = layer;
            for (y = -layer + 1; y < layer - 1; y++)
                someCellSpawned = RandomOrganismGenerator.trySpawnCell(organism, x, y, spawnChance);

            if (!someCellSpawned)
                break;
        }

        // randomize the organism's brain
        organism.brain.randomizeDecisions(true);

        return organism;
    }

    static trySpawnCell(organism: Organism, x: number, y: number, spawnChance: number): boolean {

        var neighbors = organism.anatomy.getNeighborsOfCell(x, y);
        if (neighbors.length && Math.random() < spawnChance) {
            organism.anatomy.addRandomizedCell(CellStates.getRandomLivingType(), x, y);
            return true;
        }
        return false;
    }

}

RandomOrganismGenerator.organismLayers = 4;
RandomOrganismGenerator.cellSpawnChance = 0.75;

export default RandomOrganismGenerator;
