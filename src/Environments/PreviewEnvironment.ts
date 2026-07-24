import Environment from './Environment';
import Renderer from '../Rendering/Renderer';
import GridMap from '../Grid/GridMap';
import CellStates from '../Organism/Cell/CellStates';
import Organism from '../Organism/Organism';
import Species from '../Stats/Species';
import { NO_OP_PERF } from '../Stats/Perf';
import { makeDefaultHyperparams } from '../Hyperparameters';
import drawOrganismDecorations from '../Rendering/DecorationRenderer';
import { stepExplosions, stepProjectiles } from './EnvironmentEffects';
import type { OrganismEnv, OrganismProjectile } from '../Organism/Organism';
import type { CellState, LivingCellName, RenderCellOwnerLike } from '../Organism/Cell/CellStates';
import type BodyCell from '../Organism/Cell/BodyCells/BodyCell';
import type Anatomy from '../Organism/Anatomy';
import type { Direction } from '../Organism/Directions';
import type { HyperparamsData } from '../Hyperparameters';
import type { PerfLike } from '../Stats/Perf';
import type { Fossilizer } from '../Stats/Species';

/* A self-contained mini-world that runs the real simulation for the Organism
   Lab's hover previews: real GridMap, real Renderer, real Organism.update() and
   BodyCell.performFunction(), stepped through the same EnvironmentEffects the
   world uses. What it deliberately does NOT touch is the global engine state a
   second world would corrupt -- it never calls FossilRecord (species live only
   on the organisms it seeds, with population parked high so a death never
   fossilizes) and never reproduces (canAddOrganism is always false), so it can
   run alongside the real world with no shared-state risk. Cheap enough to build,
   tick and throw away per hover.

   Every module singleton the simulation would otherwise reach is injected here
   as a private, inert substitute rather than mutated in place:
   - `hyperparams` -- a fresh defaults object, so previews show canonical
     behaviour whatever the player's Evolution Controls say;
   - `perf` (NO_OP_PERF) -- so preview ticks never land in the real perf panel's
     buckets;
   - each seeded Species' fossil record (NO_OP_FOSSIL) -- so a preview death
     never touches the global FossilRecord.
   Nothing global is swapped or restored; the real world simply never shares
   these objects with the preview. */

// A FossilRecord that records nothing, for the throwaway species previews seed.
const NO_OP_FOSSIL: Fossilizer = { fossilize: () => false };

// The grid narrowed the way the world narrows it: ownerAt/ownerOf hand back the
// real Organism, which the effect steppers and cell functions call methods on.
interface PreviewGridMap extends GridMap {
    ownerAt(col: number, row: number): Organism | null;
    ownerOf(idx: number): Organism | null;
}

/* One cell of a seeded organism: a living-cell type at a body-local offset, plus
   an eye's optional facing. */
export interface PreviewCellDef {
    name: LivingCellName;
    dc: number;
    dr: number;
    dir?: number;
}

export interface PreviewSpawnOpts {
    rotation?: Direction;
    food?: number;
    damage?: number;
    // Share one Species across organisms (pheromone talks to same-species kin).
    species?: Species;
}

class PreviewEnvironment extends Environment {
    renderer: Renderer;
    grid_map: PreviewGridMap;
    organisms: Organism[];
    active_projectiles: OrganismProjectile[];
    active_explosions: { col: number; row: number; ticks: number }[];
    radiation_map: Set<string>;
    is_night: boolean;
    total_ticks: number;
    cols: number;
    rows: number;
    cell_size: number;
    // Injected into every organism this env seeds (via OrganismEnv), so previews
    // ignore the player's Evolution Controls and never record into the real perf
    // panel. Standalone objects, never the global singletons.
    hyperparams: HyperparamsData;
    perf: PerfLike;

    constructor(cols: number, rows: number, cell_size: number) {
        super();
        this.cols = cols;
        this.rows = rows;
        this.cell_size = cell_size;
        this.hyperparams = makeDefaultHyperparams();
        this.perf = NO_OP_PERF;
        this.renderer = new Renderer(null, null, cell_size);
        this.grid_map = new GridMap(cols, rows, cell_size) as PreviewGridMap;
        this.renderer.grid_map = this.grid_map;
        // The renderer's neighbour probe (organism-cell corner cutouts) reads
        // the grid back through this env.
        this.renderer.env = this;
        this.organisms = [];
        this.active_projectiles = [];
        this.active_explosions = [];
        this.radiation_map = new Set();
        this.is_night = false;
        this.total_ticks = 0;
        this.grid_map.fillGrid(CellStates.empty);
    }

