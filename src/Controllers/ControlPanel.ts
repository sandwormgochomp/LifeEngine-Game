import Hyperparams from "../Hyperparameters";
import Modes from "./ControlModes";
import StatsPanel from "../Stats/StatsPanel";
import type { StatsPanelEnvLike } from "../Stats/StatsPanel";
import WorldConfig from "../WorldConfig";

/* Minimal structural views of Engine, WorldEnvironment, OrganismEditor and the
   canvas controllers. These stay structural because ControlPanel and
   CanvasController each describe the other: importing both ways would be a
   real cycle, so the pair has to be untangled together. */
interface CanvasControllerLike {
    setControlPanel(panel: ControlPanel): void;
}

interface ControlPanelEnvLike extends StatsPanelEnvLike {
    controller: CanvasControllerLike;
}

interface OrganismEditorLike {
    controller: CanvasControllerLike;
    /* The organism to copy is untyped at this seam: it crosses over from the
       environment controller's current selection. */
    setOrganismToCopyOf(org: unknown): void;
}

interface EngineLike {
    fps: number;
    running: boolean;
    env: ControlPanelEnvLike;
    organism_editor: OrganismEditorLike;
    start(fps?: number): void;
    stop(): void;
    emitChange(force?: boolean): void;
}

class ControlPanel {
    engine: EngineLike;
    fps: number;
    organism_record: number;
    env_controller: CanvasControllerLike;
    editor_controller: CanvasControllerLike;
    stats_panel: StatsPanel;
    headless_opacity: number;
    opacity_change_rate: number;
    paused: boolean;

    constructor(engine: EngineLike) {
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
    setHyperparamDefaults(): void {
        Hyperparams.foodDropProb = 0.5; // food rains down; producers aren't the only source
    }

    // Restore everything to the state the app boots with
    resetHyperparams(): void {
        Hyperparams.setDefaults();
        this.setHyperparamDefaults();
    }

    changeEngineSpeed(fps: number): void {
        this.fps = fps;
        this.engine.fps = fps;
        if (this.engine.running) {
            this.engine.start(fps);
        } else {
            this.engine.emitChange(true);
        }
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        if (paused) {
            this.engine.stop();
        } else {
            this.engine.start(this.fps);
        }
    }

    setEditorOrganism(org: unknown): void {
        this.engine.organism_editor.setOrganismToCopyOf(org);
    }
}

export default ControlPanel;
