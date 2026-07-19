const Hyperparams = require("../Hyperparameters");
const Modes = require("./ControlModes");
const StatsPanel = require("../Stats/StatsPanel");
const WorldConfig = require("../WorldConfig");

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

    setHyperparamDefaults() {
        Hyperparams.useGlobalMutability = true;
        Hyperparams.mutability = 3;
        Hyperparams.lifespan = 50;
        Hyperparams.energy_decay = 0.5;
        Hyperparams.radiation = 0.2;
        Hyperparams.foodDropProb = 0.5;
        Hyperparams.minFood = 500;
        Hyperparams.sunlight_direction = 0;
    }

    changeEngineSpeed(fps) {
        this.fps = fps;
        this.engine.start(fps);
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

module.exports = ControlPanel;