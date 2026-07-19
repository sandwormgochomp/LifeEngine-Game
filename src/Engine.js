const WorldEnvironment = require('./Environments/WorldEnvironment');
const ControlPanel = require('./Controllers/ControlPanel');
const OrganismEditor = require('./Environments/OrganismEditor');
const ColorScheme = require('./Rendering/ColorScheme');

// If the simulation speed is below this value, a new interval will be created to handle ui rendering
// at a reasonable speed. If it is above, the simulation interval will be used to update the ui.
const min_render_speed = 60;

class Engine {
    constructor(){
        this.fps = 60;
        this.env = new WorldEnvironment(5);
        this.organism_editor = new OrganismEditor();
        this.controlpanel = new ControlPanel(this);
        this.colorscheme = new ColorScheme(this.env, this.organism_editor);
        this.colorscheme.loadColorScheme();
        this.env.OriginOfLife();
        
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
        clearInterval(this.sim_loop);
        this.running = false;
        this.setUiLoop();
        this.emitChange(true);
    }

    restart(fps) {
        clearInterval(this.sim_loop);
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

module.exports = Engine;
