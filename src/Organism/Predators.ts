import type { CellName } from './Cell/CellStates';
import type { BrainState } from './Perception/Brain';

/* The invasive-predator bestiary (Events tab -> Predator), per
   concepts/proposals/07-world-events. Each entry is a hand-built genome rather
   than a saved organism from another world: the point of the event is to drop a
   *known* hunter into a settled world, so what arrives has to be legible --
   every species below is built around one mechanic (armour, poison, pack
   pheromone, ranged fire, detonation, theft) and its description says which.
   They are ordinary organisms once released: they age, starve, mutate and can
   be driven extinct by what they invade.

   Kept as data, not as JSON under public/assets/organisms: presets are things
   the player loads into the Lab and edits, these are engine content the release
   path spawns directly, and their brains encode behaviour the Lab has no UI
   for (multi-state transitions, per-cell actions). */

/* One body cell of a genome. `direction` is read only off eye cells, where it
   is the look direction *relative to the organism's rotation* (EyeCell
   .getAbsoluteDirection adds the two). Fed to Anatomy.loadRaw, which duck-types
   these plain objects through BodyCellFactory.createInherited. */
export interface PredatorCell {
    loc_col: number;
    loc_row: number;
    state: { name: CellName };
    direction?: number;
}

/* What Organism.loadRaw() consumes: scalars are copied onto the organism by
   SerializeHelper.overwriteNonObjects, `anatomy` and `brain` by their own
   loaders. A strict subset of SerializedOrganism -- position and species come
   from the release, not the genome, and birth_distance is not listed because
   the BodyCell constructor derives it from the cell extents. */
export interface PredatorGenome {
    move_range: number;
    mutability: number;
    poison_duration?: number;
    /* Founders arrive fed. Below foodNeeded() for every genome here, so a pack
       never reproduces on the tick it lands -- it just means a shooter can fire
       its first shot and a healer can pay for its first repair. */
    food_collected: number;
    anatomy: { cells: PredatorCell[] };
    /* Only movers with eyes ever consult a brain (see Organism.update), so a
       sessile or blind genome omits this. */
    brain?: { states: BrainState[] };
}

export interface PredatorSpecies {
    id: string;
    /* Doubles as the species name in the fossil record, disambiguated by
       FossilRecord.uniqueSpeciesName if the world already holds one. */
    name: string;
    binomial: string;
    // One line for the bestiary card, under the name.
    tagline: string;
    // What it actually does mechanically -- the card's body text.
    description: string;
    // How many founders a release drops.
    pack: number;
    genome: PredatorGenome;
}

const cell = (name: CellName, loc_col: number, loc_row: number): PredatorCell =>
    ({ state: { name }, loc_col, loc_row });

// An eye looking straight ahead (relative up), which is where every genome
// below wants its vision: forward of the killing edge.
const eye = (loc_col: number, loc_row: number): PredatorCell =>
    ({ state: { name: 'eye' }, loc_col, loc_row, direction: 0 });

/* A single-state brain. Weights are per *seen cell state*: positive draws the
   organism toward it, negative pushes it away, and Brain.decide attenuates by
   distance. Unlisted states default to 0 (ignored) via Brain.load. */
const oneState = (decisions: Partial<Record<CellName, number>>,
                  actions: Partial<Record<CellName, string>> = {}): { states: BrainState[] } =>
    ({ states: [{ name: 'Hunt', decisions, actions, transitions: [] }] });

