import Environment from './Environment';
import Renderer from '../Rendering/Renderer';
import drawOrganismDecorations from '../Rendering/DecorationRenderer';
import GridMap from '../Grid/GridMap';
import Organism from '../Organism/Organism';
import CellStates from '../Organism/Cell/CellStates';
import EnvironmentController from '../Controllers/EnvironmentController';
import Hyperparams from '../Hyperparameters.js';
import FossilRecord from '../Stats/FossilRecord';
import Perf from '../Stats/Perf';
import WorldConfig from '../WorldConfig';
import SerializeHelper from '../Utils/SerializeHelper';
import Species from '../Stats/Species';
import type { CellState, RenderCellOwnerLike } from '../Organism/Cell/CellStates';
import type Cell from '../Organism/Cell/GridCell';
import type BodyCell from '../Organism/Cell/BodyCells/BodyCell';
import type { OrganismEnv, OrganismProjectile, SerializedOrganism } from '../Organism/Organism';
import type { SerializedGridMap } from '../Grid/GridMap';
import type { SerializedFossilRecord } from '../Stats/FossilRecord';
import type { HyperparamsSingleton } from '../Hyperparameters';
/* Type-only, so it is erased at emit and closes no runtime cycle -- Engine
   imports this module for real. */
import type Engine from '../Engine';

/* A grid cell as this environment reaches through it. GridCell declares `owner`
   as RenderOrganismLike, which models only what CellState.render needs; this
   class calls die() and takeDamage() on it, so the owner is renarrowed to the
   real Organism here. Narrowing is legal because Organism satisfies
   RenderOrganismLike and the value stored really is an Organism --
   GridMap.setCellOwner derives it from `cell_owner.org`. Same pattern as
   ControllerCell in EnvironmentController.ts.

   `cell_owner` is deliberately NOT renarrowed to BodyCell, even though that is
   what it always holds: GridCell types it as RenderCellOwnerLike, which demands
   getAbsoluteDirection(), and of the body cells only EyeCell implements that.
   The two views therefore do not unify -- the same gap EnvironmentController.ts
   documents at dropOrganism(), and the reason the OrganismEnv seam below needs
   an assertion. */
interface WorldCell extends Cell {
    owner: Organism | null;
}

/* GridMap with that narrowing threaded through cellAt(). */
interface WorldGridMap extends GridMap {
    cellAt(col: number, row: number): WorldCell | null;
}

/* The saved world: whatever SerializeHelper.copyNonObjects leaves of a
   WorldEnvironment -- every non-object own property -- plus the four nested
   values serialize() attaches by hand. `deco_dirty` and `glow_dirty` are
   optional because they are only ever assigned once an overlay canvas exists
   (see syncOverlaySizes). The index signature is what lets loadRaw's reflective
   overwriteNonObjects walk this shape. */
export interface SerializedWorld {
    num_rows: number;
    num_cols: number;
    total_mutability: number;
    largest_cell_count: number;
    reset_count: number;
    total_ticks: number;
    data_update_rate: number;
    day_timer: number;
    is_night: boolean;
    deco_dirty?: boolean;
    glow_dirty?: boolean;
    grid: SerializedGridMap;
    organisms: SerializedOrganism[];
    fossil_record: SerializedFossilRecord;
    controls: HyperparamsSingleton;
    [key: string]: unknown;
}

/* The position fields loadRaw() reads off each saved organism. Neither is ever
   written: Organism.serialize() emits the position as `c`/`r`. Declared as its
   own optional pair, instead of leaning on SerializedOrganism's `unknown` index
   signature, so that their absence is visible in the type. See the comment at
   the constructor call in loadRaw(). */
type SavedOrganism = SerializedOrganism & { col?: number; row?: number };

// Glow overlay tuning. The scratch canvas renders at 1/DOWNSCALE resolution
// and is upscaled with smoothing, so a bigger divisor diffuses the halo more.
// SPREAD widens each cell before that blur; ALPHA sets peak intensity.
const GLOW_DOWNSCALE = 6;
const GLOW_SPREAD = 1.5;
const GLOW_ALPHA = 0.1;

