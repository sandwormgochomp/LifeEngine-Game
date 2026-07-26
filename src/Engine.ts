import WorldEnvironment from './Environments/WorldEnvironment';
import ControlPanel from './Controllers/ControlPanel';
import OrganismEditor from './Environments/OrganismEditor';
import ColorScheme from './Rendering/ColorScheme';
import WorldConfig from './WorldConfig';
import Perf from './Stats/Perf';

/* The canvases and container the React layer hands the engine on construction.
   Declared nullable to match what WorldEnvironment accepts -- App passes live
   refs, but the environment is written to cope with an unmounted canvas. */
export interface EngineCanvases {
    env_canvas: HTMLCanvasElement | null;
    env_container: HTMLElement | null;
    glow_canvas: HTMLCanvasElement | null;
    deco_canvas: HTMLCanvasElement | null;
    cursor_canvas: HTMLCanvasElement | null;
}

/* Notified on every emitChange(); the React HUD subscribes with a re-render. */
export type EngineListener = () => void;

// The sim interval always fires at this rate; speed multiplies the number of
// ticks run per firing rather than the firing rate, so no speed setting can
// oversubscribe the timer (240Hz intervals sat at the browser's ~4ms clamp
// and thrashed -- the reason 10x once ran slower than 2x).
const base_tick_rate = 60;

/* The playback ladder. Index 0 is stopped -- pause is the bottom of the speed
   scale rather than a separate flag, so "is the sim running, and how fast" has
   exactly one representation, and each control is an absolute destination.

   Rendering runs on its own requestAnimationFrame loop and never shares the
   sim interval, so ticks stop paying the render cost (measured before the
   split: 81 ticks/sec at 4x rendered vs 212 headless on the same world).

   The ladder spans 0.5x to 8x. Sub-1x speeds work by carrying fractional
   ticks between interval firings (0.5x ticks every other firing); the top
   end is a *target* -- on a dense world the tick budget is the wall and the
   delivered rate simply plateaus below it, which the perf panel reports
   honestly via actual_tps. */
export interface SpeedMode {
    label: string;
    icon: string;
    multiplier: number;
}

export const SPEED_MODES: SpeedMode[] = [
    {label: 'Pause',  icon: 'fa-pause',        multiplier: 0},
    {label: 'Play',   icon: 'fa-play',         multiplier: 0.5},
    {label: 'Fast',   icon: 'fa-forward',      multiplier: 4},
    {label: 'Faster', icon: 'fa-forward-fast', multiplier: 8},
];

export const DEFAULT_SPEED_INDEX = 1; // Play, 0.5x

class Engine {
    /* No initializers: useDefineForClassFields is false and these must stay
       bare declarations, so the constructor assignments remain the only writes. */
    /* Playback is these two fields and nothing else. speed_index is the whole
       transport state, 0 meaning stopped; the intervals below are reconciled to
       match it by applyLoops(), their only writer outside dispose().
       resume_index remembers the last moving speed, purely so the spacebar has
       somewhere to come back to. */
    speed_index: number;
    resume_index: number;
    env: WorldEnvironment;
    organism_editor: OrganismEditor;
    controlpanel: ControlPanel;
    colorscheme: ColorScheme;
    sim_last_update: number;
    sim_delta_time: number;
    /* Fractional-tick carry for sub-1x speeds: each firing banks the
       multiplier and a tick runs per whole unit banked, so 0.5x ticks every
       other firing instead of rounding to 0 or 1. Reset by applyLoops() so a
       leftover fraction never crosses a speed change or a pause. */
    tick_carry: number;
    /* Measured render rate: how often necessaryUpdate() actually runs. Stays
       live while paused, since the rAF loop keeps repainting for panning and
       editing.

       Both rates are computed by counting events over a ~500ms window rather
       than smoothing instantaneous 1000/delta readings: averaging rates is
       biased upward under timer jitter (a 2ms/6ms alternation averages to
       333/s when the true rate is 250/s), and this readout exists to be
       honest about what the machine delivers. */
    frame_count: number;
    frame_window_start: number;
    actual_fps: number;
    /* Measured sim tick rate, same windowed count. Distinct from the fps
       *target* (the getter below): this is what the machine actually
       delivers, which plateaus well under 240 at 4x. Zeroed while paused. */
    tick_count: number;
    tick_window_start: number;
    actual_tps: number;
    listeners: Set<EngineListener>;
    last_emit: number;
    /* Genuinely absent for a real window: the constructor never touches this
       handle before applyLoops() reads it (`if (this.sim_loop)`) -- so the
       first read really does see undefined, not null. Hence `| null |
       undefined` rather than a definite-assignment `!`.

       ReturnType<typeof setInterval> rather than `number` or `NodeJS.Timeout`:
       which of the two overloads is in scope depends on whether node types are
       present, and this follows whichever one the build actually resolves. */
    sim_loop: ReturnType<typeof setInterval> | null | undefined;
    /* The rAF handle for the render loop, which runs from construction until
       dispose() regardless of playback state: the world must keep repainting
       for panning and editing while paused, and the display can't use more
       than its own refresh rate of frames while running. */
    render_loop: number | null;