const PREDATORS: PredatorSpecies[] = [
    {
        id: 'ironjaw',
        name: 'Ironjaw',
        binomial: 'Vorax ferrata',
        tagline: 'Armour-plated siege brute',
        description:
            'A slab of armour around two killer tusks. Killer cells cannot damage armour, so nothing a settled world has evolved bites through its flanks — it walks into a producer mat and eats its way out. Breeds almost true (mutability 2), so what you release is what spreads.',
        pack: 3,
        genome: {
            move_range: 4,
            mutability: 2,
            food_collected: 3,
            anatomy: {
                /* Two tusks, armoured flanks, a full rank of mouths behind.
                   Every cell is on the perimeter with a free side, which the
                   first build got wrong twice over: it carried an eleventh cell
                   it could not feed, and a second killer walled in by its own
                   body, which can never reach a neighbour to kill. */
                cells: [
                    cell('killer', -1, -1), eye(0, -1), cell('killer', 1, -1),
                    cell('armor', -1, 0), cell('mover', 0, 0), cell('armor', 1, 0),
                    cell('mouth', -1, 1), cell('mouth', 0, 1), cell('mouth', 1, 1),
                ],
            },
            // Charges everything, including other killers: the armour is what
            // makes that a winning trade rather than a death wish.
            brain: oneState({ food: 8, producer: 10, mouth: 9, mover: 6, killer: 3, armor: 3 }),
        },
    },
    {
        id: 'nettlewisp',
        name: 'Nettlewisp',
        binomial: 'Toxifera pallida',
        tagline: 'Poison drifter that never fights',
        description:
            'A poison bell above a row of trailing mouths. It wins no fight it starts — it does not start any. Anything it drifts past is poisoned for 14 ticks and dies wherever it happens to be standing, and the mouths underneath sweep up what falls. Lethal to large, slow, well-fed forms.',
        pack: 5,
        genome: {
            move_range: 2,
            mutability: 6,
            poison_duration: 14,
            food_collected: 2,
            anatomy: {
                /* The mouth row is the whole design. An earlier build carried
                   one mouth and never reproduced once across a 2400-tick trial:
                   poison kills at arm's length, so a body that cannot sweep up
                   what it drops starves beside its own kills. */
                cells: [
                    eye(0, -2),
                    cell('poison', 0, -1),
                    cell('poison', -1, 0), cell('mover', 0, 0), cell('poison', 1, 0),
                    cell('mouth', -1, 1), cell('mouth', 0, 1), cell('mouth', 1, 1),
                ],
            },
            // Ambles toward prey and food, backs away from anything armed: it
            // only ever needs to make contact once.
            brain: oneState({ food: 9, producer: 6, mouth: 6, mover: 4, killer: -8 }),
        },
    },
    {
        id: 'whisperfang',
        name: 'Whisperfang',
        binomial: 'Chorus venatrix',
        tagline: 'Pack hunter that calls for help',
        description:
            'Small, quick and never alone: two fangs, two mouths and a pheromone gland. Pheromone reaches only its own kind, and every organism answers a pheromone signal by moving toward it — so a wounded Whisperfang summons the rest of the pack onto whatever is biting it. Released six at a time; alone it is unremarkable.',
        pack: 6,
        genome: {
            move_range: 3,
            mutability: 5,
            food_collected: 2,
            anatomy: {
                /* Deliberately the cheapest body here: seven cells means seven
                   food a generation, so a pack that finds prey compounds fast.
                   An earlier nine-cell build carried three fangs and one mouth
                   and starved beside its own kills in two worlds out of three. */
                cells: [
                    cell('killer', -1, -1), eye(0, -1), cell('killer', 1, -1),
                    cell('mouth', -1, 0), cell('mover', 0, 0), cell('mouth', 1, 0),
                    cell('pheromone', 0, 1),
                ],
            },
            /* pheromone is left at the default +10 by Brain.load, which is what
               makes the pack converge; killer is negative so a lone fang breaks
               off and rejoins instead of trading hits it cannot win. */
            brain: oneState({ food: 8, producer: 8, mouth: 8, mover: 7, killer: -4 }),
        },
    },
    {
        id: 'vesper-lance',
        name: 'Vesper Lance',
        binomial: 'Telum vespertinum',
        tagline: 'Sniper that kills from across the dish',
        description:
            'One shooter cell and a body built to keep it loaded. It fires along its heading whenever it sees anything alive, spending 2 food a shot, while its brain weights keep it backing away from anything armed — the only predator here that kills what it never touches. Four mouths, because a sniper that cannot feed itself stops firing.',
        pack: 4,
        genome: {
            move_range: 5,
            mutability: 4,
            food_collected: 4,
            anatomy: {
                /* Exactly one shooter: firing is gated on the anatomy's
                   has_shooter flag and the projectile spawns from the
                   organism's own square, so extra shooter cells add no rate
                   and no range -- they were three cells of upkeep buying
                   nothing. The space went to mouths, which is what actually
                   limits how often it can fire. */
                cells: [
                    eye(0, -2),
                    cell('mouth', -1, -1), cell('shooter', 0, -1), cell('mouth', 1, -1),
                    cell('mouth', -1, 0), cell('mover', 0, 0), cell('mouth', 1, 0),
                ],
            },
            /* Prey weights are small on purpose: it should close to a firing
               line, not charge. shoot() fires along the current heading before
               decide() re-aims, so it walks its fire onto a target over a
               couple of ticks. */
            brain: oneState(
                { food: 9, producer: 5, mouth: 4, mover: 4, killer: -10, armor: -3 },
                { producer: 'shoot', mouth: 'shoot', mover: 'shoot', armor: 'shoot', killer: 'shoot' },
            ),
        },
    },
    {
        id: 'cinderpod',
        name: 'Cinderpod',
        binomial: 'Pyroclasta ultima',
        tagline: 'Stalks quietly, detonates when wounded',
        description:
            'A two-state brain wrapped around three explosive cells. While healthy it stalks prey and keeps out of fights. Wound it past two thirds and it switches: it charges the nearest living thing and detonates, taking a radius of the world with it — and it detonates on death regardless, so killing one is its own kind of loss. Highly mutable, so a colony drifts fast.',
        pack: 5,
        genome: {
            move_range: 3,
            mutability: 8,
            food_collected: 2,
            anatomy: {
                cells: [
                    eye(0, -2),
                    cell('explosive', -1, -1), cell('explosive', 0, -1), cell('explosive', 1, -1),
                    cell('mouth', -1, 0), cell('mover', 0, 0), cell('mouth', 1, 0),
                ],
            },
            brain: {
                states: [
                    {
                        name: 'Stalk',
                        decisions: { food: 9, producer: 8, mouth: 8, mover: 6, killer: -8 },
                        actions: {},
                        /* Health is 100 minus damage as a percentage of cell
                           count, so on a 7-cell body this is the fifth hit.
                           At the 60 it started on it went critical on the
                           third, charged, and died childless in two worlds out
                           of three -- the event looked like a dud. */
                        transitions: [{ condition_type: 'Health', operator: '<', value: 35, target: 1 }],
                    },
                    {
                        name: 'Critical',
                        decisions: { producer: 10, mouth: 10, mover: 10, killer: 10, armor: 10 },
                        // Brain.decide calls die() on an explode action, which
                        // is what fires the explosive cells.
                        actions: {
                            producer: 'explode', mouth: 'explode', mover: 'explode',
                            killer: 'explode', armor: 'explode',
                        },
                        transitions: [],
                    },
                ],
            },
        },
    },
    {
        id: 'hollow-thief',
        name: 'Hollow Thief',
        binomial: 'Larvax cuculus',
        tagline: 'Invisible parasite; starves a world quietly',
        description:
            'Chameleon cells make it invisible to every eye in the world, and its parasite cells steal food from whatever it presses against. It kills nothing. Prey that never accumulates enough food never reproduces, so the population thins out with no corpses and no obvious cause.',
        pack: 4,
        genome: {
            move_range: 4,
            mutability: 5,
            food_collected: 1,
            anatomy: {
                /* Parasites on three sides, each with a free face to press
                   against prey -- the middle one used to sit boxed in by the
                   eye, its own flanks and the mover, where it could never
                   reach anything. Food comes mostly through them rather than
                   the single mouth: stolen food lands straight in the tally
                   that pays for reproduction. */
                cells: [
                    cell('parasite', -1, -1), eye(0, -1), cell('parasite', 1, -1),
                    cell('chameleon', -1, 0), cell('mover', 0, 0), cell('chameleon', 1, 0),
                    cell('parasite', 0, 1),
                    cell('mouth', 0, 2),
                ],
            },
            // Hunts producers hardest: they are the ones holding food.
            brain: oneState({ producer: 10, mouth: 9, mover: 8, food: 5, killer: -10 }),
        },
    },
];

export default PREDATORS;
