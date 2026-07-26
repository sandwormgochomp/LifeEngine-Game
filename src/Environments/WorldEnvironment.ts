import Environment from './Environment';
import Renderer from '../Rendering/Renderer';
import { stepExplosions, stepProjectiles } from './EnvironmentEffects';
import drawOrganismDecorations from '../Rendering/DecorationRenderer';
import { GLOW_DOWNSCALE, glowMargin, glowSpread, compositeGlow } from '../Rendering/Glow';
import GridMap from '../Grid/GridMap';
import Organism from '../Organism/Organism';
import CellStates from '../Organism/Cell/CellStates';
import EnvironmentController from '../Controllers/EnvironmentController';
import Neighbors from '../Grid/Neighbors';
import Directions from '../Organism/Directions';
import Notifier from '../Utils/Notifier';
import Hyperparams from '../Hyperparameters.js';
import FossilRecord from '../Stats/FossilRecord';
import Narrator from '../Stats/Narrator';
import LineageTracker from '../Stats/LineageTracker';
import Perf from '../Stats/Perf';
import WorldConfig from '../WorldConfig';
import SerializeHelper from '../Utils/SerializeHelper';
import type { NotificationCell } from '../Utils/Notifier';
import Species from '../Stats/Species';
import type { CellState, RenderCellOwnerLike } from '../Organism/Cell/CellStates';
import type BodyCell from '../Organism/Cell/BodyCells/BodyCell';
import type { OrganismEnv, OrganismProjectile, SerializedOrganism } from '../Organism/Organism';
import type { PredatorSpecies } from '../Organism/Predators';
import type { SerializedGridMap } from '../Grid/GridMap';
import type { SerializedFossilRecord } from '../Stats/FossilRecord';
import type { HyperparamsData, HyperparamsSingleton } from '../Hyperparameters';
/* Type-only, so it is erased at emit and closes no runtime cycle -- Engine
   imports this module for real. */
import type Engine from '../Engine';

/* GridMap declares its owners as RenderOrganismLike, which models only what
   CellState.render needs; this class calls die() and takeDamage() on what it
   reads back, so the owner is renarrowed to the real Organism here. Narrowing
   is legal because Organism satisfies RenderOrganismLike and the value stored
   really is an Organism -- GridMap.setCellOwner derives it from
   `cell_owner.org`. Same pattern as ControllerCell in EnvironmentController.ts.

   `cell_owner` is deliberately NOT renarrowed to BodyCell, even though that is
   what it always holds: GridMap types it as RenderCellOwnerLike, which demands
   getAbsoluteDirection(), and of the body cells only EyeCell implements that.
   The two views therefore do not unify -- the same gap EnvironmentController.ts
   documents at dropOrganism(), and the reason the OrganismEnv seam below needs
   an assertion. */
interface WorldGridMap extends GridMap {
    ownerAt(col: number, row: number): Organism | null;
    ownerOf(idx: number): Organism | null;
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
    /* Whether the world lives in the petri dish. The dish itself is never in
       `grid` -- its glass is invincible_wall, which GridMap.serialize() skips
       -- so this flag is how a save remembers its shape and loadRaw() rebuilds
       it. Optional because the bundled worlds and older saves predate the
       dish: absent means the world was designed for the full rectangle. */
    petri_dish?: boolean;
    [key: string]: unknown;
}

/* The position fields loadRaw() reads off each saved organism. Neither is ever
   written: Organism.serialize() emits the position as `c`/`r`. Declared as its
   own optional pair, instead of leaning on SerializedOrganism's `unknown` index
   signature, so that their absence is visible in the type. See the comment at
   the constructor call in loadRaw(). */
type SavedOrganism = SerializedOrganism & { col?: number; row?: number };

/* Overlay scheduling. Both overlay passes (decorations, glow) are cosmetic
   full repaints whose cost scales with population, so they run under three
   rules rather than every dirty frame:

   - a floor of OVERLAY_MIN_REPAINT_MS between repaints (~30Hz): organisms
     move at most one cell per tick, so an overlay lagging its cells by a
     frame or two is invisible in motion;
   - a deadline: when the frame's mandatory passes have already spent
     OVERLAY_DEADLINE_MS, the repaint is deferred to a later frame -- this is
     what sheds render load once a big world saturates the main thread,
     instead of dragging the tick rate down with it;
   - a staleness cap of OVERLAY_MAX_AGE_MS that overrides the deadline, so
     under any load the overlays still track the world at 5Hz or better. */
const OVERLAY_MIN_REPAINT_MS = 33;
const OVERLAY_DEADLINE_MS = 5;
const OVERLAY_MAX_AGE_MS = 200;

/* How the world lands on a viewport-sized overlay: world px x maps to overlay
   px ox + x*s. Computed by overlayCamera() from the controller's pan/zoom. */
interface OverlayCamera { ox: number; oy: number; s: number; }

/* A timed world event. `ends_at` is an absolute total_ticks value; `restore`
   undoes any global spike the event applied (e.g. resets Hyperparams.foodProdProb
   after a bloom). `step` is for events that don't just hold the world in one
   altered state but move through it -- the radiation storm's front is the only
   one so far -- and runs once per tick while the event is live. Instantaneous
   events (a meteor is one impact) don't enqueue at all. */
interface WorldEvent {
    kind: string;
    ends_at: number;
    step?: () => void;
    restore: () => void;
}

/* The two food-multiplier events: same mechanism, opposite signs. A bloom is a
   short glut, an ice age a longer famine -- long enough that surviving it is
   about efficiency rather than luck, which is the whole point of the squeeze. */
const BLOOM_MULTIPLIER = 3;
const BLOOM_TICKS = 600;
const ICE_AGE_MULTIPLIER = 0.15;
const ICE_AGE_TICKS = 1200;

/* The Hyperparams fields a timed shift may hold: the scalar ones. The three
   neighbour lists are arrays with no meaningful transform, so the mapped type
   drops them and a card naming one fails to compile rather than silently
   stringifying a grid of coordinates. */
export type ShiftableParamKey = {
    [K in keyof HyperparamsData]: HyperparamsData[K] extends number | boolean ? K : never
}[keyof HyperparamsData];

/* How one field moves when a shift lands. Stored as a transform rather than a
   destination because that is what the cards actually say: "lifespan x3" means
   three times whatever this world runs at, not three times the default, and a
   world already tuned to a 300-tick lifespan should feel the same card
   differently. `set` is the escape hatch for booleans and for the cards that
   name an absolute ("look range -> 4"); it is also the only variant that is a
   no-op when replayed, which is why the permanent cards use nothing else. */
type NumChange = { mul: number } | { add: number } | { set: number };
type BoolChange = { set: boolean };
export type ParamChanges = {
    [K in ShiftableParamKey]?: HyperparamsData[K] extends number ? NumChange : BoolChange
};

/* The values a shift will put back, one per field it touched. */
type ParamBaselines = { [K in ShiftableParamKey]?: HyperparamsData[K] };

/* A live parameter shift: a bloom, an ice age, or a Fate Deck card. `baselines`
   is kept on the event -- rather than only captured in the restore closure --
   so serialize() can save the world's true parameters instead of the spiked
   ones, and so triggerParamShift can tell which live events hold which fields.
   See the notes on both. */
interface ParamShiftEvent extends WorldEvent {
    baselines: ParamBaselines;
}

/* Resolve one transform against the value the world is running at. The
   arithmetic branches are unreachable for a boolean field -- ParamChanges pairs
   each key with the variant its type admits, so `{ instaKill: { mul: 2 } }` is a
   compile error at the call site -- and Number() here only keeps the union out
   of the expression. */
function applyParamChange(current: number | boolean, change: NumChange | BoolChange): number | boolean {
    if ('set' in change) return change.set;
    const n = Number(current);
    return 'mul' in change ? n * change.mul : n + change.add;
}

/* Radiation storm: a band of irradiated columns RAD_STORM_WIDTH deep, sweeping
   across the world at RAD_STORM_SPEED columns per tick. Sub-1 speeds are the
   point -- the front should crawl visibly rather than teleport -- and the width
   is what makes it a front rather than a line: an organism caught in it stays
   caught for width/speed ticks, long enough to breed under x5 mutability. */
const RAD_STORM_WIDTH = 8;
const RAD_STORM_SPEED = 0.5;

/* An in-flight radiation storm. `front` is the leading edge in (fractional)
   columns, `dir` which way it travels; `lit` is the columns the storm currently
   holds and `owned` the exact radiation cells it painted. Owning cells
   individually is what lets a storm sweep over a zone the player painted by
   hand and leave it standing afterwards. */
interface RadStormEvent extends WorldEvent {
    kind: 'radstorm';
    front: number;
    dir: 1 | -1;
    lit: Set<number>;
    owned: Set<string>;
}

/* Which events the auto-scheduler draws from, when Hyperparams.randomEvents is
   on. The invasive predator is deliberately not in here: it introduces a
   lineage the world could not have reached on its own and registers a species,
   which is a decision to make rather than weather to endure. */
