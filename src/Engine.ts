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

class Engine {
    /* No initializers: useDefineForClassFields is false and these must stay
       bare declarations, so the constructor assignments remain the only writes. */
    fps: number;
    env: WorldEnvironment;
    organism_editor: OrganismEditor;
    controlpanel: ControlPanel;
    colorscheme: ColorScheme;
    sim_last_update: number;
    sim_delta_time: number;
    ui_last_update: number;
    ui_delta_time: number;
    actual_fps: number;
    running: boolean;
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
        this.fps = 60;
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
        this.running = false;

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

    start(fps: number = 60): void {
        if (fps <= 0)
            fps = 1;
        this.fps = fps;
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        this.sim_loop = setInterval(()=>{
            this.updateSimDeltaTime();
            this.environmentUpdate();
        }, 1000/fps);
        this.running = true;
        this.emitChange(true);
        if (this.fps >= min_render_speed) {
            if (this.ui_loop != null) {
                clearInterval(this.ui_loop);
                this.ui_loop = null;
            }
        }
        else
            this.setUiLoop();
    }

    stop(): void {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        this.running = false;
        this.setUiLoop();
        this.emitChange(true);
    }

    restart(fps: number): void {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        this.start(fps);
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
        this.ui_loop = null;
        this.running = false;
    }

}

export default Engine;
