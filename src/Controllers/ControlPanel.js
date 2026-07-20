import Hyperparams from "../Hyperparameters";
import Modes from "./ControlModes";
import StatsPanel from "../Stats/StatsPanel";
import WorldConfig from "../WorldConfig";

class ControlPanel {
    constructor(engine) {
        this.engine = engine;
        this.fps = engine.fps;
        this.organism_record = 0;
        this.env_controller = this.engine.env.controller;
        this.editor_controller = this.engine.organism_editor.controller;
        this.env_controller.setControlPanel(this);
        this.editor_controller.setControlPanel(this);
        this.stats_panel = new StatsPanel(this.engine.env);
        this.headless_opacity = 1;
        this.opacity_change_rate = -0.8;
        this.paused = false;
        
        // Setup hyperparams
        this.setHyperparamDefaults();
    }

    // This game's deliberate deviations from Hyperparams.setDefaults(). Only
    // keys the engine actually reads belong here — a previous version set
    // mutability/lifespan/energy_decay/radiation/minFood/sunlight_direction,
    // none of which exist in the engine, so the UI bound to them did nothing.
    setHyperparamDefaults() {
        Hyperparams.foodDropProb = 0.5; // food rains down; producers aren't the only source
    }

    // Restore everything to the state the app boots with
    resetHyperparams() {
        Hyperparams.setDefaults();
        this.setHyperparamDefaults();
    }

    changeEngineSpeed(fps) {
        this.fps = fps;
        this.engine.fps = fps;
        if (this.engine.running) {
            this.engine.start(fps);
        } else {
            this.engine.emitChange(true);
        }
    }

    setPaused(paused) {
        this.paused = paused;
        if (paused) {
            this.engine.stop();
        } else {
            this.engine.start(this.fps);
        }
    }

    setEditorOrganism(org) {
        this.engine.organism_editor.setOrganismToCopyOf(org);
    }
}

export default ControlPanel;