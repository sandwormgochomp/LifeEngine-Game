import React, { useState } from 'react';
import styles from '../styles/Hud.module.css';
import useEngineValue from '../useEngineValue';
import type { EngineAPI } from '../../types/engine';
import Modes from '../../Controllers/ControlModes';
import WorldConfig from '../../WorldConfig';

interface WorldControlsTabProps {
  engine: EngineAPI | null;
}

const TOOLS = [
  { id: 'food', label: 'Food', mode: Modes.FoodDrop, title: 'Paint food onto the world; organisms eat it to survive and reproduce' },
  { id: 'wall', label: 'Wall', mode: Modes.WallDrop, title: 'Paint walls that block movement (killed organisms can destroy them)' },
  { id: 'invincible-wall', label: 'Invincible Wall', mode: Modes.InvincibleWallDrop, title: 'Paint permanent walls that nothing can destroy' },
  { id: 'radiation-drop', label: 'Radiation', mode: Modes.RadiationDrop, title: 'Paint radiation zones that raise mutation rates for organisms inside' },
  { id: 'kill', label: 'Kill', mode: Modes.ClickKill, title: 'Kill organisms under the brush' },
  { id: 'drag', label: 'Drag', mode: Modes.Drag, title: 'Pan the world view by dragging (middle-click drags in any mode)' },
];

const WorldControlsTab: React.FC<WorldControlsTabProps> = ({ engine }) => {

  const envController = engine?.env?.controller;
  const activeMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  const [petriDish, setPetriDish] = useState<boolean>(WorldConfig.petri_dish);

  const handlePetriToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const on = e.target.checked;
    WorldConfig.petri_dish = on;
    setPetriDish(on);
    if (!engine) return;
    if (on) engine.env.buildPetriDish();
    else engine.env.clearWalls();
    engine.emitChange(true);
  };

  const setMode = (mode: number) => {
    if (envController) {
      envController.mode = mode;
      engine?.emitChange(true);
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
        <button id="reset-env" title="Remove every organism and start the world over" onClick={handleClearEnv}>Clear Environment</button>
      </div>

      <h4>Tools</h4>
      <div className={styles.buttonGroup}>
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            className={`env-mode-btn ${activeMode === tool.mode ? styles.active : ''}`}
            id={tool.id}
            title={tool.title}
            onClick={() => setMode(tool.mode)}
          >
            {tool.label}
          </button>
        ))}
        <button id="clear-radiation" title="Remove all radiation zones from the world" onClick={() => {
          if (engine) engine.env.radiation_map.clear();
        }}>Clear Radiation</button>
      </div>

      <h4>Environment Generator</h4>
      <div className={styles.buttonGroup}>
        <button id="randomize-walls-btn" title="Generate organic wall shapes across the world using Perlin noise" onClick={() => engine?.env?.controller?.randomizeWalls()}>Randomize Walls</button>
      </div>
      <label
        style={{ flexDirection: 'row', alignItems: 'center', gap: '6px', marginTop: '8px' }}
        title="Enclose the world in a circular dish of indestructible glass (turning it off removes all walls)"
      >
        <input type="checkbox" id="petri-dish-toggle" checked={petriDish} onChange={handlePetriToggle} />
        Petri dish world
      </label>
    </div>
  );
};

export default WorldControlsTab;