/* Floor between decoration repaints (~30Hz). Organisms move at most one cell
   per tick, so an outline lagging its body by a frame or two is invisible in
   motion -- and the cap halves the cost of the most expensive render pass. */
const DECO_MIN_REPAINT_MS = 33;

class WorldEnvironment extends Environment{
    /* No initializers anywhere below: useDefineForClassFields is false and these
       must stay bare declarations, so the constructor assignments remain the
       only writes. */
    container: HTMLElement | null;
    renderer: Renderer;
    glow_canvas: HTMLCanvasElement | null;
    glow_ctx: CanvasRenderingContext2D | null;
    glow_scratch: HTMLCanvasElement;
    /* Non-null asserted, unlike the two overlay contexts above: the scratch
       canvas is created on the line before, so getContext('2d') on it cannot
       fail the way it can for a canvas the React layer may not have mounted. */
    glow_scratch_ctx: CanvasRenderingContext2D;
    deco_canvas: HTMLCanvasElement | null;
    deco_ctx: CanvasRenderingContext2D | null;
    controller: EnvironmentController;
    num_rows: number;
    num_cols: number;
    grid_map: WorldGridMap;
    organisms: Organism[];
    walls: WorldCell[];
    total_mutability: number;
    largest_cell_count: number;
    reset_count: number;
    total_ticks: number;
    data_update_rate: number;
    active_explosions: { col: number; row: number; ticks: number }[];
    active_projectiles: OrganismProjectile[];
    radiation_map: Set<string>;
    day_timer: number;
    is_night: boolean;
    /* Genuinely absent for a real window: syncOverlaySizes() is the only writer
       the constructor reaches, and it sets each of these only when the matching
       overlay canvas exists. With no overlays (headless, or before React mounts
       them) both stay unset for the lifetime of the environment -- which is
       safe only because renderDecorations()/renderGlow() bail on the null
       context first. Hence `| undefined` rather than a definite-assignment `!`. */
    deco_dirty: boolean | undefined;
    glow_dirty: boolean | undefined;
    /* When the decoration pass last repainted. In a busy world something
       changes every tick, so deco_dirty alone means "repaint every frame" --
       and the pass is a full clear + one drawImage per organism, the largest
       single item in the measured render cost. Repaints are therefore also
       capped at DECO_MIN_REPAINT_MS; the dirty flag stays set in between, so
       nothing is lost, just deferred a frame or two. */
    last_deco_repaint: number;
    /* The hovered organism, written by CanvasController and read by the
       decoration pass, which tints that organism's sprite. Never initialized,
       for the same reason as the fields above: no pointer has moved yet. A
       stale reference to an organism that has since died is harmless -- the
       decoration pass skips non-living organisms before it reaches the tint. */
    highlighted_org: Organism | null | undefined;
    /* Assigned from outside by Engine right after it constructs this, so absent
       for the window in between -- setNightMode() guards on it. */
    engine?: Engine;
    /* Spatial index over living organisms for pheromone broadcasts, rebuilt
       lazily at most once per tick and only on ticks where something is
       damaged. Wrapped in one object on purpose: serialize() copies own
       non-object properties, so a bare `tick` stamp would round-trip through
       saves and could collide with a restored total_ticks, presenting an
       empty index as fresh. An object is skipped wholesale. */
    pheromone_index: { tick: number; bucket: number; map: Map<number, Organism[]> };

