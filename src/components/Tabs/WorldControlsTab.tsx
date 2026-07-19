import React from 'react';
import styles from '../styles/Hud.module.css';

const Modes = require('../../Controllers/ControlModes');

interface WorldControlsTabProps {
  engine: any;
}

const WorldControlsTab: React.FC<WorldControlsTabProps> = ({ engine }) => {

  const envController = engine?.env?.controller;

  const setMode = (mode: number) => {
    if (envController) {
      envController.mode = mode;
    }
  };

  const handleDropOrganism = () => {
    if (engine && engine.env && engine.env.controller && engine.organism_editor) {
      engine.env.controller.mode = Modes.Clone;
      engine.env.controller.org_to_clone = engine.organism_editor.organism;
    }
  };

  const handleClearEnv = () => {
    if (engine && engine.env) {
      if (!window.confirm('The current environment will be lost. Proceed?')) return;
      engine.env.reset(false);
    }
  };

  return (
    <div>
      <h3>World Controls</h3>
      <div className={styles.buttonGroup}>
        <button id="reset-env" onClick={handleClearEnv}>Clear Environment</button>
        <button id="drop-org" onClick={handleDropOrganism}>Drop Organism</button>
      </div>

      <h4>Tools</h4>
      <div className={styles.buttonGroup}>
        <button className="env-mode-btn" id="food" onClick={() => setMode(Modes.FoodDrop)}>Food</button>
        <button className="env-mode-btn" id="wall" onClick={() => setMode(Modes.WallDrop)}>Wall</button>
        <button className="env-mode-btn" id="invincible-wall" onClick={() => setMode(Modes.InvincibleWallDrop)}>Invincible Wall</button>
        <button className="env-mode-btn" id="radiation-drop" onClick={() => setMode(Modes.RadiationDrop)}>Radiation</button>
        <button id="clear-radiation" onClick={() => {
          if (engine) engine.env.radiation_map.clear();
        }}>Clear Radiation</button>
        <button className="env-mode-btn" id="kill" onClick={() => setMode(Modes.ClickKill)}>Kill</button>
        <button className="env-mode-btn" id="drag" onClick={() => setMode(Modes.Drag)}>Drag</button>
        <button className="env-mode-btn" id="select" onClick={() => setMode(Modes.Select)}>Select</button>
      </div>
      
      <h4>Environment Generator</h4>
      <div className={styles.buttonGroup}>
        <button id="randomize-walls-btn" onClick={() => engine?.env?.controller?.randomizeWalls()}>Randomize Walls</button>
      </div>
    </div>
  );
};

export default WorldControlsTab;
