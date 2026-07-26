import CellStates from '../Organism/Cell/CellStates';
import Directions from '../Organism/Directions';
import type { LivingCellName } from '../Organism/Cell/CellStates';
import { WALL_BRAIN_CELLS } from '../Organism/Cell/BodyCells/BrainCell';
import type PreviewEnvironment from '../Environments/PreviewEnvironment';
import type { PreviewCellDef } from '../Environments/PreviewEnvironment';

/* Scenarios for the Organism Lab's live hover previews. Each one seeds a small
   scene into a real PreviewEnvironment and lets the actual simulation play it
   out -- a killer really harms its neighbour, a poison cell really sets
   poison_ticks, a shooter really fires a projectile through the real stepper.
   Nothing here scripts an animation; it only arranges the starting cells and,
   for a couple of cells whose trigger is brain-gated, nudges them each tick.
   The driver (CellHoverPreview) ticks the environment and re-runs setup() every
   `loopTicks` so each demo loops. */

// Grid the previews run on. Small and a touch wider than tall; the display
// canvas is CSS-scaled from this backing size (see CellHoverPreview).
export const PREVIEW_COLS = 17;
export const PREVIEW_ROWS = 13;
export const PREVIEW_CELL = 12;

// Scene centre.
const CX = Math.floor(PREVIEW_COLS / 2);
const CY = Math.floor(PREVIEW_ROWS / 2);

export interface PreviewScenario {
    // Ticks before the scene resets and replays.
    loopTicks: number;
    setup(env: PreviewEnvironment): void;
    // Optional per-tick nudge, for behaviours the brain would normally trigger.
    onTick?(env: PreviewEnvironment, tick: number): void;
}

// Scatter n food pellets over the interior, skipping occupied cells.
function scatterFood(env: PreviewEnvironment, n: number): void {
    for (let i = 0; i < n; i++) {
        const c = 1 + Math.floor(Math.random() * (PREVIEW_COLS - 2));
        const r = 1 + Math.floor(Math.random() * (PREVIEW_ROWS - 2));
        if (env.grid_map.stateAt(c, r) === CellStates.empty) {
            env.place(CellStates.food, c, r);
        }
    }
}

// Scatter n single-cell prey organisms over the interior, keeping the centre
// (where a roaming hunter starts) clear.
function scatterPrey(env: PreviewEnvironment, name: LivingCellName, n: number): void {
    let placed = 0;
    for (let tries = 0; placed < n && tries < 200; tries++) {
        const c = 1 + Math.floor(Math.random() * (PREVIEW_COLS - 2));
        const r = 1 + Math.floor(Math.random() * (PREVIEW_ROWS - 2));
        if (Math.abs(c - CX) <= 1 && Math.abs(r - CY) <= 1) continue;
        if (env.grid_map.stateAt(c, r) === CellStates.empty && env.grid_map.ownerAt(c, r) == null) {
            env.spawn([{ name, dc: 0, dr: 0 }], c, r);
            placed++;
        }
    }
}