    constructor(cell_size: number, canvas: HTMLCanvasElement | null, container: HTMLElement | null, glow_canvas: HTMLCanvasElement | null = null, deco_canvas: HTMLCanvasElement | null = null) {
        super();
        this.container = container;
        this.renderer = new Renderer(canvas, container, cell_size);
        this.renderer.env = this;
        // Glow is a separate compositing pass: organisms are drawn flat onto a
        // scratch canvas, then blitted once with a blur filter onto an overlay
        // canvas that shares the world's pan/zoom transform. Per-cell canvas
        // shadows don't work here: neighboring cells overpaint each other's
        // spill, and incremental rendering leaves trails.
        this.glow_canvas = glow_canvas;
        this.glow_ctx = glow_canvas ? glow_canvas.getContext('2d') : null;
        this.glow_scratch = document.createElement('canvas');
        this.glow_scratch_ctx = this.glow_scratch.getContext('2d')!;
        // Decorations (outlines, connective tissue) overflow their cells'
        // pixel boxes, so they live on their own overlay that is cleared and
        // fully repainted when the world changes — the dirty-rect world
        // canvas would clip and smear them.
        this.deco_canvas = deco_canvas;
        this.deco_ctx = deco_canvas ? deco_canvas.getContext('2d') : null;
        this.last_deco_repaint = 0;
        this.syncOverlaySizes();
        /* The controller declares its own structural view of this environment,
           and the two cannot unify today: that view's renderer types
           highlightOrganism() with the shared RenderOrganismLike, while the real
           Renderer types it with its own shape that additionally requires
           getRealCell(). Neither is assignable to the other, so the mismatch is
           in already-converted files, not here. Spelled as the field's declared
           type rather than re-declaring its unexported interface. */
        this.controller = new EnvironmentController(this as unknown as EnvironmentController['env'], this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        /* The narrowing described on WorldGridMap: the map built here is an
           ordinary GridMap, only viewed through the narrower cell type. */
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size) as WorldGridMap;
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.radiation_map = new Set();
        this.day_timer = 0;
        this.is_night = false;
        this.pheromone_index = { tick: -1, bucket: 0, map: new Map() };
        FossilRecord.setEnv(this);
    }

