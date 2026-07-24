import React, { useState } from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import WorldConfig from '../WorldConfig';
import Notifier from '../Utils/Notifier';
import PixelSlider from './PixelSlider';
import PredatorModal from './PredatorModal';
import type { PredatorSpecies } from '../Organism/Predators';

interface HudToolPaletteProps {
  engine: Engine | null;
}

// An arming tool: clicking it sets the controller mode; the world canvas then
// interprets clicks/drags in that mode. Ids are kept stable across the tab
// reorg because the tests and hotkey bar address the buttons by them.
interface Tool {
  id: string;
  label: string;
  iconClass: string;
  mode: number;
  title: string;
}

/* A one-shot action: fires immediately rather than arming a mode. `soon` marks
   a scaffolded event whose logic isn't wired yet — rendered disabled.

   `opens` is the exception to "fires immediately": the action opens a picker
   and what the player chooses there arms a world tool. `armsMode` names the
   mode that ends up armed, so the button and its tab can show as active for
   the same reason a Tool does. */
interface Action {
  id: string;
  label: string;
  title: string;
  run?: (engine: Engine) => void;
  opens?: 'predators';
  armsMode?: number;
  soon?: boolean;
}

interface Tab {
  id: string;
  label: string;
  title: string;
  tools: Tool[];
  actions: Action[];
}

// Wipe every organism but keep the terrain. reset(false) empties the world
// without reseeding, so unlike the Kill brush it clears the whole population at
// once and unlike New Game it leaves your walls in place.
const clearLife = (engine: Engine) => {
  if (!window.confirm('Remove every organism? Walls are kept.')) return;
  engine.env.reset(false);
  Notifier.notify('All organisms cleared');
};

