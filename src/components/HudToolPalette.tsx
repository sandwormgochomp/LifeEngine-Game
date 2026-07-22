import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import WorldConfig from '../WorldConfig';

interface HudToolPaletteProps {
  engine: Engine | null;
}

// The world paint tools, lifted out of the World Controls modal so they live
// as an always-visible palette next to the world. Icons mirror the click-hint
// bar; titles keep the hotkeys discoverable.
const TOOLS = [
  { id: 'food', label: 'Food', iconClass: 'fa-drumstick-bite', mode: Modes.FoodDrop, title: 'Paint food onto the world; organisms eat it to survive and reproduce. Hotkey: F' },
  { id: 'wall', label: 'Wall', iconClass: 'fa-cube', mode: Modes.WallDrop, title: 'Paint walls that block movement (killers and explosions can destroy them). Hotkey: D' },
  { id: 'invincible-wall', label: 'Glass', iconClass: 'fa-gem', mode: Modes.InvincibleWallDrop, title: 'Paint permanent walls that nothing can destroy' },
  { id: 'radiation-drop', label: 'Rad', iconClass: 'fa-radiation', mode: Modes.RadiationDrop, title: 'Paint radiation zones that raise mutation rates for organisms inside. Hotkey: R' },
  { id: 'kill', label: 'Kill', iconClass: 'fa-skull', mode: Modes.ClickKill, title: 'Kill organisms under the brush. Hotkey: G' },
  { id: 'drag', label: 'Pan', iconClass: 'fa-up-down-left-right', mode: Modes.Drag, title: 'Pan the world view by dragging (middle-click drags in any mode). Hotkey: S' },
];

const HudToolPalette: React.FC<HudToolPaletteProps> = ({ engine }) => {
  const activeMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  // brush size lives on WorldConfig; re-read it on every engine change so the
  // slider stays in sync with the hotkeys and the click-hint bar
  const brushSize = useEngineValue(engine, () => WorldConfig.brush_size, WorldConfig.brush_size);

  const setMode = (mode: number) => {
    if (!engine) return;
    engine.env.controller.mode = mode;
    engine.emitChange(true);
  };

  const setBrush = (value: number) => {
    WorldConfig.brush_size = value;
    engine?.emitChange(true);
  };

  return (
    <div className={styles.toolPalette} data-testid="tool-palette">
      <span className={styles.toolPaletteTitle}>TOOLS</span>
      <div className={styles.toolPaletteGrid}>
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            id={tool.id}
            title={tool.title}
            className={`env-mode-btn ${styles.toolPaletteBtn} ${activeMode === tool.mode ? styles.toolPaletteBtnActive : ''}`}
            onClick={() => setMode(tool.mode)}
          >
            <i className={`fa-solid ${tool.iconClass} ${styles.toolPaletteIcon}`} />
            <span className={styles.toolPaletteLabel}>{tool.label}</span>
          </button>
        ))}
      </div>
      <label className={styles.toolPaletteBrush} title="Size of the brush for food, walls, radiation and killing">
        <span className={styles.toolPaletteBrushLabel}>Brush</span>
        <input
          type="range"
          id="brush-slider"
          min={0}
          max={15}
          value={brushSize}
          onChange={e => setBrush(parseInt(e.target.value))}
        />
        <span className={styles.toolPaletteBrushValue}>{brushSize * 2 + 1}×{brushSize * 2 + 1}</span>
      </label>
    </div>
  );
};

export default HudToolPalette;