    // env_canvas/env_container: the world canvas and its containing element.
    // glow_canvas: overlay the world environment composites organism glow onto.
    // deco_canvas: overlay for organism decorations that overflow their cells.
    // cursor_canvas: overlay the brush/clone-ghost footprint is drawn on, so
    // the pointer never paints into the life-form layer.
    // The world canvas is always mounted; the editor canvas is attached later
    // via organism_editor.bindCanvas when its panel mounts.
    constructor({env_canvas, env_container, glow_canvas, deco_canvas, cursor_canvas}: EngineCanvases){
        // Constructed stopped; App starts the loops once it has the engine.
        this.speed_index = 0;
        this.resume_index = DEFAULT_SPEED_INDEX;
        this.env = new WorldEnvironment(5, env_canvas, env_container, glow_canvas, deco_canvas, cursor_canvas);
        this.env.engine = this;
        this.organism_editor = new OrganismEditor();
        this.organism_editor.engine = this;
        this.controlpanel = new ControlPanel(this);
        this.colorscheme = new ColorScheme(this.env, this.organism_editor);
        this.colorscheme.loadColorScheme();
        this.env.OriginOfLife();
        if (WorldConfig.petri_dish)
            this.env.buildPetriDish();

        this.sim_last_update = Date.now();
        this.sim_delta_time = 0;
        this.tick_carry = 0;

        this.frame_count = 0;
        this.frame_window_start = Date.now();
        this.actual_fps = 0;
        this.tick_count = 0;
        this.tick_window_start = Date.now();
        this.actual_tps = 0;

        this.listeners = new Set();
        this.last_emit = 0;

        // Rendering is on its own clock from the start; playback only ever
        // touches the sim interval.
        this.render_loop = null;
        this.startRenderLoop();
    }

    startRenderLoop(): void {
        const frame = () => {
            this.necessaryUpdate();
            this.render_loop = requestAnimationFrame(frame);
        };
        this.render_loop = requestAnimationFrame(frame);
    }

