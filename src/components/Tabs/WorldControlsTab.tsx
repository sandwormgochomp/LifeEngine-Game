import React from 'react';
import styles from '../styles/Hud.module.css';
import type { EngineAPI } from '../../types/engine';
import Modes from '../../Controllers/ControlModes';

interface WorldControlsTabProps {
  engine: EngineAPI | null;
}

const WorldControlsTab: React.FC<WorldControlsTabProps> = ({ engine }) => {

  const envController = engine?.env?.controller;

  const setMode = (mode: number) => {
    if (envController) {
      envController.mode = mode;
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
      </div>
      
      <h4>Environment Generator</h4>
      <div className={styles.buttonGroup}>
        <button id="randomize-walls-btn" onClick={() => engine?.env?.controller?.randomizeWalls()}>Randomize Walls</button>
      </div>
    </div>
  );
};

export default WorldControlsTab;