export const PREVIEW_SCENARIOS: Record<LivingCellName, PreviewScenario> = {
    // Eats adjacent food: a mouthed grazer roams a food field, clearing it.
    mouth: {
        loopTicks: 150,
        setup(env) {
            scatterFood(env, 28);
            env.spawn([{ name: 'mouth', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX, CY);
        },
    },

    // Grows food: a little producer plant sprouts food into the empty cells
    // around it (real ~5%/tick production per producer cell).
    producer: {
        loopTicks: 150,
        setup(env) {
            env.spawn([
                { name: 'producer', dc: 0, dr: 0 },
                { name: 'producer', dc: 1, dr: 0 },
                { name: 'producer', dc: 0, dr: 1 },
            ], CX, CY);
        },
    },

    // Moves and turns: an eyeless critter random-walks the arena, turning at the
    // edges -- the real movement/rotation logic.
    mover: {
        loopTicks: 260,
        setup(env) {
            env.spawn([{ name: 'mover', dc: 0, dr: 0 }, { name: 'common', dc: 0, dr: 1 }], CX, CY);
        },
    },

    // Harms what it touches: a roaming killer mows through a field of bodies,
    // each dying to its touch and dropping to food.
    killer: {
        loopTicks: 150,
        setup(env) {
            env.spawn([{ name: 'killer', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX, CY);
            scatterPrey(env, 'common', 11);
        },
    },

    // Blocks killers: a roaming killer passes through a mix of bare bodies (which
    // die) and armoured ones (which shrug the strike off and remain).
    armor: {
        loopTicks: 160,
        setup(env) {
            env.spawn([{ name: 'killer', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX, CY);
            scatterPrey(env, 'common', 7);
            scatterPrey(env, 'armor', 7);
        },
    },

    // Sees ahead to steer: a mover with an eye hunts scattered food, its brain
    // (which chases food by default) steering it in.
    eye: {
        loopTicks: 160,
        setup(env) {
            scatterFood(env, 22);
            env.spawn([
                { name: 'mouth', dc: 0, dr: 0 },
                { name: 'mover', dc: 0, dr: 1 },
                { name: 'eye', dc: 0, dr: -1, dir: Directions.up },
            ], CX, CY);
        },
    },

    // Repairs damage: a central killer, a plain body (dies) beside a healer body
    // that out-heals the same attack (spending its stored food) and survives.
    healer: {
        loopTicks: 90,
        setup(env) {
            env.spawn([{ name: 'killer', dc: 0, dr: 0 }], CX, CY);
            env.spawn([{ name: 'common', dc: 0, dr: 0 }, { name: 'common', dc: 0, dr: 1 }], CX - 1, CY);
            env.spawn(
                [{ name: 'healer', dc: 0, dr: 0 }, { name: 'common', dc: 0, dr: 1 }],
                CX + 1, CY, { food: 1e9 },
            );
        },
    },

    /* Explodes on death: a killer gnaws at a bomber until it dies, the charge
       telegraphs, and the real blast scatters explosion cells and harms the
       ring of bodies around it.

       The bomber is a five-cell body, not a lone explosive cell, and that is
       load-bearing rather than decorative. A single cell adjacent to a killer
       dies on the very first tick, which is what used to make this preview open
       already exploding: the loop spent one frame on the organism and the
       remaining twenty-odd on the aftermath. Health is cell count
       (Organism.maxHealth), and the killer reaches exactly one of these cells
       for one point of damage a tick, so the body buys five ticks of being
       visibly alive and under attack before it dies -- and only then does the
       charge light its fuse (ExplosionFx.FUSE_TICKS) and go off. */
    explosive: {
        // Five ticks of the killer chewing, five of fuse, eight of fireball,
        // then a beat of quiet before the scene replays.
        loopTicks: 24,
        setup(env) {
            env.spawn([
                { name: 'explosive', dc: 0, dr: 0 },
                { name: 'common', dc: 0, dr: -1 },
                { name: 'common', dc: 0, dr: 1 },
                { name: 'common', dc: 1, dr: 0 },
                { name: 'common', dc: 1, dr: 1 },
            ], CX, CY);
            env.spawn([{ name: 'killer', dc: 0, dr: 0 }], CX - 1, CY);
            // Inside radius 2 these die with the bomber; the outer three stand,
            // so the blast has a visible edge.
            for (const [dc, dr] of [[2, 0], [0, -2], [0, 2], [2, 2], [3, 0], [-2, 2]]) {
                env.spawn([{ name: 'common', dc: 0, dr: 0 }], CX + dc, CY + dr);
            }
        },
    },

    // Poisons on touch: a roaming poison cell brushes past bodies, which keep
    // the lingering poison and die a few ticks later -- often after it has moved
    // on.
    poison: {
        loopTicks: 150,
        setup(env) {
            env.spawn([{ name: 'poison', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX, CY);
            scatterPrey(env, 'common', 11);
        },
    },

    // Emits a signal: same-species movers at the edges sense the pheromone
    // (their brains are drawn to it by default) and converge on the emitter.
    pheromone: {
        loopTicks: 170,
        setup(env) {
            const kin = env.createSpecies(null);
            env.spawn([{ name: 'pheromone', dc: 0, dr: 0 }, { name: 'common', dc: 0, dr: 1 }], CX, CY, { species: kin });
            const starts: [number, number][] = [
                [2, 2],
                [PREVIEW_COLS - 3, 2],
                [2, PREVIEW_ROWS - 3],
                [PREVIEW_COLS - 3, PREVIEW_ROWS - 3],
            ];
            for (const [c, r] of starts) {
                env.spawn([
                    { name: 'mover', dc: 0, dr: 0 },
                    { name: 'eye', dc: 0, dr: -1, dir: Directions.up },
                ], c, r, { species: kin });
            }
        },
    },

    // Plain structural cell: the scaffold. A small creature built mostly of
    // common cells, holding a mouth and a producer together into a working body.
    common: {
        loopTicks: 160,
        setup(env) {
            env.spawn([
                { name: 'mouth', dc: 0, dr: 0 },
                { name: 'common', dc: 0, dr: -1 },
                { name: 'common', dc: 0, dr: 1 },
                { name: 'common', dc: -1, dr: 0 },
                { name: 'producer', dc: 1, dr: 0 },
            ], CX, CY);
        },
    },

    // Steals food: a parasite latched onto a food-collecting host plant, draining
    // the food the host gathers (the theft itself is internal, so watch the host
    // work while the parasite feeds).
    parasite: {
        loopTicks: 130,
        setup(env) {
            env.spawn([
                { name: 'mouth', dc: 0, dr: 0 },
                { name: 'producer', dc: 0, dr: 1 },
                { name: 'producer', dc: 0, dr: -1 },
            ], CX + 1, CY, { food: 8 });
            env.spawn([{ name: 'parasite', dc: 0, dr: 0 }, { name: 'common', dc: 0, dr: -1 }], CX, CY);
        },
    },

    // Invisible to eyes: the engine renders a chameleon body faint, and eyes look
    // straight through it. A chameleon critter (translucent) roams beside an
    // ordinary one (opaque) as a watchful eye patrols.
    chameleon: {
        loopTicks: 220,
        setup(env) {
            env.spawn([{ name: 'chameleon', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX + 2, CY);
            env.spawn([{ name: 'common', dc: 0, dr: 0 }, { name: 'mover', dc: 0, dr: 1 }], CX - 2, CY);
            env.spawn([
                { name: 'eye', dc: 0, dr: 0, dir: Directions.right },
                { name: 'mover', dc: 0, dr: 1 },
            ], CX, CY + 3);
        },
    },

    // Fires at targets: a shooter looses a real projectile at a body across the
    // arena every so often; the round travels and deals its hit. (Shooting is
    // brain-gated in the world, so the preview triggers the same shoot() here.)
    shooter: {
        loopTicks: 60,
        setup(env) {
            const s = env.spawn([{ name: 'shooter', dc: 0, dr: 0 }], CX - 3, CY, { food: 1e9 });
            s.direction = Directions.right;
            env.spawn([
                { name: 'common', dc: 0, dr: 0 },
                { name: 'common', dc: 0, dr: 1 },
                { name: 'common', dc: 0, dr: -1 },
            ], CX + 3, CY);
        },
        onTick(env, tick) {
            if (tick % 16 === 0) {
                const shooter = env.organisms.find(o => o.anatomy.has_shooter);
                if (shooter) {
                    shooter.food_collected = 1e9;
                    shooter.direction = Directions.right;
                    shooter.shoot();
                }
            }
        },
    },

    /* Nothing alone, everything at ten: two builders walk the same line, and
       only the one carrying WALL_BRAIN_CELLS leaves a wall behind it. The
       stunted one below it is the whole point of the cell -- it is trying just
       as hard, on the same food, through the same buildWall(). */
    brain: {
        loopTicks: 190,
        setup(env) {
            // Ten brain cells in a 5x2 block behind a mover, which is what a
            // body actually has to spend to earn the behaviour.
            const smart: PreviewCellDef[] = [{ name: 'mover', dc: 0, dr: 0 }];
            for (let i = 0; i < WALL_BRAIN_CELLS; i++) {
                smart.push({ name: 'brain', dc: 1 + (i % 5), dr: i < 5 ? 0 : 1 });
            }
            env.spawn(smart, 3, CY - 3, { food: 1e9 }).direction = Directions.right;

            // The control: same mover, same food, two brain cells short of it.
            env.spawn([
                { name: 'mover', dc: 0, dr: 0 },
                { name: 'brain', dc: 1, dr: 0 },
                { name: 'brain', dc: 2, dr: 0 },
            ], 3, CY + 3, { food: 1e9 }).direction = Directions.right;
        },
        onTick(env) {
            /* Held on course and topped up, so the only difference left between
               the two is how much nerve tissue each is carrying. buildWall()
               itself is the real one -- the gate is inside it. */
            for (const org of env.organisms) {
                org.food_collected = 1e9;
                org.direction = Directions.right;
                org.buildWall();
            }
        },
    },
};
