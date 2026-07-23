import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import WorldConfig from '../WorldConfig';
import Notifier from '../Utils/Notifier';
import PixelSlider from './PixelSlider';

interface HudToolPaletteProps {
  engine: Engine | null;
}

// The world paint tools, lifted out of the World Controls modal so they live
// as an always-visible palette next to the world. Icons mirror the click-hint
// bar; titles keep the hotkeys discoverable. Sample leads the group so picking
// an organism from the world sits alongside the tools that reshape it.
const TOOLS = [
  { id: 'tool-select', label: 'Sample', iconClass: 'fa-eye-dropper', mode: Modes.Select, title: 'Take a sample — pick an organism from the world to examine it in the Organism Lab. Hotkey: Z' },
  { id: 'food', label: 'Food', iconClass: 'fa-drumstick-bite', mode: Modes.FoodDrop, title: 'Paint food onto the world; organisms eat it to survive and reproduce. Hotkey: F' },
  { id: 'wall', label: 'Wall', iconClass: 'fa-cube', mode: Modes.WallDrop, title: 'Paint walls that block movement (killers and explosions can destroy them). Hotkey: D' },
  { id: 'invincible-wall', label: 'Glass', iconClass: 'fa-gem', mode: Modes.InvincibleWallDrop, title: 'Paint permanent walls that nothing can destroy' },
  { id: 'radiation-drop', label: 'Rad', iconClass: 'fa-radiation', mode: Modes.RadiationDrop, title: 'Paint radiation zones that raise mutation rates for organisms inside. Hotkey: R' },
  { id: 'seed-life', label: 'Life', iconClass: 'fa-seedling', mode: Modes.SeedLife, title: 'Paint scattered random organisms within the brush (right-click clears them). Hotkey: L' },
  { id: 'kill', label: 'Kill', iconClass: 'fa-skull', mode: Modes.ClickKill, title: 'Kill organisms under the brush. Hotkey: G' },
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

  // One-shot terrain actions: unlike the tools above these fire immediately
  // rather than arming a mode, so they render as a separate row and repaint
  // the world themselves.
  const randomizeWalls = () => {
    if (!engine) return;
    engine.env.controller.randomizeWalls();
    engine.emitChange(true);
    Notifier.notify('Random walls generated');
  };

  const clearWalls = () => {
    if (!engine) return;
    engine.env.clearWalls();
    engine.emitChange(true);
    Notifier.notify('Walls cleared');
  };

  const clearRadiation = () => {
    if (!engine) return;
    engine.env.radiation_map.clear();
    engine.env.renderFull();
    engine.emitChange(true);
    Notifier.notify('Radiation cleared');
  };

  // Wipe every organism but keep the terrain. reset(false) empties the world
  // without reseeding, so unlike the Kill brush it clears the whole population
  // at once and unlike New Game it leaves your walls in place.
  const clearLife = () => {
    if (!engine) return;
    if (!window.confirm('Remove every organism? Walls are kept.')) return;
    engine.env.reset(false);
    engine.emitChange(true);
    Notifier.notify('All organisms cleared');
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
      <label className={styles.toolPaletteBrush} title="Size of the brush for food, walls, radiation, life and killing">
        <span className={styles.toolPaletteBrushLabel}>Brush</span>
        <PixelSlider
          id="brush-slider"
          min={0}
          max={15}
          value={brushSize}
          onChange={e => setBrush(parseInt(e.target.value))}
        />
        <span className={styles.toolPaletteBrushValue}>Radius: {brushSize}</span>
      </label>
      <div className={styles.toolPaletteActions}>
        <button className={styles.toolPaletteAction} id="randomize-walls-btn" title="Generate organic wall shapes using Perlin noise" onClick={randomizeWalls}>
          Random Walls
        </button>
        <button className={styles.toolPaletteAction} id="clear-walls" title="Remove every wall in the world. Hotkey: B" onClick={clearWalls}>
          Clear Walls
        </button>
        <button className={styles.toolPaletteAction} id="clear-radiation" title="Remove all radiation zones" onClick={clearRadiation}>
          Clear Radiation
        </button>
        <button className={styles.toolPaletteAction} id="clear-life" title="Wipe every organism and start from an empty world (walls are kept)" onClick={clearLife}>
          Clear Life
        </button>
      </div>
    </div>
  );
};

export default HudToolPalette;