    bindCanvas(canvas: HTMLCanvasElement): void {
        this.renderer.bindCanvas(canvas, null);
        // bindCanvas sizes the canvas to the window; resize it to exactly the grid.
        this.renderer.fillShape(this.rows * this.cell_size, this.cols * this.cell_size);
    }

    releaseCanvas(): void {
        this.renderer.bindCanvas(null, null);
    }

    /* Widened owner past the base's RenderCellOwnerLike, exactly as
       WorldEnvironment/OrganismEditor do: Organism.updateGrid hands body cells
       through here, and only EyeCell implements getAbsoluteDirection, so the two
       views do not unify. Downstream only stores the value and reads .org. */
    changeCell(c: number, r: number, state: CellState, owner: RenderCellOwnerLike | BodyCell | null): void {
        super.changeCell(c, r, state, owner as RenderCellOwnerLike | null);
    }

    /* A preview stages a fixed scene rather than an evolving population, so by
       design it never breeds -- reproduction would clutter the demo and make it
       unrepeatable. Organism.reproduce() asks this before adding a child, so
       answering "no" is the intended off switch; it also happens to keep the
       one reproduction-only reach into the global FossilRecord (addSpecies)
       unreachable, which the injected fossil sink does not cover. */
    canAddOrganism(): boolean {
        return false;
    }

    addOrganism(org: Organism): void {
        org.updateGrid();
        this.organisms.push(org);
    }

    // A species wired to the no-op fossil record, so its organisms' deaths never
    // reach the global FossilRecord. Scenarios that share one species across kin
    // (pheromone) build it here too.
    createSpecies(anatomy: Anatomy | null): Species {
        return new Species(anatomy, null, 0, NO_OP_FOSSIL);
    }

    // Wipe the scene back to an empty grid so a scenario can re-seed for its loop.
    clearScene(): void {
        for (const org of this.organisms) org.living = false;
        this.organisms = [];
        this.active_projectiles = [];
        this.active_explosions = [];
        this.grid_map.fillGrid(CellStates.empty);
        this.total_ticks = 0;
    }

    // Paint a bare environmental cell (food, wall) with no owner.
    place(state: CellState, c: number, r: number): void {
        this.changeCell(c, r, state, null);
    }

    // Seed one organism from a compact cell list, centred at world cell (c, r).
    spawn(cells: PreviewCellDef[], c: number, r: number, opts: PreviewSpawnOpts = {}): Organism {
        const org = new Organism(c, r, this as unknown as OrganismEnv);
        for (const d of cells) {
            const bc = org.anatomy.addDefaultCell(CellStates[d.name] as CellState<LivingCellName>, d.dc, d.dr);
            if (d.dir != null) (bc as unknown as { direction: number }).direction = d.dir;
        }
        if (opts.rotation != null) org.rotation = opts.rotation;
        // Local species wired to the no-op fossil record (see createSpecies), so
        // this organism's death never reaches the global FossilRecord.
        org.species = opts.species ?? this.createSpecies(org.anatomy);
        if (opts.food != null) org.food_collected = opts.food;
        if (opts.damage != null) org.damage = opts.damage;
        this.addOrganism(org);
        return org;
    }

    update(): void {
        this.tick();
    }

    tick(): void {
        // Organisms record into the injected NO_OP_PERF, and the effect steppers
        // touch no globals, so a tick needs no isolation around it.
        const dead: number[] = [];
        for (let i = 0; i < this.organisms.length; i++) {
            const org = this.organisms[i];
            if (!org.living || !org.update()) dead.push(i);
        }
        for (let k = dead.length - 1; k >= 0; k--) this.organisms.splice(dead[k], 1);
        stepExplosions(this);
        stepProjectiles(this);
        this.total_ticks++;
    }

    render(): void {
        const ctx = this.renderer.ctx;
        if (!ctx) return;
        // Full repaint each frame (the grid is tiny): this both clears the canvas
        // and lays the flat cells, then the decoration pass adds the shaded
        // sprites, outlines and eyes on top -- the same single-canvas layering
        // OrganismEditor uses.
        this.renderer.renderFullGrid();
        drawOrganismDecorations(ctx, this as unknown as Parameters<typeof drawOrganismDecorations>[1], false, true);
        // The full-grid repaint above wipes the projectile squares the stepper
        // drew during the tick, so redraw the live ones on top.
        const cs = this.cell_size;
        for (const p of this.active_projectiles) {
            ctx.fillStyle = '#d2691e';
            ctx.fillRect(p.col * cs + cs / 4, p.row * cs + cs / 4, cs / 2, cs / 2);
        }
    }
}

export default PreviewEnvironment;