// Tools and actions grouped by category. Terrain shapes the environment
// substrate, Life manipulates organisms, Events are the dramatic global
// happenings — see concepts/proposals/07-world-events.
const TABS: Tab[] = [
  {
    id: 'terrain',
    label: 'Terrain',
    title: 'Shape the environment: food, walls, glass and radiation',
    tools: [
      { id: 'food', label: 'Food', iconClass: 'fa-drumstick-bite', mode: Modes.FoodDrop, title: 'Paint food onto the world; organisms eat it to survive and reproduce. Hotkey: F' },
      { id: 'wall', label: 'Wall', iconClass: 'fa-cube', mode: Modes.WallDrop, title: 'Paint walls that block movement (killers and explosions can destroy them). Hotkey: D' },
      { id: 'invincible-wall', label: 'Glass', iconClass: 'fa-gem', mode: Modes.InvincibleWallDrop, title: 'Paint permanent walls that nothing can destroy' },
      { id: 'radiation-drop', label: 'Rad', iconClass: 'fa-radiation', mode: Modes.RadiationDrop, title: 'Paint radiation zones that raise mutation rates for organisms inside. Hotkey: R' },
    ],
    actions: [
      { id: 'randomize-walls-btn', label: 'Random Walls', title: 'Generate organic wall shapes using Perlin noise', run: e => { e.env.controller.randomizeWalls(); Notifier.notify('Random walls generated'); } },
      { id: 'clear-walls', label: 'Clear Walls', title: 'Remove every wall in the world (the petri dish stays). Hotkey: B', run: e => { e.env.clearWalls(); Notifier.notify('Walls cleared'); } },
      { id: 'clear-radiation', label: 'Clear Radiation', title: 'Remove all radiation zones', run: e => { e.env.radiation_map.clear(); e.env.renderFull(); Notifier.notify('Radiation cleared'); } },
    ],
  },
  {
    id: 'life',
    label: 'Life',
    title: 'Work with organisms: sample, seed and kill',
    tools: [
      { id: 'tool-select', label: 'Sample', iconClass: 'fa-eye-dropper', mode: Modes.Select, title: 'Take a sample — pick an organism from the world to examine it in the Organism Lab. Hotkey: Z' },
      { id: 'seed-life', label: 'Seed', iconClass: 'fa-seedling', mode: Modes.SeedLife, title: 'Paint scattered random organisms within the brush (right-click clears them). Hotkey: L' },
      { id: 'kill', label: 'Kill', iconClass: 'fa-skull', mode: Modes.ClickKill, title: 'Kill organisms under the brush. Hotkey: G' },
    ],
    actions: [
      { id: 'clear-life', label: 'Clear Life', title: 'Wipe every organism and start from an empty world (walls are kept)', run: clearLife },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    title: 'Punctuate the equilibrium: cataclysms, blooms and invasions',
    tools: [
      { id: 'event-meteor', label: 'Meteor', iconClass: 'fa-meteor', mode: Modes.MeteorStrike, title: 'Click the world to call down a meteor: it streaks in, and everything in the blast radius dies with the crater strewn with food. Brush sets the radius.' },
    ],
    actions: [
      { id: 'event-bloom', label: 'Bloom', title: 'A burst of fertility: food production spikes worldwide for a while, then fades.', run: e => e.env.triggerBloom() },
      { id: 'event-iceage', label: 'Ice Age', title: 'Coming soon: a long food crash that culls all but the most efficient forms.', soon: true },
      { id: 'event-radstorm', label: 'Rad Storm', title: 'Coming soon: a moving radiation front that makes evolution run hot along its edge.', soon: true },
      { id: 'event-predator', label: 'Predator', title: 'Release an invasive hunter: pick one from the bestiary, then click the world to drop its founding pack.', opens: 'predators', armsMode: Modes.ReleasePredator },
    ],
  },
];

const HudToolPalette: React.FC<HudToolPaletteProps> = ({ engine }) => {
  const [activeTabId, setActiveTabId] = useState<string>('terrain');
  const [predatorsOpen, setPredatorsOpen] = useState(false);
  const activeMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  // brush size lives on WorldConfig; re-read it on every engine change so the
  // slider stays in sync with the hotkeys and the click-hint bar
  const brushSize = useEngineValue(engine, () => WorldConfig.brush_size, WorldConfig.brush_size);

  const activeTab = TABS.find(t => t.id === activeTabId) ?? TABS[0];

  // Clicking a tool arms it; clicking the armed tool again puts it away.
  const toggleMode = (mode: number) => {
    if (!engine) return;
    const controller = engine.env.controller;
    controller.mode = controller.mode === mode ? Modes.None : mode;
    engine.emitChange(true);
  };

  const setBrush = (value: number) => {
    WorldConfig.brush_size = value;
    engine?.emitChange(true);
  };

  const runAction = (action: Action) => {
    if (!engine) return;
    if (action.opens === 'predators') {
      setPredatorsOpen(true);
      return;
    }
    if (!action.run) return;
    action.run(engine);
    engine.emitChange(true);
  };

  /* Picking from the bestiary doesn't release anything: it arms the release
     tool with that species, so the player still chooses where the pack lands.
     Mirrors how Clone arms with an organism (App.tsx's C hotkey). */
  const choosePredator = (predator: PredatorSpecies) => {
    setPredatorsOpen(false);
    if (!engine) return;
    const controller = engine.env.controller;
    controller.pending_predator = predator;
    controller.mode = Modes.ReleasePredator;
    engine.emitChange(true);
    Notifier.notify(`Click in the world to release ${predator.name} · ESC to cancel`);
  };

  // A tab whose tool is currently armed gets a marker, so an armed tool stays
  // discoverable even while a different tab is open.
  const tabHoldsActiveTool = (tab: Tab) =>
    activeMode !== Modes.None && (
      tab.tools.some(t => t.mode === activeMode) ||
      tab.actions.some(a => a.armsMode === activeMode)
    );

  return (
    <div className={styles.toolPalette} data-testid="tool-palette">
      <div className={styles.toolPaletteTabs} role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tool-tab-${tab.id}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            title={tab.title}
            className={`${styles.toolPaletteTab} ${tab.id === activeTabId ? styles.toolPaletteTabActive : ''} ${tabHoldsActiveTool(tab) ? styles.toolPaletteTabArmed : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.toolPaletteGrid}>
        {activeTab.tools.map(tool => (
          <button
            key={tool.id}
            id={tool.id}
            title={tool.title}
            className={`env-mode-btn ${styles.toolPaletteBtn} ${activeMode === tool.mode ? styles.toolPaletteBtnActive : ''}`}
            onClick={() => toggleMode(tool.mode)}
          >
            <i className={`fa-solid ${tool.iconClass} ${styles.toolPaletteIcon}`} />
            <span className={styles.toolPaletteLabel}>{tool.label}</span>
          </button>
        ))}
      </div>

      <label className={styles.toolPaletteBrush} title="Size of the brush for food, walls, radiation, life, killing and the meteor blast">
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

      {activeTab.actions.length > 0 && (
        <div className={styles.toolPaletteActions}>
          {activeTab.actions.map(action => (
            <button
              key={action.id}
              id={action.id}
              title={action.title}
              disabled={action.soon}
              className={`${styles.toolPaletteAction} ${action.soon ? styles.toolPaletteActionSoon : ''} ${action.armsMode !== undefined && action.armsMode === activeMode ? styles.toolPaletteActionArmed : ''}`}
              onClick={() => runAction(action)}
            >
              {action.label}
              {action.soon && <span className={styles.toolPaletteSoonBadge}>soon</span>}
            </button>
          ))}
        </div>
      )}

      {predatorsOpen && (
        <PredatorModal onClose={() => setPredatorsOpen(false)} onChoose={choosePredator} />
      )}
    </div>
  );
};

export default HudToolPalette;
