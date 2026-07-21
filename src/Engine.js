import WorldEnvironment from './Environments/WorldEnvironment';
import ControlPanel from './Controllers/ControlPanel';
import OrganismEditor from './Environments/OrganismEditor';
import ColorScheme from './Rendering/ColorScheme';
import WorldConfig from './WorldConfig';

// If the simulation speed is below this value, a new interval will be created to handle ui rendering
// at a reasonable speed. If it is above, the simulation interval will be used to update the ui.
const min_render_speed = 60;

class Engine {
    // env_canvas/env_container: the world canvas and its containing element.
    // glow_canvas: overlay the world environment composites organism glow onto.
    // deco_canvas: overlay for organism decorations that overflow their cells.
    // The world canvas is always mounted; the editor canvas is attached later
    // via organism_editor.bindCanvas when its panel mounts.
    constructor({env_canvas, env_container, glow_canvas, deco_canvas}){
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
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emitChange(force=false) {
        const now = Date.now();
        if (!force && now - this.last_emit < 100)
            return;
        this.last_emit = now;
        for (const listener of this.listeners)
            listener();
    }

    start(fps=60) {
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
    
    stop() {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        this.running = false;
        this.setUiLoop();
        this.emitChange(true);
    }

    restart(fps) {
        if (this.sim_loop) {
            clearInterval(this.sim_loop);
            this.sim_loop = null;
        }
        this.start(fps);
    }

    setUiLoop() {
        if (!this.ui_loop) {
            this.ui_loop = setInterval(()=> {
                this.updateUIDeltaTime();
                this.necessaryUpdate();
            }, 1000/min_render_speed);
        }
    }

    updateSimDeltaTime() {
        this.sim_delta_time = Date.now() - this.sim_last_update;
        this.sim_last_update = Date.now();
        if (!this.ui_loop) // if the ui loop isn't running, use the sim delta time
            this.ui_delta_time = this.sim_delta_time;
    }

    updateUIDeltaTime() {
        this.ui_delta_time = Date.now() - this.ui_last_update;
        this.ui_last_update = Date.now();
    }

    environmentUpdate() {
        this.actual_fps = (1000/this.sim_delta_time);
        this.env.update(this.sim_delta_time);
        if(this.ui_loop == null) {
            this.necessaryUpdate();
        }
            
    }

    necessaryUpdate() {
        this.env.render();
        this.organism_editor.update();
        this.emitChange();
    }

    // Full teardown (unlike stop(), which keeps a ui loop running for rendering while paused)
    dispose() {
        clearInterval(this.sim_loop);
        clearInterval(this.ui_loop);
        this.ui_loop = null;
        this.running = false;
    }

}

export default Engine;