    // UI change notification. Listeners are called at most every 100ms
    // (use force=true for state changes that should reflect immediately).
    subscribe(listener: EngineListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emitChange(force: boolean = false): void {
        const now = Date.now();
        if (!force && now - this.last_emit < 100)
            return;
        this.last_emit = now;
        for (const listener of this.listeners)
            listener();
    }

    /* Both derived, so there is no second copy of either to drift out of sync
       with the ladder. fps is the *target* tick rate (zero while paused);
       applyLoops() reconciles the sim interval from the same ladder entry. */
    get running(): boolean {
        return this.speed_index > 0;
    }

    get fps(): number {
        return SPEED_MODES[this.speed_index].multiplier * 60;
    }

    // The one mutator for playback; every control routes through it.
    setSpeedIndex(index: number): void {
        const next = Math.max(0, Math.min(SPEED_MODES.length - 1, index));
        if (next === this.speed_index)
            return;
        this.speed_index = next;
        if (next > 0)
            this.resume_index = next;
        this.applyLoops();
        this.emitChange(true);
    }

    // Resume at whatever speed was last running.
    start(): void {
        this.setSpeedIndex(this.resume_index);
    }

    stop(): void {
        this.setSpeedIndex(0);
    }

    toggleRunning(): void {
        if (this.running)
            this.stop();
        else
            this.start();
    }

    /* The single reconciler for the sim interval: what it should be is
       entirely a function of speed_index, so tear down whatever is there and
       rebuild what that speed implies. Rendering is untouched -- the rAF loop
       runs from construction to dispose() regardless of playback state.

       The interval always fires at base_tick_rate; speed runs more ticks per
       firing instead of firing more often, so 8x costs eight tick budgets
       inside one 16.7ms period rather than a 2ms interval the browser clamps
       and thrashes. Fractional speeds carry the remainder between firings,
       so 0.5x ticks every other firing at the full firing rate rather than
       needing a slower second interval. */
    applyLoops(): void {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        const multiplier = SPEED_MODES[this.speed_index].multiplier;
        if (multiplier === 0) {
            this.actual_tps = 0; // read as "not ticking", not a stale rate
            return;
        }
        /* Rebase before the first tick: otherwise the delta spans the whole
           pause, and the world would take one enormous step on resume.
           The tick-rate window rebases for the same reason. */
        this.sim_last_update = Date.now();
        this.tick_count = 0;
        this.tick_window_start = this.sim_last_update;
        this.tick_carry = 0;
        this.sim_loop = setInterval(()=>{
            this.updateSimDeltaTime();
            this.tick_carry += multiplier;
            for (; this.tick_carry >= 1; this.tick_carry--)
                this.environmentUpdate();
        }, 1000/base_tick_rate);
    }

    updateSimDeltaTime(): void {
        this.sim_delta_time = Date.now() - this.sim_last_update;
        this.sim_last_update = Date.now();
    }

    environmentUpdate(): void {
        const t0 = Perf.begin();
        this.env.update(this.sim_delta_time);
        Perf.end('tick', t0);
        Perf.commit(); // one committed sample per tick, even at 4 ticks/firing
        // Windowed tick counting; the rate refreshes about twice a second.
        this.tick_count++;
        const tick_elapsed = Date.now() - this.tick_window_start;
        if (tick_elapsed >= 500) {
            this.actual_tps = this.tick_count * 1000 / tick_elapsed;
            this.tick_count = 0;
            this.tick_window_start = Date.now();
        }
    }

    necessaryUpdate(): void {
        // Same windowed counting as the tick rate above.
        this.frame_count++;
        const frame_elapsed = Date.now() - this.frame_window_start;
        if (frame_elapsed >= 500) {
            this.actual_fps = this.frame_count * 1000 / frame_elapsed;
            this.frame_count = 0;
            this.frame_window_start = Date.now();
        }
        let t = Perf.begin();
        this.env.render();
        Perf.end('render', t);
        t = Perf.begin();
        this.organism_editor.update();
        Perf.end('editor', t);
        /* `emit` sees only the synchronous listener portion -- React commits
           its re-render later -- and is a no-op most frames thanks to the
           100ms throttle. Still worth a row: a slow subscriber shows up here. */
        t = Perf.begin();
        this.emitChange();
        Perf.end('emit', t);
        Perf.commit(); // flush the frame buckets
    }

    // Full teardown (unlike stop(), which keeps the rAF loop rendering while paused)
    dispose(): void {
        /* The handle is `number | null | undefined`; clearInterval is typed
           for `number | undefined`. Either way an id that matches no active
           timer is a no-op per spec, so this normalises the null rather than
           branching. */
        clearInterval(this.sim_loop ?? undefined);
        this.sim_loop = null;
        if (this.render_loop != null) {
            cancelAnimationFrame(this.render_loop);
            this.render_loop = null;
        }
        this.speed_index = 0;
    }

}

export default Engine;