    /* The buckets an organism at (c, r) must scan to see every living organism
       within `radius` (manhattan): bucket side = radius, so the 3x3 block of
       buckets around the caller's own covers the whole range. Rebuilt on first
       use each tick -- ticks with no damaged organisms never pay for it. The
       index snapshots positions as of that first use; an organism moving later
       the same tick can drift one cell across a bucket edge, which is inside
       the noise of a broadcast whose radius is a gameplay heuristic. */
    getOrganismsNear(c: number, r: number, radius: number): Organism[][] {
        const idx = this.pheromone_index;
        const bucket = Math.max(1, radius);
        if (idx.tick !== this.total_ticks || idx.bucket !== bucket) {
            idx.tick = this.total_ticks;
            idx.bucket = bucket;
            idx.map.clear();
            for (const org of this.organisms) {
                if (!org.living) continue;
                const key = Math.floor(org.c / bucket) * 100003 + Math.floor(org.r / bucket);
                let arr = idx.map.get(key);
                if (!arr) {
                    arr = [];
                    idx.map.set(key, arr);
                }
                arr.push(org);
            }
        }
        const bc = Math.floor(c / bucket);
        const br = Math.floor(r / bucket);
        const out: Organism[][] = [];
        for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
                const arr = idx.map.get((bc + dc) * 100003 + (br + dr));
                if (arr) out.push(arr);
            }
        }
        return out;
    }

    /* Engine calls this as `env.update(this.sim_delta_time)` and always has, but
       the tick is fixed-step and nothing below reads a delta. The parameter is
       declared (optional, unused) so that existing call keeps type-checking
       without changing either side's behaviour; the base class declares
       update() with no parameters, and widening in an override is sound. */
    update(_sim_delta_time?: number): void {
        var t = Perf.begin();
        var to_remove: string[] = [];
        for (var i in this.organisms) {
            var org: Organism = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        Perf.end('organisms', t);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }

        t = Perf.begin();
        // Update active explosions
        var remaining_explosions: { col: number; row: number; ticks: number }[] = [];
        for (var exp of this.active_explosions) {
            exp.ticks--;
            if (exp.ticks <= 0) {
                var cell = this.grid_map.cellAt(exp.col, exp.row);
                if (cell && cell.state === CellStates.explosion) {
                    this.changeCell(exp.col, exp.row, CellStates.empty, null);
                }
            } else {
                remaining_explosions.push(exp);
            }
        }
        this.active_explosions = remaining_explosions;

        // Update active projectiles
        var remaining_projectiles: OrganismProjectile[] = [];
        for (var proj of this.active_projectiles) {
            // Clear current pos
            var current_cell = this.grid_map.cellAt(proj.col, proj.row);
            // Move projectile
            proj.col += proj.dir_col;
            proj.row += proj.dir_row;
            proj.ticks++;

            var target_cell = this.grid_map.cellAt(proj.col, proj.row);
            var hit = false;

            if (target_cell) {
                if (target_cell.state === CellStates.wall || target_cell.state === CellStates.invincible_wall) {
                    hit = true;
                    if (target_cell.state === CellStates.wall) {
                        if (typeof target_cell.durability !== 'undefined') {
                            target_cell.durability -= 5;
                            if (target_cell.durability <= 0) {
                                this.changeCell(target_cell.col, target_cell.row, CellStates.empty, null);
                            }
                        } else {
                            this.changeCell(target_cell.col, target_cell.row, CellStates.empty, null);
                        }
                    }
                } else if (target_cell.owner && target_cell.owner !== proj.owner) {
                    hit = true;
                    target_cell.owner.takeDamage(5); // Projectile deals 5 damage
                }
            } else {
                hit = true; // Off screen
            }

            if (!hit && proj.ticks < 50) { // Max range 50
                remaining_projectiles.push(proj);
                if (this.renderer.ctx) {
                    this.renderer.ctx.fillStyle = '#d2691e';
                    this.renderer.ctx.fillRect(proj.col * this.renderer.cell_size + this.renderer.cell_size/4, proj.row * this.renderer.cell_size + this.renderer.cell_size/4, this.renderer.cell_size/2, this.renderer.cell_size/2);
                }
            }
        }
        this.active_projectiles = remaining_projectiles;
        Perf.end('fx', t);

        // Day/Night Cycle
        this.day_timer++;
        if (this.day_timer > 3600) { // 1 minute at 60 ticks per second
            this.day_timer = 0;
            this.setNightMode(!this.is_night);
        }

        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            t = Perf.begin();
            FossilRecord.updateData();
            Perf.end('fossil', t);
        }
    }

    // Night is engine state, not a visual effect: EyeCell reads is_night inside
    // the sim loop to clamp vision range, so it can't round-trip through React.
    // Its appearance (canvas filter, void color) is applied by App from this
    // flag — pushing styles onto elements from here meant every path that left
    // night mode had to remember to undo all four of them, and reset() didn't.
    setNightMode(isNight: boolean): void {
        this.is_night = Boolean(isNight);
        this.day_timer = 0;
        // Forced: while the sim is paused there is no frame loop to refresh the
        // HUD, and its toggle reads is_night to pick the next target — a stale
        // value leaves it stuck on one side. Unguarded on purpose, so renaming
        // the emit breaks loudly here instead of silently freezing the toggle.
        if (this.engine) {
            this.engine.emitChange(true);
        }
    }

    render(): void {
        // Sampled before the headless early-out clears the set, so the gauge
        // stays honest about how much churn each tick produces either way.
        Perf.gauge('dirty_cells', this.renderer.cells_to_render.size);
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        var t = Perf.begin();
        this.renderer.renderCells();
        Perf.end('cells_draw', t);
        this.renderer.renderHighlights();
        this.controller.renderCursorOverlay();
        /* Both overlay passes early-out on their dirty flags, so their avg
           stays near zero; the max column is what shows the repaint spike. */
        t = Perf.begin();
        this.renderDecorations();
        Perf.end('deco', t);
        t = Perf.begin();
        this.renderGlow();
        Perf.end('glow', t);
    }

    syncOverlaySizes(): void {
        if (this.deco_canvas) {
            this.deco_canvas.width = this.renderer.width;
            this.deco_canvas.height = this.renderer.height;
            this.deco_dirty = true;
        }
        if (!this.glow_canvas) return;
        this.glow_canvas.width = this.renderer.width;
        this.glow_canvas.height = this.renderer.height;
        // The scratch is rendered small: upscaling it with image smoothing
        // produces the soft halo for free, where a per-frame blur() filter at
        // full resolution dragged the whole app down.
        this.glow_scratch.width = Math.max(1, Math.ceil(this.renderer.width / GLOW_DOWNSCALE));
        this.glow_scratch.height = Math.max(1, Math.ceil(this.renderer.height / GLOW_DOWNSCALE));
        this.glow_dirty = true;
    }

    renderDecorations(): void {
        if (!this.deco_ctx || WorldConfig.headless) return;
        // Like glow, only repaint when the world changed; pan/zoom move the
        // overlay via its CSS transform instead.
        if (!this.deco_dirty) return;
        // Rate cap: leave the flag set so the deferred repaint still happens
        // on a later frame -- see the field comment on last_deco_repaint.
        const now = Date.now();
        if (now - this.last_deco_repaint < DECO_MIN_REPAINT_MS) return;
        this.last_deco_repaint = now;
        this.deco_dirty = false;
        drawOrganismDecorations(this.deco_ctx, this);
    }

    renderGlow(): void {
        if (!this.glow_ctx || WorldConfig.headless) return;
        // Only re-composite when the world changed (changeCell/addOrganism);
        // pan and zoom move the overlay via its CSS transform instead.
        if (!this.glow_dirty) return;
        this.glow_dirty = false;

        var w = this.renderer.width;
        var h = this.renderer.height;
        var cs = this.renderer.cell_size / GLOW_DOWNSCALE;
        var margin = cs * (GLOW_SPREAD - 1) / 2;

        var sctx = this.glow_scratch_ctx;
        sctx.clearRect(0, 0, this.glow_scratch.width, this.glow_scratch.height);
        for (var org of this.organisms) {
            for (var body_cell of org.anatomy.cells) {
                /* getRealCell() returns Organism's own structural view of a grid
                   cell, which omits the pixel coordinates; every organism in this
                   environment sits on this grid_map, so the value is one of its
                   cells and carries x/y. Routed through `unknown` because the two
                   views of a grid cell do not overlap for the checker: the
                   organism's omits x/y/setType entirely. */
                var cell = org.getRealCell(body_cell) as unknown as WorldCell | null;
                if (cell == null) continue;
                sctx.fillStyle = body_cell.custom_color || body_cell.state.color;
                sctx.fillRect(
                    cell.x / GLOW_DOWNSCALE - margin,
                    cell.y / GLOW_DOWNSCALE - margin,
                    cs * GLOW_SPREAD,
                    cs * GLOW_SPREAD
                );
            }
        }

        var gctx = this.glow_ctx;
        gctx.clearRect(0, 0, w, h);
        gctx.globalAlpha = GLOW_ALPHA;
        gctx.imageSmoothingEnabled = true;
        gctx.drawImage(this.glow_scratch, 0, 0, this.glow_scratch.width, this.glow_scratch.height, 0, 0, w, h);
        gctx.globalAlpha = 1;
    }

    renderFull(): void {
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.deco_dirty = true;
    }

    /* The indices arrive as strings: both callers collect them with `for...in`
       over the organism array, which yields keys, not numbers. */
    removeOrganisms(org_indeces: string[]): void {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            /* Element access and splice() both coerce the string index at
               runtime exactly as the JS did; the casts record that rather than
               changing the value passed. */
            this.total_mutability -= this.organisms[i as unknown as number].mutability;
            this.organisms.splice(i as unknown as number, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause) {
                this.engine?.stop();
            }
            else if (WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset();
            }
        }
    }

    OriginOfLife(): void {
        var center = this.grid_map.getCenter();
        /* Organism declares its own view of this same environment
           (OrganismEnv) and the two still cannot unify -- but no longer for any
           reason this cleanup can reach. A grid cell's `cell_owner` is
           RenderCellOwnerLike in GridCell and BodyCell in OrganismGridCell, and
           neither satisfies the other: BodyCell lacks getAbsoluteDirection,
           which lives on EyeCell alone. That is a GridCell-side variance
           problem, independent of Organism being typed. The cast stays until
           cell_owner has one type. Same assertion, same reason, as
           EnvironmentController.dropOrganism(). */
        var org = new Organism(center[0], center[1], this as unknown as OrganismEnv);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        /* Species first, then publish. Everything reachable from env.organisms
           -- update(), reproduce(), die() -- dereferences org.species without a
           guard, so an organism must not be visible in the world before it has
           one. The old order left a one-statement window where it was. */
        FossilRecord.addSpecies(org, null);
        this.addOrganism(org);
    }

    addOrganism(organism: Organism): void {
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count)
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism(): boolean {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability(): number {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    /* The owner parameter is widened past the base class's, which declares only
       `RenderCellOwnerLike | null`: Organism.updateGrid() really does hand body
       cells through here. Widening a parameter in an override is sound, so no
       assertion is needed on the declaration -- only on the forward below,
       because RenderCellOwnerLike demands getAbsoluteDirection(), which of the
       body cells only EyeCell implements. Nothing downstream calls it for a
       non-eye cell: GridMap.setCellOwner only stores the value and reads .org,
       and CellState.render only reaches for it from EyeCell's own renderer.
       Mirrors OrganismEditor.changeCell verbatim. */
    changeCell(c: number, r: number, state: CellState, owner: RenderCellOwnerLike | BodyCell | null): void {
        super.changeCell(c, r, state, owner as RenderCellOwnerLike | null);
        /* cellAt is null only for out-of-range coordinates, which no caller
           produces: every one either walks the grid's own bounds
           (buildPetriDish, generateFood), derives coordinates from a cell it
           already fetched (the body cells, updateGrid, die), or tests the cell
           first (dropCellType, randomizeWalls, Organism.buildWall). The save
           loader was the one path that could, and it now checks -- see the
           guarded wall loop in loadRaw. */
        this.renderer.addToRender(this.grid_map.cellAt(c, r)!);
        this.glow_dirty = true;
        this.deco_dirty = true;
        if(state == CellStates.wall || state == CellStates.invincible_wall)
            this.walls.push(this.grid_map.cellAt(c, r)!);
    }

    // Enclose the world in a circular dish of invincible wall: life lives
    // inside the circle, everything outside is dead "glass". Survives resets
    // because fillGrid preserves walls unless clear_walls_on_reset is set.
    // Cells are flagged so the renderer can draw the glass as page-background
    // (hiding the rectangular canvas) with a lit rim ring at the dish edge.
    buildPetriDish(): void {
        var cx = (this.grid_map.cols - 1) / 2;
        var cy = (this.grid_map.rows - 1) / 2;
        // Inset radius by 4 cells so the full 3-tier glass rim and shadow fit comfortably
        // inside the canvas grid without being cut off on top, bottom, left or right.
        var radius = Math.min(this.grid_map.cols, this.grid_map.rows) / 2 - 4;
        for (var c = 0; c < this.grid_map.cols; c++) {
            for (var r = 0; r < this.grid_map.rows; r++) {
                /* The loop bounds are the grid's own dimensions, so cellAt()
                   never returns null here. */
                var cell = this.grid_map.cellAt(c, r)!;
                var dx = c - cx;
                var dy = r - cy;
                var dist = Math.hypot(dx, dy);
                if (dist < radius - 0.5) {
                    cell.dish_glass = false;
                    cell.dish_tier = 0;
                    continue;
                }
                cell.dish_glass = true;
                var angle = Math.atan2(dy, dx);
                // Angle light factor: 1.0 at top-left (-135 deg), -1.0 at bottom-right (45 deg)
                var light = -Math.cos(angle - Math.PI * 0.75);

                if (dist < radius + 0.5) {
                    cell.dish_tier = 1; // Inner Lip
                } else if (dist < radius + 1.8) {
                    cell.dish_tier = 2; // Main Rim
                } else if (dist < radius + 2.8) {
                    cell.dish_tier = 3; // Outer Shadow Rim
                } else {
                    cell.dish_tier = 4; // Void
                }
                cell.dish_light = light;

                if (cell.owner != null)
                    cell.owner.die();
                if (cell.state !== CellStates.invincible_wall)
                    this.changeCell(c, r, CellStates.invincible_wall, null);
            }
        }
        this.renderFull();
    }

    clearWalls(): void {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && (wcell.state == CellStates.wall || wcell.state == CellStates.invincible_wall)) {
                wcell.dish_glass = false;
                /* Dead write, kept verbatim: `dish_rim` is not a GridCell field
                   and nothing reads it -- buildPetriDish flags the rim with
                   dish_glass/dish_tier/dish_light. The cast is only what lets an
                   undeclared property be assigned. */
                (wcell as WorldCell & { dish_rim?: boolean }).dish_rim = false;
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
            }
        }
        this.renderFull();
    }

    clearOrganisms(): void {
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }

    clearDeadOrganisms(): void {
        let to_remove: string[] = [];
        for (let i in this.organisms) {
            let org: Organism = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood(): void {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                /* c and r are drawn from the grid's own dimensions, so cellAt()
                   never returns null here -- the JS dereferenced it unguarded
                   for the same reason. */
                if (this.grid_map.cellAt(c, r)!.state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    // Destructive: callers are responsible for confirming with the user first
    reset(reset_life: boolean = true): boolean {
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.setNightMode(false);
        this.deco_dirty = true;
        this.radiation_map.clear();
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        return true;
    }

    resizeGridColRow(cell_size: number | string, cols: number, rows: number): void {
        cell_size = Number(cell_size);
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
        this.syncOverlaySizes();
    }

    resizeFillWindow(cell_size: number): void {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow();
        this.syncOverlaySizes();
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    serialize(): SerializedWorld {
        this.clearDeadOrganisms();
        /* copyNonObjects reflects over arbitrary keys, so it takes and returns
           Record<string, unknown>; the casts on either side are the join between
           that dynamic walk and the declared save shape. */
        let env = SerializeHelper.copyNonObjects(this as unknown as Record<string, unknown>) as SerializedWorld;
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms){
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env: unknown): void { // species name->stats map, evolution controls,
        /* Asserted, not runtime-checked: the JS did no validation either and
           adding a guard here would change behavior on malformed saves. `raw` is
           a type-only view of the value already in hand. */
        let raw = env as SerializedWorld;
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = raw.grid.cell_size ? raw.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, raw.grid.cols, raw.grid.rows)
        this.grid_map.loadRaw(raw.grid);
        for (let wall of raw.grid.walls) {
            /* A save can name a wall outside the grid it declares -- both load
               paths validate only that `grid` and `organisms` are present, so a
               hand-edited or version-mismatched file gets here intact. cellAt
               returns null for those, and an unchecked push put the null in
               this.walls, where it surfaced far away and much later as a
               TypeError in clearWalls (which reads wall.col). Skipping it
               matches what every other wall-writing path already does:
               randomizeWalls and dropCellType both test the cell first. */
            let wall_cell = this.grid_map.cellAt(wall.c, wall.r);
            if (wall_cell != null) {
                this.walls.push(wall_cell);
            }
        }
        // Saved worlds carry dish walls but not the glass flags; re-flag them
        if (WorldConfig.petri_dish)
            this.buildPetriDish();

        // create species map
        let species: Record<string, Species> = {};
        for (let name in raw.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(raw.fossil_record.species[name] as unknown as Record<string, unknown>, s as unknown as Record<string, unknown>)
            species[name] = s; // the species needs an anatomy obj still
        }

        /* The cast is only the SavedOrganism view described above -- it adds the
           two position fields loadRaw reads and serialize() never writes. */
        for (let orgRaw of raw.organisms as SavedOrganism[]) {
            /* Reads `c`/`r`, which is what serialize() actually writes
               (Organism.serialize -> copyNonObjects). This used to read
               `col`/`row`, fields no save has ever contained, so the constructor
               received undefined for both and the position was only repaired a
               line later by the overwriteNonObjects call inside org.loadRaw --
               it worked entirely by accident. Same end state, arrived at
               directly. */
            let org = new Organism(orgRaw.c, orgRaw.r, this as unknown as OrganismEnv);
            org.loadRaw(orgRaw);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, raw.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
            /* Published only once the species is bound. Everything reachable
               from env.organisms dereferences org.species unguarded, so the
               addOrganism call used to sit eleven statements too early. */
            this.addOrganism(org);
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(raw.fossil_record);
        SerializeHelper.overwriteNonObjects(raw, this as unknown as Record<string, unknown>);
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

export default WorldEnvironment;
