import WorldEnvironment from './Environments/WorldEnvironment';
import ControlPanel from './Controllers/ControlPanel';
import OrganismEditor from './Environments/OrganismEditor';
import ColorScheme from './Rendering/ColorScheme';
import WorldConfig from './WorldConfig';

/* The canvases and container the React layer hands the engine on construction.
   Declared nullable to match what WorldEnvironment accepts -- App passes live
   refs, but the environment is written to cope with an unmounted canvas. */
export interface EngineCanvases {
    env_canvas: HTMLCanvasElement | null;
    env_container: HTMLElement | null;
    glow_canvas: HTMLCanvasElement | null;
    deco_canvas: HTMLCanvasElement | null;
}

/* Notified on every emitChange(); the React HUD subscribes with a re-render. */
export type EngineListener = () => void;

// If the simulation speed is below this value, a new interval will be created to handle ui rendering
// at a reasonable speed. If it is above, the simulation interval will be used to update the ui.
const min_render_speed = 60;

/* The playback ladder. Index 0 is stopped -- pause is the bottom of the speed
   scale rather than a separate flag, so "is the sim running, and how fast" has
   exactly one representation, and each control is an absolute destination.

   The multipliers stop at 4x because that is where the machine does: measured
   tick rates plateau around 120/sec with rendering on and 220/sec headless, so
   the 5x and 10x steps this replaced delivered nothing over 2x -- and 10x ran
   *slower* than 2x (99/sec), the interval oversubscribing until it thrashed.
   4x is the last step that is real, and only headless makes it fully so. */
export interface SpeedMode {
    label: string;
    icon: string;
    multiplier: number;
}

export const SPEED_MODES: SpeedMode[] = [
    {label: 'Pause',  icon: 'fa-pause',        multiplier: 0},
    {label: 'Play',   icon: 'fa-play',         multiplier: 1},
    {label: 'Fast',   icon: 'fa-forward',      multiplier: 2},
    {label: 'Faster', icon: 'fa-forward-fast', multiplier: 4},
];

export const DEFAULT_SPEED_INDEX = 1; // Play, 1x

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
    ui_last_update: number;
    ui_delta_time: number;
    actual_fps: number;
    listeners: Set<EngineListener>;
    last_emit: number;
    /* Genuinely absent for a real window: the constructor never touches either
       handle, and start()/setUiLoop() read them (`if (this.sim_loop)`,
       `if (this.ui_loop != null)`) before anything has assigned one -- so the
       first read of each really does see undefined, not null. Hence `| null |
       undefined` rather than a definite-assignment `!`.

       ReturnType<typeof setInterval> rather than `number` or `NodeJS.Timeout`:
       which of the two overloads is in scope depends on whether node types are
       present, and this follows whichever one the build actually resolves. */
    sim_loop: ReturnType<typeof setInterval> | null | undefined;
    ui_loop: ReturnType<typeof setInterval> | null | undefined;

    // env_canvas/env_container: the world canvas and its containing element.
    // glow_canvas: overlay the world environment composites organism glow onto.
    // deco_canvas: overlay for organism decorations that overflow their cells.
    // The world canvas is always mounted; the editor canvas is attached later
    // via organism_editor.bindCanvas when its panel mounts.
    constructor({env_canvas, env_container, glow_canvas, deco_canvas}: EngineCanvases){
        // Constructed stopped; App starts the loops once it has the engine.
        this.speed_index = 0;
        this.resume_index = DEFAULT_SPEED_INDEX;
        this.env = new WorldEnvironment(5, env_canvas, env_container, glow_canvas, deco_canvas);
        this.env.engine = this;
        this.organism_editor = new OrganismEditor();
        this.controlpanel = new ControlPanel(this);
        this.colorscheme = new ColorScheme(this.env, this.organism_editor);
        this.colorscheme.loadColorScheme();
        this.env.OriginOfLife();
        if (WorldConfig.petri_dish)
            this.env.buildPetriDish();

        this.sim_last_update = Date.now();
        this.sim_delta_time = 0;

        this.ui_last_update = Date.now();
        this.ui_delta_time = 0;

        this.actual_fps = 0;

        this.listeners = new Set();
        this.last_emit = 0;
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
       with the ladder. fps is zero while paused -- applyLoops() reads that as
       "no sim interval". */
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

    /* The single reconciler for both intervals: what they should be is entirely
       a function of speed_index, so tear down whatever is there and rebuild what
       that speed implies. The ui loop keeps running while stopped, so the world
       still repaints for panning, editing and tool overlays. */
    applyLoops(): void {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        const fps = this.fps;
        if (fps > 0) {
            /* Rebase before the first tick: otherwise the delta spans the whole
               pause, and the world would take one enormous step on resume. */
            this.sim_last_update = Date.now();
            this.sim_loop = setInterval(()=>{
                this.updateSimDeltaTime();
                this.environmentUpdate();
            }, 1000/fps);
        }
        if (fps >= min_render_speed) {
            if (this.ui_loop != null) {
                clearInterval(this.ui_loop);
                this.ui_loop = null;
            }
        }
        else
            this.setUiLoop();
    }

    setUiLoop(): void {
        if (!this.ui_loop) {
            this.ui_loop = setInterval(()=> {
                this.updateUIDeltaTime();
                this.necessaryUpdate();
            }, 1000/min_render_speed);
        }
    }

    updateSimDeltaTime(): void {
        this.sim_delta_time = Date.now() - this.sim_last_update;
        this.sim_last_update = Date.now();
        if (!this.ui_loop) // if the ui loop isn't running, use the sim delta time
            this.ui_delta_time = this.sim_delta_time;
    }

    updateUIDeltaTime(): void {
        this.ui_delta_time = Date.now() - this.ui_last_update;
        this.ui_last_update = Date.now();
    }

    environmentUpdate(): void {
        this.actual_fps = (1000/this.sim_delta_time);
        this.env.update(this.sim_delta_time);
        if(this.ui_loop == null) {
            this.necessaryUpdate();
        }

    }

    necessaryUpdate(): void {
        this.env.render();
        this.organism_editor.update();
        this.emitChange();
    }

    // Full teardown (unlike stop(), which keeps a ui loop running for rendering while paused)
    dispose(): void {
        /* Both handles are `number | null | undefined`; clearInterval is typed
           for `number | undefined`. Either way an id that matches no active
           timer is a no-op per spec, so this normalises the null rather than
           branching. */
        clearInterval(this.sim_loop ?? undefined);
        clearInterval(this.ui_loop ?? undefined);
        this.sim_loop = null;
        this.ui_loop = null;
        this.speed_index = 0;
    }

}

export default Engine;