type ScheduledEvent = 'meteor' | 'bloom' | 'iceage' | 'radstorm';
const SCHEDULED_EVENTS: ScheduledEvent[] = ['meteor', 'bloom', 'iceage', 'radstorm'];
// Blast radius range for an auto-scheduled meteor, in cells.
const AUTO_METEOR_MIN_RADIUS = 5;
const AUTO_METEOR_MAX_RADIUS = 14;
// Floor on the scheduler's interval, so a slider at zero can't fire every tick.
const MIN_RANDOM_EVENT_INTERVAL = 60;

/* Smallest radius a predator pack scatters over, in cells. The brush sets the
   spread, but a brush of 0-4 cannot hold six organisms several cells wide, and
   silently dropping half the pack reads as a bug. */
const PREDATOR_MIN_SPREAD = 6;

/* Meteor timeline, in wall-clock ms. The whole animation is driven from the
   render loop rather than sim ticks so it plays at the same speed whatever
   the sim speed -- including paused, where the rAF loop keeps running. The
   strike's sim effects (kills, food scatter) land at impact time, not click
   time, so what the player sees is what actually happens. */
const METEOR_FALL_MS = 500;
const METEOR_FLASH_MS = 200;
const METEOR_SHOCK_MS = 650;
/* Crater afterglow; also the fx tail stepMeteors() prunes on, so it must be
   the longest post-impact phase (>= shockwave and every ember lifetime). */
const METEOR_GLOW_MS = 1400;
const METEOR_EMBER_MIN_MS = 450;
const METEOR_EMBER_MAX_MS = 1000;
// White-hot core through cooling rust; embers and the streak's trail sample it.
const METEOR_COLORS = ['#fff7ae', '#ffd166', '#ff8c42', '#ff4d2e', '#b3202a'];

/* One spark thrown from the crater: a chunky pixel square that shoots out
   fast, drifts to a stop at `reach`, and cools out over `life`. */
interface MeteorEmber {
    angle: number;
    reach: number;  // world px travelled over its full life
    size: number;   // px at birth; shrinks as it cools
    life: number;   // ms
    color: string;
}

/* An in-flight strike. Cosmetic state plus the one piece of pending sim
   mutation: `resolved` flips when stepMeteors() lands the blast. */
interface MeteorFx {
    col: number;
    row: number;
    radius: number;
    start: number;   // performance.now() at launch
    from_x: number;  // world px the streak falls in from
    from_y: number;
    resolved: boolean;
    embers: MeteorEmber[];
}

/* Decoration culling margin, in cells, around the visible rect. Sprites are
   culled by their anchor cell before the sprite cache is even touched, so the
   margin has to cover how far an organism's artwork can reach from its
   anchor; nothing bred or built in practice approaches a 32-cell radius. */
const DECO_CULL_PAD_CELLS = 32;

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
    /* The cursor/brush layer. Owned here like the other two overlays -- the
       env sizes them and knows the camera -- but painted by the controller,
       which is the only thing that knows what the armed tool looks like.
       See cursorLayer() for why it needs none of the scheduling the others do. */
    cursor_canvas: HTMLCanvasElement | null;
    cursor_ctx: CanvasRenderingContext2D | null;
    controller: EnvironmentController;
    num_rows: number;
    num_cols: number;
    grid_map: WorldGridMap;
    organisms: Organism[];
    /* Grid indices, not cell objects: the grid hands out fresh views rather
       than keeping one object per cell (see GridMap), so a long-lived list of
       cells has to be a list of indices. */
    walls: number[];
    total_mutability: number;
    largest_cell_count: number;
    // Body plan of the current largest-cell-count holder, captured when the
    // record is beaten so the Narrator can preview it. Runtime-only (not
    // serialized); repopulated the next time the record is broken.
    largest_cells: NotificationCell[];
    reset_count: number;
    total_ticks: number;
    data_update_rate: number;
    active_explosions: { col: number; row: number; ticks: number }[];
    active_projectiles: OrganismProjectile[];
    /* In-flight meteor strikes: launched by meteorStrike(), landed and drawn
       by the render loop (stepMeteors / renderMeteorFx). Runtime-only --
       serialize() skips arrays -- so a save taken during the half-second fall
       loses that strike; acceptable for a click-scale window. */
    active_meteors: MeteorFx[];
    /* Cells the meteor pass painted over last frame, repainted first thing
       next pass so the animation never smears -- the same immediate-mode
       contract the cursor overlay keeps, via its own set so the two passes
       never fight over ownership. */
    fx_cells: Set<number>;
    radiation_map: Set<string>;
    /* Bumped on every mutation of radiation_map. The RadiationSmoke overlay
       caches parsed cell positions and needs to know when to rebuild them; the
       map's size is not enough of a signal, because the storm's front adds one
       column and drops another in the same step and so can move across the
       world without the size ever changing. */
    radiation_version: number;
    /* In-flight world events (Events tool tab). Each carries the tick it ends
       on and a restore() that undoes whatever global state it spiked, so the
       tick loop can expire it and reset() can wind them all back at once. The
       first minimal event framework -- see concepts/proposals/07-world-events. */
    active_events: WorldEvent[];
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
    /* When each overlay pass last repainted, and when the current frame's
       render began. In a busy world something changes every tick, so the
       dirty flags alone mean "repaint every frame"; overlayMayRepaint()
       turns these three timestamps into the floor/deadline/staleness rules
       described on the OVERLAY_* constants. The dirty flags stay set across
       a deferral, so nothing is lost, just delayed a frame or two. */
    last_deco_repaint: number;
    last_glow_repaint: number;
    frame_render_start: number;
    /* The camera each overlay was last painted at, and the cached
       untransformed canvas offset overlayCamera() derives the current camera
       from. Between a pan/zoom and the next scheduled repaint, the stored
       cameras drive a CSS transform that keeps the old paint aligned
       (syncOverlayCssTransforms). Null until the first repaint / first
       camera read. */
    glow_cam: OverlayCamera | null;
    deco_cam: OverlayCamera | null;
    overlay_base: { left: number; top: number; cw: number; ch: number; vw: number; vh: number } | null;
    /* The hovered organism, written by CanvasController and read by the
       decoration pass, which tints that organism's sprite. Never initialized,
       for the same reason as the fields above: no pointer has moved yet. A
       stale reference to an organism that has since died is harmless -- the
       decoration pass skips non-living organisms before it reaches the tint. */
    highlighted_org: Organism | null | undefined;
    /* Assigned from outside by Engine right after it constructs this, so absent
       for the window in between -- setNightMode() guards on it. */
    engine?: Engine;
    /* Follow-a-lineage state: which organism (and descendants) the player is
       watching. An object, so serialize()'s copyNonObjects skips it -- tracking
       is by live reference and cannot round-trip a save; reset() and loadRaw()
       clear it instead. Fed by the onOrganismBorn/onOrganismDied hooks below. */
    lineage: LineageTracker;
    /* Spatial index over living organisms for pheromone broadcasts, rebuilt
       lazily at most once per tick and only on ticks where something is
       damaged. Wrapped in one object on purpose: serialize() copies own
       non-object properties, so a bare `tick` stamp would round-trip through
       saves and could collide with a restored total_ticks, presenting an
       empty index as fresh. An object is skipped wholesale. */
    pheromone_index: { tick: number; bucket: number; map: Map<number, Organism[]> };

    constructor(cell_size: number, canvas: HTMLCanvasElement | null, container: HTMLElement | null, glow_canvas: HTMLCanvasElement | null = null, deco_canvas: HTMLCanvasElement | null = null, cursor_canvas: HTMLCanvasElement | null = null) {
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
        // The cursor overlay is the player's own pointer, not part of the
        // world: it gets its own layer so the brush footprint never paints
        // into the cells the life forms are drawn on.
        this.cursor_canvas = cursor_canvas;
        this.cursor_ctx = cursor_canvas ? cursor_canvas.getContext('2d') : null;
        this.last_deco_repaint = 0;
        this.last_glow_repaint = 0;
        this.frame_render_start = 0;
        this.glow_cam = null;
        this.deco_cam = null;
        this.overlay_base = null;
        this.syncOverlaySizes();
        /* The controller declares its own structural view of this environment,
           and the two cannot unify today: that view's renderer types
           highlightOrganism() with the shared RenderOrganismLike, while the real
           Renderer types it with its own shape that additionally requires
           getRealCellIndex(). Neither is assignable to the other, so the mismatch is
           in already-converted files, not here. Spelled as the field's declared
           type rather than re-declaring its unexported interface. */
        this.controller = new EnvironmentController(this as unknown as EnvironmentController['env'], this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        /* The narrowing described on WorldGridMap: the map built here is an
           ordinary GridMap, only viewed through the narrower cell type. */
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size) as WorldGridMap;
        /* The renderer tracks cells by index, so it needs the map those
           indices are into. resize() mutates this same object, so this single
           assignment holds for the life of the environment. */
        this.renderer.grid_map = this.grid_map;
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.largest_cells = [];
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.active_meteors = [];
        this.fx_cells = new Set();
        this.radiation_map = new Set();
        this.radiation_version = 0;
        this.active_events = [];
        this.day_timer = 0;
        this.is_night = false;
        this.pheromone_index = { tick: -1, bucket: 0, map: new Map() };
        this.lineage = new LineageTracker();
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
        // Explosions and projectiles step through the same logic the preview
        // environment reuses; see EnvironmentEffects.
        stepExplosions(this);
        stepProjectiles(this);
        Perf.end('fx', t);

        // Day/Night Cycle
        this.day_timer++;
        if (this.day_timer > 3600) { // 1 minute at 60 ticks per second
            this.day_timer = 0;
            this.setNightMode(!this.is_night);
        }

        this.tickWorldEvents();
        this.maybeScheduleRandomEvent();

        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            t = Perf.begin();
            FossilRecord.updateData();
            // Narrate the drama this window produced (new species, extinctions,
            // size records, crashes). Piggybacks the fossil sample's cadence, and
            // only the real world reaches this method -- the Lab's preview mini-sim
            // has its own update(), so its births/deaths never announce.
            Narrator.sample(this);
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
        const now = performance.now();
        // Before the headless early-out: landing a meteor is sim mutation,
        // not painting, and must happen even when nothing is drawn.
        this.stepMeteors(now);
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.frame_render_start = performance.now();
        var t = Perf.begin();
        this.renderer.renderCells();
        Perf.end('cells_draw', t);
        this.renderer.renderHighlights();
        this.controller.renderCursorOverlay();
        this.renderMeteorFx(now);
        /* Both overlay passes early-out on their dirty flags and the
           overlayMayRepaint() schedule, so their avg stays near zero; the max
           column is what shows the repaint spike. */
        t = Perf.begin();
        this.renderDecorations();
        Perf.end('deco', t);
        t = Perf.begin();
        this.renderGlow();
        Perf.end('glow', t);
    }

    /* The floor/deadline/staleness schedule described on the OVERLAY_*
       constants. Called by an overlay pass after its dirty check; a false
       leaves the dirty flag set, so the repaint happens on a later frame. */
    overlayMayRepaint(last_repaint: number): boolean {
        const age = Date.now() - last_repaint;
        if (age < OVERLAY_MIN_REPAINT_MS) return false;
        if (age > OVERLAY_MAX_AGE_MS) return true;
        return performance.now() - this.frame_render_start < OVERLAY_DEADLINE_MS;
    }

    /* The overlays are viewport-sized, not world-sized: both repaint fully
       whenever they repaint at all, so a world-sized layer meant clearing,
       redrawing and re-uploading tens of megapixels ~30x a second on the big
       bundled worlds -- measured as what held Epic at 14fps headed. Sized to
       the container instead; the painters draw world coordinates through
       overlayCamera()'s transform. */
    syncOverlaySizes(): void {
        const cont = this.container;
        const vw = (cont && cont.clientWidth) || window.innerWidth;
        const vh = (cont && cont.clientHeight) || window.innerHeight;
        if (this.deco_canvas) {
            this.deco_canvas.width = vw;
            this.deco_canvas.height = vh;
            this.deco_canvas.style.transformOrigin = '0 0';
            this.deco_dirty = true;
        }
        if (this.cursor_canvas) {
            // No transformOrigin, and nothing to mark dirty: the cursor layer
            // is repainted from scratch on the next frame either way, and
            // never carries a CSS bridge transform to re-anchor.
            this.cursor_canvas.width = vw;
            this.cursor_canvas.height = vh;
        }
        if (!this.glow_canvas) return;
        this.glow_canvas.width = vw;
        this.glow_canvas.height = vh;
        this.glow_canvas.style.transformOrigin = '0 0';
        // The scratch is rendered small: upscaling it with image smoothing
        // produces the soft halo for free, where a per-frame blur() filter at
        // full resolution dragged the whole app down.
        this.glow_scratch.width = Math.max(1, Math.ceil(vw / GLOW_DOWNSCALE));
        this.glow_scratch.height = Math.max(1, Math.ceil(vh / GLOW_DOWNSCALE));
        this.glow_dirty = true;
    }

    // True when the container has changed size since the overlays were sized
    // (nothing else watches window resizes); checked before each repaint.
    overlaySizesStale(): boolean {
        const cont = this.container;
        const c = this.deco_canvas || this.glow_canvas || this.cursor_canvas;
        if (!cont || !c) return false;
        const vw = cont.clientWidth || window.innerWidth;
        const vh = cont.clientHeight || window.innerHeight;
        return c.width !== vw || c.height !== vh;
    }

    /* Where the world sits in the container: world px x -> container px
       ox + x*s. pan and scale come from the controller; the canvas's
       untransformed layout offset comes from one getBoundingClientRect pair,
       inverted analytically (the canvas center is invariant under the
       scale-about-center and moves 1:1 with the translate) and cached so the
       per-mousemove path never forces layout. */
    overlayCamera(): OverlayCamera | null {
        const canvas = this.renderer.canvas;
        const cont = this.container;
        const ctl = this.controller as EnvironmentController | undefined;
        if (!canvas || !cont || !ctl || canvas.width === 0) return null;
        const vw = cont.clientWidth, vh = cont.clientHeight;
        let base = this.overlay_base;
        if (!base || base.cw !== canvas.width || base.ch !== canvas.height || base.vw !== vw || base.vh !== vh) {
            const cr = canvas.getBoundingClientRect();
            if (cr.width === 0) return null;
            const vr = cont.getBoundingClientRect();
            base = this.overlay_base = {
                left: cr.left - vr.left + cr.width / 2 - ctl.pan_x - canvas.width / 2,
                top: cr.top - vr.top + cr.height / 2 - ctl.pan_y - canvas.height / 2,
                cw: canvas.width, ch: canvas.height, vw, vh,
            };
        }
        const s = ctl.scale;
        return {
            ox: base.left + canvas.width / 2 + ctl.pan_x - (canvas.width / 2) * s,
            oy: base.top + canvas.height / 2 + ctl.pan_y - (canvas.height / 2) * s,
            s,
        };
    }

    /* Called by the controller on every pan/zoom change. The overlays' content
       is baked in camera space, so a camera move schedules a repaint and, until
       it lands, bridges the gap by transforming the last paint into place. */
    onCameraMoved(): void {
        this.glow_dirty = true;
        this.deco_dirty = true;
        this.syncOverlayCssTransforms();
    }

    syncOverlayCssTransforms(): void {
        const cur = this.overlayCamera();
        if (!cur) return;
        if (this.glow_canvas && this.glow_cam) this.applyOverlayCss(this.glow_canvas, this.glow_cam, cur);
        if (this.deco_canvas && this.deco_cam) this.applyOverlayCss(this.deco_canvas, this.deco_cam, cur);
    }

    /* Map a layer painted at camera R onto the current camera C: painted px p
       holds world (p - R.o)/R.s, which must land at C.o + world*C.s -- an
       affine with scale k = C.s/R.s about the (0,0) transform origin. Passing
       R === C yields the identity, which is how a fresh repaint clears its
       bridge transform. */
    applyOverlayCss(el: HTMLCanvasElement, rendered: OverlayCamera, cur: OverlayCamera): void {
        const k = cur.s / rendered.s;
        el.style.transform = `translate(${cur.ox - rendered.ox * k}px, ${cur.oy - rendered.oy * k}px) scale(${k})`;
    }

    /* Hands the controller its layer, cleared and already in world
       coordinates, or null when there is nothing to draw on.

       Unlike the glow and decoration passes this one is immediate mode: the
       controller repaints it from scratch every frame, so it carries no dirty
       flag, no repaint schedule and no CSS bridge -- it is only ever painted
       at the live camera, which is exactly what a pointer overlay needs. The
       clear is the whole un-draw; when the brush shared the world canvas it
       had to remember every cell it had painted over and re-render each one
       the following frame just to avoid smearing a trail. */
    cursorLayer(): CanvasRenderingContext2D | null {
        const canvas = this.cursor_canvas;
        const ctx = this.cursor_ctx;
        if (!canvas || !ctx || WorldConfig.headless) return null;
        if (this.overlaySizesStale()) this.syncOverlaySizes();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cam = this.overlayCamera();
        if (!cam) return null;
        ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy);
        // Same reason as the decoration pass: the layer inherits the
        // container's pixelated image-rendering, and the camera scale must
        // not start smoothing what CSS scaling did not.
        ctx.imageSmoothingEnabled = false;
        return ctx;
    }

    renderDecorations(): void {
        if (!this.deco_ctx || !this.deco_canvas || WorldConfig.headless) return;
        // Only repaint when the world or the camera changed; in between,
        // syncOverlayCssTransforms keeps the last paint aligned.
        if (!this.deco_dirty) return;
        if (!this.overlayMayRepaint(this.last_deco_repaint)) return;
        const cam = this.overlayCamera();
        if (!cam) return;
        if (this.overlaySizesStale()) this.syncOverlaySizes();
        this.last_deco_repaint = Date.now();
        this.deco_dirty = false;

        const ctx = this.deco_ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.deco_canvas.width, this.deco_canvas.height);
        ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy);
        // The overlays inherit the container's pixelated image-rendering; the
        // camera scale must not smooth the sprites where CSS scaling didn't.
        ctx.imageSmoothingEnabled = false;
        const pad = DECO_CULL_PAD_CELLS * this.renderer.cell_size;
        drawOrganismDecorations(ctx, this, false, false, {
            x0: (0 - cam.ox) / cam.s - pad,
            y0: (0 - cam.oy) / cam.s - pad,
            x1: (this.deco_canvas.width - cam.ox) / cam.s + pad,
            y1: (this.deco_canvas.height - cam.oy) / cam.s + pad,
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.deco_cam = cam;
        this.applyOverlayCss(this.deco_canvas, cam, cam);
    }

    renderGlow(): void {
        if (!this.glow_ctx || !this.glow_canvas || WorldConfig.headless) return;
        // Only re-composite when the world (changeCell/addOrganism) or the
        // camera changed; syncOverlayCssTransforms bridges the gap between.
        if (!this.glow_dirty) return;
        if (!this.overlayMayRepaint(this.last_glow_repaint)) return;
        const cam = this.overlayCamera();
        if (!cam) return;
        if (this.overlaySizesStale()) this.syncOverlaySizes();
        this.last_glow_repaint = Date.now();
        this.glow_dirty = false;

        var w = this.glow_canvas.width;
        var h = this.glow_canvas.height;
        var cs = this.renderer.cell_size;
        var spread = glowSpread(cs);
        var margin = glowMargin(cs);
        // Visible world rect, padded by the halo spread; cells outside it
        // can't reach the viewport, so they cost neither fill nor upscale
        var x0 = (0 - cam.ox) / cam.s - spread;
        var y0 = (0 - cam.oy) / cam.s - spread;
        var x1 = (w - cam.ox) / cam.s + spread;
        var y1 = (h - cam.oy) / cam.s + spread;

        var sctx = this.glow_scratch_ctx;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, this.glow_scratch.width, this.glow_scratch.height);
        // Camera baked into the scratch transform: the painter below works in
        // world coordinates, exactly like the old world-sized pass did.
        var k = cam.s / GLOW_DOWNSCALE;
        sctx.setTransform(k, 0, 0, k, cam.ox / GLOW_DOWNSCALE, cam.oy / GLOW_DOWNSCALE);
        for (var org of this.organisms) {
            for (var body_cell of org.anatomy.cells) {
                var idx = org.getRealCellIndex(body_cell);
                if (idx < 0) continue;
                var cx = this.grid_map.xOf(idx);
                var cy = this.grid_map.yOf(idx);
                if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
                sctx.fillStyle = body_cell.custom_color || body_cell.state.color;
                sctx.fillRect(cx - margin, cy - margin, spread, spread);
            }
        }
        sctx.setTransform(1, 0, 0, 1, 0, 0);

        var gctx = this.glow_ctx;
        gctx.clearRect(0, 0, w, h);
        compositeGlow(gctx, this.glow_scratch, w, h);
        this.glow_cam = cam;
        this.applyOverlayCss(this.glow_canvas, cam, cam);
    }

    renderFull(): void {
        this.renderer.renderFullGrid();
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
           RenderCellOwnerLike in GridMap and BodyCell in OrganismGrid, and
           neither satisfies the other: BodyCell lacks getAbsoluteDirection,
           which lives on EyeCell alone. That is a grid-side variance
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
        if (organism.anatomy.cells.length > this.largest_cell_count) {
            this.largest_cell_count = organism.anatomy.cells.length;
            // Snapshot the record holder's body plan (plain cells, not live
            // references) so the Narrator's toast can preview it.
            this.largest_cells = organism.anatomy.cells.map(c => ({
                loc_col: c.loc_col,
                loc_row: c.loc_row,
                direction: (c as { direction?: number }).direction,
                state: { name: c.state.name },
            }));
        }
    }

    canAddOrganism(): boolean {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    /* The OrganismEnv lineage hooks. Only this environment defines them, which
       is what keeps the editor's and the Lab preview's reproduce()/die() calls
       out of the tracker (see the comment on OrganismEnv). */
    onOrganismBorn(parent: Organism, child: Organism): void {
        this.lineage.onBirth(parent, child, this.total_ticks);
    }

    onOrganismDied(org: Organism): void {
        this.lineage.onDeath(org, this.total_ticks);
    }

    /* Start (or switch) the followed lineage. The deco flag repaints the
       highlight now rather than on the next world mutation, and the forced
       emit shows the card immediately even while paused. */
    followOrganism(org: Organism): void {
        this.lineage.follow(org, this.total_ticks);
        this.deco_dirty = true;
        this.engine?.emitChange(true);
    }

    stopFollowing(): void {
        this.lineage.unfollow();
        this.deco_dirty = true;
        this.engine?.emitChange(true);
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
        /* indexAt is -1 only for out-of-range coordinates, which no caller
           produces: every one either walks the grid's own bounds
           (buildPetriDish, generateFood), derives coordinates from a cell it
           already fetched (the body cells, updateGrid, die), or tests the cell
           first (dropCellType, randomizeWalls, Organism.buildWall). The save
           loader was the one path that could, and it now checks -- see the
           guarded wall loop in loadRaw. Bailing rather than asserting keeps a
           bad index out of the dirty set and the wall list, where it would
           surface far from whatever produced it; super.changeCell above has
           already no-opped for the same reason. */
        var idx = this.grid_map.indexAt(c, r);
        if (idx < 0)
            return;
        this.renderer.addToRender(idx);
        this.glow_dirty = true;
        this.deco_dirty = true;
        if(state == CellStates.wall || state == CellStates.invincible_wall)
            this.walls.push(idx);
    }

    // Enclose the world in a circular dish of invincible wall: life lives
    // inside the circle, everything outside is dead "glass". Survives resets
    // because fillGrid preserves walls unless clear_walls_on_reset is set.
    // Cells are flagged so the renderer can draw the glass as page-background
    // (hiding the rectangular canvas) with a lit rim ring at the dish edge.
    buildPetriDish(): void {
        var cx = (this.grid_map.cols - 1) / 2;
        var cy = (this.grid_map.rows - 1) / 2;
        // Inset radius by 6 cells so the full 3D glass rim fits comfortably.
        var radius = Math.min(this.grid_map.cols, this.grid_map.rows) / 2 - 6;

        for (var c = 0; c < this.grid_map.cols; c++) {
            for (var r = 0; r < this.grid_map.rows; r++) {
                var dx = c - cx;
                var dy = r - cy;
                var dist = Math.hypot(dx, dy);

                var angle = Math.atan2(dy, dx);
                // Angle light factor: 1.0 at top-right (-45 deg), -1.0 at bottom-left (135 deg)
                var light = -Math.cos(angle - Math.PI * 0.75);

                if (dist < radius - 0.5) {
                    // Floor region (Tier 0).
                    // Cast a soft inner shadow on the top-right side (light > 0.1)
                    // Cast an opposing wall glow/caustic on the bottom-left side (light < -0.1)
                    if (dist > radius - 3.5) {
                        if (light > 0.1) {
                            // Negative light signals shadow rendering in Empty.render
                            var intensity = -0.5 * (1.0 - (radius - 0.5 - dist) / 3.0) * light;
                            this.grid_map.setDish(c, r, 0, intensity);
                            continue;
                        } else if (light < -0.1) {
                            // Positive light (> 0) on the bottom-left signals glow/caustics
                            var intensity = 0.3 * (1.0 - (radius - 0.5 - dist) / 3.0) * Math.abs(light);
                            this.grid_map.setDish(c, r, 0, intensity);
                            continue;
                        }
                    }
                    this.grid_map.setDish(c, r, 0, 0);
                    continue;
                }

                var tier;
                if (dist < radius + 1.2) {
                    tier = 1; // Inner Lip
                } else if (dist < radius + 3.2) {
                    tier = 2; // Main Rim Bezel
                } else if (dist < radius + 4.8) {
                    tier = 3; // Outer Bezel Frame
                } else {
                    tier = 4; // Void
                }
                
                this.grid_map.setDish(c, r, tier, light);

                var owner = this.grid_map.ownerAt(c, r);
                if (owner != null)
                    owner.die();
                if (this.grid_map.stateAt(c, r) !== CellStates.invincible_wall)
                    this.changeCell(c, r, CellStates.invincible_wall, null);
            }
        }
        this.renderFull();
    }

    // Clears user-placed walls (regular and invincible alike) but never the
    // petri dish: the glass is the world's bounds, not a wall in it, and is
    // recognized by the dish_glass flag buildPetriDish sets.
    clearWalls(): void {
        let kept: number[] = [];
        for(var wall of this.walls){
            if (this.grid_map.dishTierOf(wall) !== 0) {
                kept.push(wall);
                continue;
            }
            let state = this.grid_map.stateOf(wall);
            if (state == CellStates.wall || state == CellStates.invincible_wall) {
                this.changeCell(this.grid_map.colOf(wall), this.grid_map.rowOf(wall), CellStates.empty, null);
            }
        }
        /* Rebuilding the list also prunes the stale entries that used to
           accumulate: changeCell(empty) never removed cells from walls, it
           only relied on the state re-check above to skip them next time. */
        this.walls = kept;
        this.renderFull();
    }

    /* Wipes every radiation zone, hand-painted or storm-laid. Any storm still
       in flight is ended too: leaving it running would have it re-irradiate the
       band it is standing on the very next tick, so the button would look
       broken for as long as the front lasts. */
    clearRadiation(): void {
        this.endWorldEvent('radstorm');
        this.radiation_map.clear();
        this.markRadiationChanged();
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

                if (this.grid_map.stateAt(c, r) == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    /* Advance every live world event, then expire the ones whose window has
       elapsed, running their restore(). Iterated back-to-front so splicing
       doesn't skip the next entry. Expiry is checked after the step so an
       event's last step lands before it is wound back. */
    tickWorldEvents(): void {
        for (let i = this.active_events.length - 1; i >= 0; i--) {
            const ev = this.active_events[i];
            if (ev.step) ev.step();
            if (this.total_ticks >= ev.ends_at) {
                ev.restore();
                this.active_events.splice(i, 1);
            }
        }
    }

    /* End an in-flight event of this kind early, winding back whatever it
       spiked. A no-op when none is running.

       The emit is forced and lives here rather than in the callers because
       cancelling is now reachable from the status bar, which has no line to the
       evolution window's React mirror of Hyperparams. A paused world has no
       tick loop to carry the change to the HUD either, so without this a
       called-off era leaves its chip counting down and the Console displaying
       numbers the engine has already put back.

       Deliberately silent otherwise: this also runs when an overlapping shift
       displaces an earlier one and when clearRadiation() calls off a storm,
       where a "called off" toast would be noise. Whoever cancels on the
       player's behalf announces it -- they are the ones who know the label. */
    endWorldEvent(kind: string): void {
        const i = this.active_events.findIndex(e => e.kind === kind);
        if (i < 0) return;
        this.active_events[i].restore();
        this.active_events.splice(i, 1);
        if (this.engine) this.engine.emitChange(true);
    }

    /* The live parameter shifts holding any of these fields. Recognised by
       carrying `baselines` rather than by a list of kinds, so the rad storm --
       and anything else that moves the world without spiking a global -- is
       skipped without having to be named here. */
    paramShiftsTouching(keys: ShiftableParamKey[]): ParamShiftEvent[] {
        return this.active_events.filter((e): e is ParamShiftEvent =>
            'baselines' in e && keys.some(k => k in (e as ParamShiftEvent).baselines));
    }

    /* Hold a set of Hyperparams fields at shifted values for `ticks`, then put
       them back exactly. The mechanism behind Bloom and Ice Age (Events tab) and
       behind every timed Fate Deck card; `kind` is the event's identity, so a
       card's id is the kind its shift runs under.

       Three properties this method exists to guarantee:

       - **Idempotent on re-trigger.** Replaying a live shift only pushes
         `ends_at` out from the current tick. Re-applying the transforms would
         stack them -- x3 on an already-tripled value -- and, far worse, would
         recapture the *spiked* numbers as the baselines, so the eventual
         restore would strand the world at 3x its real food rate for good.
       - **No two live shifts hold the same field.** Anything already holding
         one of these fields is wound back before the baselines are captured.
         This is the rule the bloom/ice-age pair used to state about each other,
         generalised to the fields rather than the pair, and it is what makes a
         Long Winter and a Fertile Crescent mutually exclusive while leaving a
         Hair Trigger free to run alongside either. It also keeps the baselines
         unambiguous for serialize(), which merges them all.
       - **Nothing outlives its world.** restore() runs on expiry, on an
         overlapping shift, on endWorldEvent(), on reset() and on loadRaw().

       `ticks <= 0` applies the changes and enqueues nothing: a permanent card
       is a rule the player has changed, not weather to sit out, and it is
       indistinguishable from having moved the same sliders by hand in the
       Console's fold. Such a card must express itself entirely in `set` transforms,
       or replaying it will compound.

       Mutating the Hyperparams singleton is the same swap-a-global pattern
       noted in TODO.md; kept because every consumer reads these fields straight
       off it, and every path out of a shift winds them back. */
    triggerParamShift(kind: string, changes: ParamChanges, ticks: number, message: string): void {
        const keys = Object.keys(changes) as ShiftableParamKey[];
        const existing = this.active_events.find(e => e.kind === kind);
        if (existing) {
            existing.ends_at = this.total_ticks + ticks;
        } else {
            for (const clash of this.paramShiftsTouching(keys)) this.endWorldEvent(clash.kind);
            const baselines: ParamBaselines = {};
            for (const key of keys) {
                /* Both writes are through a union-typed key, which no index
                   signature can narrow per-iteration -- the same boundary, and
                   the same `as never`, as Hyperparams.loadJsonObj. The values
                   really do belong to the field the key names: the baseline was
                   just read off it, and applyParamChange returns the variant
                   ParamChanges paired with it. */
                baselines[key] = Hyperparams[key] as never;
                Hyperparams[key] = applyParamChange(Hyperparams[key], changes[key]!) as never;
            }
            if (ticks > 0) {
                const ev: ParamShiftEvent = {
                    kind,
                    baselines,
                    ends_at: this.total_ticks + ticks,
                    /* Iterated over the baselines rather than over `keys`,
                       because releaseParamClaim() can take a field off this
                       event mid-era; walking the original key list would write
                       the deleted baseline's `undefined` straight into
                       Hyperparams. */
                    restore: () => {
                        for (const key of Object.keys(ev.baselines) as ShiftableParamKey[]) {
                            Hyperparams[key] = ev.baselines[key] as never;
                        }
                    },
                };
                this.active_events.push(ev);
            }
        }
        /* One attachment covers bloom, ice age and every timed Fate card, since
           they all announce themselves through here. A shift has no location,
           so this resolves to the window that lists what is running -- which is
           also where it can be called off or played again. */
        Notifier.notify(message, { focus: { kind: 'event', id: kind } });
        if (this.engine) this.engine.emitChange(true);
    }

    /* Hand one field back to the player mid-era, so the era will not wind it
       back when it ends. Returns whether anything was actually holding it.

       This is the seam between the Fate Deck and the other two tabs of the
       evolution window. A card holds its fields at shifted values and restores
       the pre-card numbers on expiry -- which, without this, silently undoes any
       edit the player made to those fields in the meantime: set lifespan by hand
       during a Long Winter and the era's expiry throws the change away minutes
       later, with nothing on screen having suggested it would. Taking the field
       off the event is the honest reading of that edit: the player has taken
       this parameter over, so the era no longer owns it. An era left holding
       nothing is over -- there is nothing remaining for it to wind back. */
    releaseParamClaim(key: ShiftableParamKey): boolean {
        const holders = this.paramShiftsTouching([key]);
        for (const ev of holders) {
            delete ev.baselines[key];
            if (Object.keys(ev.baselines).length === 0) this.endWorldEvent(ev.kind);
        }
        return holders.length > 0;
    }

    // Bloom and Ice Age (Events tab): the single-field case of the above.
    triggerFoodShift(kind: 'bloom' | 'iceage', multiplier: number, ticks: number, message: string): void {
        this.triggerParamShift(kind, { foodProdProb: { mul: multiplier } }, ticks, message);
    }

    triggerBloom(): void {
        this.triggerFoodShift('bloom', BLOOM_MULTIPLIER, BLOOM_TICKS, '✿ Bloom — food is flourishing');
    }

    triggerIceAge(): void {
        this.triggerFoodShift('iceage', ICE_AGE_MULTIPLIER, ICE_AGE_TICKS, '❄ Ice age — the world goes hungry');
    }

    /* Radiation storm (Events tab): a mutagenic front that sweeps the world
       from one side to the other, irradiating the band it currently covers and
       letting it fade behind. Unlike the bloom's single spike this event has to
       move, which is what step() on WorldEvent exists for.

       Only one storm runs at a time. Two overlapping fronts would each think
       they owned the cells in the overlap -- the first to leave would strip
       radiation the second is still standing on -- and the fix (shared
       ownership counts) buys nothing a player would ever notice. */
    triggerRadStorm(): void {
        if (this.active_events.some(e => e.kind === 'radstorm')) {
            Notifier.notify('☢ A storm front is already sweeping through');
            return;
        }
        // Which edge it blows in from is a coin flip; everything downstream is
        // symmetric in `dir`.
        const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        const span = this.num_cols + RAD_STORM_WIDTH * 2;
        const ev: RadStormEvent = {
            kind: 'radstorm',
            // Starts fully off the near edge, so the front arrives rather than
            // appearing mid-world, and ends once the tail has cleared the far one.
            front: dir === 1 ? -RAD_STORM_WIDTH : this.num_cols + RAD_STORM_WIDTH,
            dir,
            lit: new Set(),
            owned: new Set(),
            ends_at: this.total_ticks + Math.ceil(span / RAD_STORM_SPEED) + 1,
            step: () => this.stepRadStorm(ev),
            restore: () => {
                for (const col of ev.lit) this.darkenStormColumn(ev, col);
                ev.lit.clear();
                this.markRadiationChanged();
            },
        };
        this.active_events.push(ev);
        // By `kind`, not by coordinate: the front moves every tick, so the toast
        // has to ask where it has got to rather than remember where it started.
        Notifier.notify('☢ Radiation storm — a mutagenic front is rolling in', {
            focus: { kind: 'event', id: 'radstorm' },
        });
        if (this.engine) this.engine.emitChange(true);
    }

    /* One tick of the front: move it, irradiate the columns it now covers, and
       drop the ones it has left behind. Only the columns that changed hands are
       walked, so the cost is a couple of columns' worth of cells per tick
       however wide the band is. */
    stepRadStorm(ev: RadStormEvent): void {
        ev.front += ev.dir * RAD_STORM_SPEED;
        const lead = Math.round(ev.front);
        const tail = lead - ev.dir * RAD_STORM_WIDTH;
        const lo = Math.min(lead, tail);
        const hi = Math.max(lead, tail);
        let changed = false;

        for (let col = Math.max(0, lo); col <= Math.min(this.num_cols - 1, hi); col++) {
            if (ev.lit.has(col)) continue;
            ev.lit.add(col);
            for (let row = 0; row < this.num_rows; row++) {
                const key = col + ',' + row;
                // A cell the player irradiated by hand is left alone -- not
                // claimed, so not stripped when the front moves on.
                if (this.radiation_map.has(key)) continue;
                this.radiation_map.add(key);
                ev.owned.add(key);
                changed = true;
            }
        }
        for (const col of ev.lit) {
            if (col >= lo && col <= hi) continue;
            this.darkenStormColumn(ev, col);
            ev.lit.delete(col);
            changed = true;
        }
        if (changed) this.markRadiationChanged();
    }

    // Give back one column of storm-owned radiation.
    darkenStormColumn(ev: RadStormEvent, col: number): void {
        for (let row = 0; row < this.num_rows; row++) {
            const key = col + ',' + row;
            if (!ev.owned.delete(key)) continue;
            this.radiation_map.delete(key);
        }
    }

    // Announce that radiation_map has changed; every writer of it must call
    // this, including the brush in EnvironmentController (see the field).
    markRadiationChanged(): void {
        this.radiation_version++;
    }

    /* The auto-scheduler behind Evolution Controls' "Random world events". Off
       by default, and consulted only when on -- no RNG is drawn otherwise, so a
       benchmark or test run with the toggle off ticks exactly as it did before
       the scheduler existed (concepts/proposals/07-world-events). */
    maybeScheduleRandomEvent(): void {
        if (!Hyperparams.randomEvents) return;
        const interval = Math.max(MIN_RANDOM_EVENT_INTERVAL, Math.round(Hyperparams.randomEventInterval));
        if (this.total_ticks === 0 || this.total_ticks % interval !== 0) return;
        this.triggerRandomEvent();
    }

    // Roll one event from the scheduler's library and fire it where it lands.
    triggerRandomEvent(): ScheduledEvent {
        const kind = SCHEDULED_EVENTS[Math.floor(Math.random() * SCHEDULED_EVENTS.length)];
        switch (kind) {
            case 'meteor': {
                const radius = AUTO_METEOR_MIN_RADIUS +
                    Math.floor(Math.random() * (AUTO_METEOR_MAX_RADIUS - AUTO_METEOR_MIN_RADIUS + 1));
                this.meteorStrike(
                    Math.floor(Math.random() * this.num_cols),
                    Math.floor(Math.random() * this.num_rows),
                    radius);
                break;
            }
            case 'bloom': this.triggerBloom(); break;
            case 'iceage': this.triggerIceAge(); break;
            case 'radstorm': this.triggerRadStorm(); break;
        }
        return kind;
    }

    /* Invasive predator (Events tab): release a founding pack of one bestiary
       species (src/Organism/Predators.ts) scattered around (col, row).

       The founders are ordinary organisms from the moment they land -- they
       age, starve, mutate and can be wiped out by what they invaded. What the
       event provides is the introduction: a hand-built genome the world could
       not plausibly have reached on its own, dropped where the player points.

       Returns how many actually found room, which is fewer than def.pack in a
       crowded world and zero in a full one. */
    releasePredator(def: PredatorSpecies, col: number, row: number, radius: number): number {
        /* Candidate anchors around the click, shuffled so the pack scatters
           instead of packing into the first ring the scan reaches. Walked
           monotonically across founders (`next`), so placing a whole pack costs
           one pass over the neighbourhood rather than one per founder. */
        const spots = Neighbors.inRange(Math.max(radius, PREDATOR_MIN_SPREAD)).slice();
        for (let i = spots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [spots[i], spots[j]] = [spots[j], spots[i]];
        }
        let next = 0;

        /* Does this organism's whole rotated footprint fit at (col, row)?
           Deliberately not Organism.isClear(), which also refuses to overlap
           food while foodBlocksReproduction is on (the default). That rule
           exists to stop organisms breeding into their own food supply, and
           applying it here would make a release fail in exactly the worlds
           worth invading: a settled producer mat is carpeted in food, and the
           first trial of this event placed zero of a six-strong pack into one.
           A founder lands on top of the food instead -- updateGrid overwrites
           those cells, so the pack eats its landing site. */
        const footprintFits = (org: Organism, col: number, row: number): boolean => {
            for (const body_cell of org.anatomy.cells) {
                const idx = this.grid_map.indexAt(
                    col + body_cell.rotatedCol(org.rotation),
                    row + body_cell.rotatedRow(org.rotation));
                if (idx < 0)
                    return false;
                const state = this.grid_map.stateOf(idx);
                // Walls and the dish glass are states of their own, so this
                // rejects them; an owner means another organism (living or a
                // founder already published by this release) is standing there.
                if (state !== CellStates.empty && state !== CellStates.food)
                    return false;
                if (this.grid_map.ownerOf(idx) != null)
                    return false;
            }
            return true;
        };

        // Build a founder and walk the remaining anchors for somewhere it fits.
        const placeFounder = (): Organism | null => {
            const org = new Organism(col, row, this as unknown as OrganismEnv);
            org.loadRaw(def.genome);
            // Each founder lands facing its own way, so a pack reads as
            // individuals rather than a formation.
            org.rotation = Directions.getRandomDirection();
            org.direction = Directions.getRandomDirection();
            while (next < spots.length) {
                const loc = spots[next++];
                org.c = col + loc[0];
                org.r = row + loc[1];
                if (footprintFits(org, org.c, org.r))
                    return org;
            }
            return null;
        };

        /* The first founder is placed before the species is registered: a
           species with no members would sit in the extant registry forever,
           since only a death can fossilize one. */
        const first = placeFounder();
        if (!first) {
            Notifier.notify(`No room to release ${def.name} here`);
            return 0;
        }

        const species = new Species(first.anatomy, null, this.total_ticks);
        species.name = FossilRecord.uniqueSpeciesName(def.name);
        // Both counters, not just population: the constructor seeds each at 1
        // for the organism it was built from, and publish() below counts every
        // founder including that one.
        species.population = 0;
        species.cumulative_pop = 0;
        FossilRecord.addSpeciesObj(species);

        // Species first, then publish -- update(), reproduce() and die() all
        // dereference org.species unguarded. Same order as OriginOfLife().
        const publish = (org: Organism) => {
            org.species = species;
            this.addOrganism(org);
            species.addPop();
        };
        publish(first);
        while (species.population < def.pack) {
            const org = placeFounder();
            if (!org) break;
            publish(org);
        }

        /* The Narrator would otherwise report this as "a new lifeform emerged"
           on its next sample -- a duplicate of the toast below, and a false
           account of where the lineage came from. */
        Narrator.acknowledge(species);
        Notifier.notify(
            `☣ ${species.name} released — ${species.population} founder${species.population === 1 ? '' : 's'}`,
            // Named rather than pinned to the release point: the pack scatters
            // and then moves, so by the time anyone clicks, "where they are" is
            // a better answer than "where they were dropped".
            { organism: first.anatomy.cells, focus: { kind: 'species', name: species.name } },
        );
        if (this.engine) this.engine.emitChange(true);
        return species.population;
    }

    /* The Great Cull (Fate Deck): an indiscriminate mass extinction. Every
       living organism gets the same independent coin flip, and nothing about
       its body, species, age or size moves the odds.

       That is the whole licence for this method. A card is allowed to be a
       pressure and never a result, and the deck otherwise obeys that by only
       ever changing what the world rewards. A cull is the edge case, and it
       stays on the right side of the line for exactly the reason a meteor does:
       it is something that happens *to* the world, not a selection the player
       makes on evolution's behalf. Weight these odds by anything an organism is
       -- cull "the movers", cull the largest -- and the run stops being pure
       selection and starts being the player's opinion.

       The dead are left where they fall, since die() turns each cell to food:
       the survivors inherit a world strewn with the rest, which is the
       mass-extinction-then-boom the Narrator's crash detection reports on its
       next window. Announced with the caller's own name for the event, the way
       releasePredator announces with the species'. */
    cullPopulation(fraction: number, message: string): number {
        let killed = 0;
        for (const org of this.organisms) {
            if (!org.living || Math.random() >= fraction) continue;
            org.die();
            killed++;
        }
        // die() only flags the body; this is what takes them out of the world,
        // and what trips auto-pause / auto-reset if the cull took everything.
        this.clearDeadOrganisms();
        Notifier.notify(
            `${message} — ${killed} organism${killed === 1 ? '' : 's'} taken at random`,
            // Blind by design, so it has no place in the world -- only a shape
            // on the population graph.
            { focus: { kind: 'panel', panel: 'stats' } },
        );
        if (this.engine) this.engine.emitChange(true);
        return killed;
    }

    /* Meteor (Events tab): launch a strike at (col, row). The click only sets
       the fireball falling; the blast itself lands METEOR_FALL_MS later, when
       stepMeteors() -- driven by the render loop, which never stops -- runs
       resolveMeteorStrike(). So a strike aimed while paused still lands, and
       the sim keeps moving under the falling meteor: organisms can wander
       into (or out of) the doomed circle during the fall. */
    meteorStrike(col: number, row: number, radius: number): void {
        const cs = this.renderer.cell_size;
        // Streak in from high off to one side; which side is a cosmetic coin flip.
        const side = Math.random() < 0.5 ? -1 : 1;
        const dist = Math.max(30, radius * 5) * cs;
        this.active_meteors.push({
            col, row, radius,
            start: performance.now(),
            from_x: (col + 0.5) * cs + side * dist * 0.75,
            from_y: (row + 0.5) * cs - dist,
            resolved: false,
            embers: [],
        });
        // The crater is fixed, so the impact point stays the right destination
        // long after the fireball has landed.
        Notifier.notify('☄ Meteor incoming', { focus: { kind: 'cell', col, row } });
        if (this.engine) this.engine.emitChange(true);
    }

    // The blast, run at impact time. Everything living in the radius dies,
    // and the crater is strewn with food from the dead -- a
    // mass-extinction-then-boom the Narrator's own crash detection then
    // reports on its next window. Skips the dish glass and its exterior so a
    // strike never punches the bounds.
    resolveMeteorStrike(col: number, row: number, radius: number): void {
        const SCATTER_PROB = 0.45;
        for (const loc of Neighbors.inRange(radius)) {
            const c = col + loc[0];
            const r = row + loc[1];
            const idx = this.grid_map.indexAt(c, r);
            if (idx < 0 || this.grid_map.dishTierOf(idx) !== 0) continue;
            const owner = this.grid_map.ownerAt(c, r);
            if (owner != null) owner.die();
            const state = this.grid_map.stateAt(c, r);
            // Leave walls standing; scatter food onto the bared ground.
            if (state === CellStates.empty || state === CellStates.food) {
                this.changeCell(c, r, Math.random() < SCATTER_PROB ? CellStates.food : CellStates.empty, null);
            }
        }
        if (this.engine) this.engine.emitChange(true);
    }

    /* Land any meteor whose fall has elapsed, then drop fully-finished fx.
       Called from render() BEFORE the headless early-out: landing is sim
       mutation, not cosmetics, so it must run even when nothing is painted.
       Resolution runs before pruning, so even a frame gap longer than the
       whole timeline (tab hidden throughout) still lands the strike. */
    stepMeteors(now: number): void {
        if (this.active_meteors.length === 0) return;
        for (const fx of this.active_meteors) {
            if (!fx.resolved && now - fx.start >= METEOR_FALL_MS) {
                fx.resolved = true;
                this.resolveMeteorStrike(fx.col, fx.row, fx.radius);
                this.spawnMeteorEmbers(fx);
                this.shakeWorld();
            }
        }
        this.active_meteors = this.active_meteors.filter(fx => now - fx.start < METEOR_FALL_MS + METEOR_GLOW_MS);
    }

    spawnMeteorEmbers(fx: MeteorFx): void {
        const cs = this.renderer.cell_size;
        const blast_r = (fx.radius + 0.5) * cs;
        const n = Math.min(40, 12 + fx.radius * 2);
        for (let i = 0; i < n; i++) {
            fx.embers.push({
                angle: Math.random() * Math.PI * 2,
                reach: blast_r * (0.8 + Math.random() * 1.6),
                size: cs * (0.5 + Math.random() * 0.9),
                life: METEOR_EMBER_MIN_MS + Math.random() * (METEOR_EMBER_MAX_MS - METEOR_EMBER_MIN_MS),
                color: METEOR_COLORS[Math.floor(Math.random() * METEOR_COLORS.length)],
            });
        }
    }

    /* One jolt of the whole canvas stack -- world, glow and deco overlays all
       live inside #env, so shaking the container keeps them coherent, and its
       static transform (index.css) means the animation overriding it is safe.
       The remove/reflow/add restarts a shake already in flight. */
    shakeWorld(): void {
        const el = this.container;
        if (!el) return;
        el.classList.remove('meteor-shake');
        void el.offsetWidth;
        el.classList.add('meteor-shake');
    }

    // Every cell under the rectangle (world px) repaints at the start of the
    // next fx pass; anything the fx drew there this frame can't smear.
    markFxBounds(x0: number, y0: number, x1: number, y1: number): void {
        const cs = this.renderer.cell_size;
        const c0 = Math.max(0, Math.floor(x0 / cs));
        const c1 = Math.min(this.grid_map.cols - 1, Math.floor(x1 / cs));
        const r0 = Math.max(0, Math.floor(y0 / cs));
        const r1 = Math.min(this.grid_map.rows - 1, Math.floor(y1 / cs));
        for (let c = c0; c <= c1; c++) {
            for (let r = r0; r <= r1; r++) {
                this.fx_cells.add(this.grid_map.indexAt(c, r));
            }
        }
    }

    /* Immediate-mode meteor pass, drawn after the cursor overlay so the
       fireball and blast paint over everything on the world canvas. */
    renderMeteorFx(now: number): void {
        const renderer = this.renderer;
        const ctx = renderer.ctx;
        if (!ctx) return;
        for (const idx of this.fx_cells)
            renderer.renderCell(idx);
        this.fx_cells.clear();
        if (this.active_meteors.length === 0) return;
        ctx.save();
        for (const fx of this.active_meteors) {
            const t = now - fx.start;
            if (t < METEOR_FALL_MS) this.drawMeteorFall(ctx, fx, t / METEOR_FALL_MS);
            else this.drawMeteorImpact(ctx, fx, t - METEOR_FALL_MS);
        }
        ctx.restore();
    }

    drawMeteorFall(ctx: CanvasRenderingContext2D, fx: MeteorFx, p: number): void {
        const cs = this.renderer.cell_size;
        const ix = (fx.col + 0.5) * cs;
        const iy = (fx.row + 0.5) * cs;
        const ease = p * p; // gravity: the streak accelerates into the ground
        const head_r = Math.max(cs * 1.3, fx.radius * cs * 0.4);
        const hx = fx.from_x + (ix - fx.from_x) * ease;
        const hy = fx.from_y + (iy - fx.from_y) * ease;
        ctx.globalCompositeOperation = 'lighter';
        /* The trail is the same path sampled at earlier eased positions, so
           its on-screen length grows with speed; radii flicker per frame --
           purely visual randomness, nothing feeds back into the sim. */
        const SEGS = 7;
        for (let i = SEGS; i >= 1; i--) {
            const back = Math.max(0, ease - i * 0.045);
            const tx = fx.from_x + (ix - fx.from_x) * back;
            const ty = fx.from_y + (iy - fx.from_y) * back;
            const r = head_r * (1 - i / (SEGS + 2)) * (0.9 + Math.random() * 0.2);
            const cool = Math.min(METEOR_COLORS.length - 1, 1 + Math.floor(i * 0.6));
            ctx.globalAlpha = 0.5 * (1 - i / (SEGS + 1));
            ctx.fillStyle = METEOR_COLORS[cool];
            ctx.beginPath();
            ctx.arc(tx, ty, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // White-hot head: three additive layers read as one glowing fireball.
        const layers: [number, string][] = [[1, 'rgba(255,140,66,0.7)'], [0.65, 'rgba(255,209,102,0.9)'], [0.35, 'rgba(255,255,255,1)']];
        ctx.globalAlpha = 1;
        for (const [scale, color] of layers) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(hx, hy, head_r * scale, 0, Math.PI * 2);
            ctx.fill();
        }
        const tail = Math.max(0, ease - SEGS * 0.045);
        const tail_x = fx.from_x + (ix - fx.from_x) * tail;
        const tail_y = fx.from_y + (iy - fx.from_y) * tail;
        const pad = head_r + 2;
        this.markFxBounds(Math.min(hx, tail_x) - pad, Math.min(hy, tail_y) - pad,
            Math.max(hx, tail_x) + pad, Math.max(hy, tail_y) + pad);
    }

    // u: ms since impact. Layers: crater afterglow under an overexposed
    // flash, a double shockwave ring, and the embers -- chunky pixel squares
    // to match the art style, not anti-aliased particles.
    drawMeteorImpact(ctx: CanvasRenderingContext2D, fx: MeteorFx, u: number): void {
        const cs = this.renderer.cell_size;
        const ix = (fx.col + 0.5) * cs;
        const iy = (fx.row + 0.5) * cs;
        const blast_r = (fx.radius + 0.5) * cs;

        if (u < METEOR_GLOW_MS) {
            const p = u / METEOR_GLOW_MS;
            const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, blast_r);
            g.addColorStop(0, `rgba(255,120,40,${0.5 * (1 - p)})`);
            g.addColorStop(1, 'rgba(255,60,20,0)');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ix, iy, blast_r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'lighter';

        if (u < METEOR_FLASH_MS) {
            const p = u / METEOR_FLASH_MS;
            const flash_r = blast_r * (0.6 + 0.9 * p);
            const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, flash_r);
            g.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - p)})`);
            g.addColorStop(0.55, `rgba(255,220,120,${0.8 * (1 - p)})`);
            g.addColorStop(1, 'rgba(255,150,50,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ix, iy, flash_r, 0, Math.PI * 2);
            ctx.fill();
        }

        if (u < METEOR_SHOCK_MS) {
            const p = u / METEOR_SHOCK_MS;
            const eased = 1 - (1 - p) * (1 - p) * (1 - p);
            const ring_r = blast_r * (0.35 + 1.45 * eased);
            ctx.lineWidth = Math.max(1, cs * 1.4 * (1 - p));
            ctx.strokeStyle = `rgba(255,170,80,${0.85 * (1 - p)})`;
            ctx.beginPath();
            ctx.arc(ix, iy, ring_r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, cs * 0.5 * (1 - p));
            ctx.strokeStyle = `rgba(255,255,220,${0.7 * (1 - p)})`;
            ctx.beginPath();
            ctx.arc(ix, iy, ring_r * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }

        for (const e of fx.embers) {
            if (u >= e.life) continue;
            const p = u / e.life;
            const d = e.reach * (1 - (1 - p) * (1 - p)); // fast exit, drifting stop
            const ex = ix + Math.cos(e.angle) * d;
            const ey = iy + Math.sin(e.angle) * d;
            const sz = Math.max(1, e.size * (1 - 0.5 * p));
            ctx.globalAlpha = p < 0.6 ? 1 : (1 - p) / 0.4;
            ctx.fillStyle = e.color;
            ctx.fillRect(Math.round(ex - sz / 2), Math.round(ey - sz / 2), Math.round(sz), Math.round(sz));
        }
        ctx.globalAlpha = 1;

        // Embers fly furthest (up to 2.4x the blast radius); after they die
        // only the afterglow disc is left to keep clean.
        const reach = u < METEOR_EMBER_MAX_MS ? blast_r * 2.6 + cs * 2 : blast_r + cs;
        this.markFxBounds(ix - reach, iy - reach, ix + reach, iy + reach);
    }

    // Destructive: callers are responsible for confirming with the user first
    reset(reset_life: boolean = true): boolean {
        // Wind back any in-flight event before wiping the clock, so a bloom's
        // foodProdProb spike never survives into the fresh world.
        for (const ev of this.active_events) ev.restore();
        this.active_events = [];
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid();
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.active_explosions = [];
        this.active_projectiles = [];
        /* A strike still falling was aimed at a world that no longer exists;
           one that already landed keeps its fireworks. That matters beyond
           looks: a big blast can extinguish the world and trip auto_reset on
           the very next tick, and without this the explosion vanished at the
           exact moment of impact -- the aftermath playing over the fresh
           world is what tells the player their meteor caused the reset.
           The repaint set can clear outright: renderFullGrid below repaints
           every cell anyway. */
        this.active_meteors = this.active_meteors.filter(fx => fx.resolved);
        this.fx_cells.clear();
        this.setNightMode(false);
        /* Both overlays must repaint from the emptied world. Nothing else in
           this method routes through changeCell (fillGrid writes the grid
           directly), so missing a flag here leaves that overlay's stale
           pixels up indefinitely -- glow was the one missed: Clear Life
           (reset(false)) kept every organism's halo on screen. The reseeding
           path masked it because OriginOfLife's changeCell sets both flags. */
        this.deco_dirty = true;
        this.glow_dirty = true;
        this.radiation_map.clear();
        this.markRadiationChanged();
        FossilRecord.clear_record();
        // Drop the narration baseline so the reseeded world isn't announced as
        // brand-new drama on the next sample.
        Narrator.reset();
        // Every organism the tracker was watching is gone with the world;
        // clearing silently beats announcing a lineage "ended" that was wiped.
        this.lineage.reset();
        if (reset_life)
            this.OriginOfLife();
        return true;
    }

    /* A resize rebuilds every cell, so every grid index anything is still
       holding -- the wall list, the renderer's dirty and highlight sets --
       now names a different cell, or none at all. Drop them at the resize
       rather than let one surface later against the new grid. Under the old
       object grid the same lists went on referencing cells that were no
       longer in any grid, which clearWalls had to re-look-up around. */
    dropCellIndices(): void {
        this.walls = [];
        this.renderer.cells_to_render.clear();
        this.renderer.cells_to_highlight.clear();
        this.renderer.highlighted_cells.clear();
    }

    resizeGridColRow(cell_size: number | string, cols: number, rows: number): void {
        cell_size = Number(cell_size);
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
        this.dropCellIndices();
        this.syncOverlaySizes();
    }

    resizeFillWindow(cell_size: number): void {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow();
        this.syncOverlaySizes();
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
        this.dropCellIndices();
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
        /* A bloom, an ice age or a Fate Deck card is transient weather, but it
           works by holding Hyperparams fields at shifted values -- and that is
           the object the save writes. Saving mid-event would bake the spike into
           the file for good (it has no event to expire and wind it back), so
           every live shift's baselines are substituted back in. Merging them all
           is unambiguous only because triggerParamShift refuses to let two live
           shifts hold the same field; see the note there. The live world keeps
           its events either way: saving shouldn't call off the weather. */
        let controls: HyperparamsSingleton = Hyperparams;
        for (const ev of this.active_events) {
            if (!('baselines' in ev)) continue;
            controls = { ...controls, ...(ev as ParamShiftEvent).baselines };
        }
        env.controls = controls;
        // See the interface comment: the glass never lands in env.grid, so the
        // dish is saved as a flag for loadRaw to rebuild from.
        env.petri_dish = WorldConfig.petri_dish;
        return env;
    }

    loadRaw(env: unknown): void { // species name->stats map, evolution controls,
        /* Asserted, not runtime-checked: the JS did no validation either and
           adding a guard here would change behavior on malformed saves. `raw` is
           a type-only view of the value already in hand. */
        let raw = env as SerializedWorld;
        /* Wind back anything still in flight before the incoming world arrives,
           the same wipe reset() does and for a sharper reason: an event holds
           Hyperparams at a shifted value and its restore() closes over the
           *outgoing* world's baselines, so a card that survived the load would
           eventually stamp a dead world's food rate onto this one. active_events
           is an array, so neither serialize() nor the overwriteNonObjects at the
           end of this method touches it -- without this it simply persists. Both
           load paths (WorldsModal, FirstRun) apply raw.controls after this
           returns, so the wind-back cannot clobber what was loaded. */
        for (const ev of this.active_events) ev.restore();
        this.active_events = [];
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = raw.grid.cell_size ? raw.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, raw.grid.cols, raw.grid.rows)
        this.grid_map.loadRaw(raw.grid);
        for (let wall of raw.grid.walls) {
            /* A save can name a wall outside the grid it declares -- both load
               paths validate only that `grid` and `organisms` are present, so a
               hand-edited or version-mismatched file gets here intact. indexAt
               returns -1 for those, and an unchecked push put a null cell in
               this.walls, where it surfaced far away and much later as a
               TypeError in clearWalls (which read wall.col off it). Skipping
               it matches what every other wall-writing path already does:
               randomizeWalls and dropCellType both test the cell first. */
            let wall_idx = this.grid_map.indexAt(wall.c, wall.r);
            if (wall_idx >= 0) {
                this.walls.push(wall_idx);
            }
        }
        /* A world loads into the space it was designed for, so the save's own
           dish flag decides -- not the session's current setting. Stamping the
           dish over a rectangular world would glass over its layout and kill
           everything outside the circle; the bundled worlds all predate the
           dish and carry no flag. The global is updated to match so everything
           keyed off it (Floaties' dish geometry, the New Game defaults, the
           next serialize) agrees with the world now on screen. The grid resize
           above rebuilt every cell, so a previous dish's glass flags are
           already gone. */
        WorldConfig.petri_dish = !!raw.petri_dish;
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
        // Re-seed narration silently against the loaded world, so a load doesn't
        // announce every species it just restored.
        Narrator.reset();
        // Tracking is by live organism reference, which a save cannot carry.
        this.lineage.reset();
        SerializeHelper.overwriteNonObjects(raw, this as unknown as Record<string, unknown>);
        /* The camera belongs to the world that was on screen, not to this one:
           pan is in screen px and the canvas is re-sized to the incoming grid,
           so a pan that framed a 1540px world leaves a 560px one entirely off
           screen -- the load looked like it had silently failed. Reset before
           the repaint below, so updateView() measures the canvas where it now
           sits rather than culling the whole world away as off screen. */
        this.controller.resetView();
        this.renderer.renderFullGrid();
    }
}

export default WorldEnvironment;
