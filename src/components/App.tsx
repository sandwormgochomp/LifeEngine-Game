import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/App.module.css';
import Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import Notifier from '../Utils/Notifier';
import WorldConfig from '../WorldConfig';
import useEngineValue from './useEngineValue';

// HUD regions
import HudTopLeft from './HudTopLeft';
import HudTopCenter from './HudTopCenter';
import HudTopRight from './HudTopRight';
import HudBottomBar from './HudBottomBar';
import HudPanel from './HudPanel';
import HudNotifications from './HudNotifications';
import EditorDock from './EditorDock';
import LifeformsModal from './LifeformsModal';
import PresetsModal from './PresetsModal';
import BrainModal from './BrainModal';
import WorldsModal from './WorldsModal';
import Floaties from './Floaties';
import MicroscopeOverlay from './MicroscopeOverlay';

// Tab content
import SaveTab from './Tabs/SaveTab';
import WorldControlsModal from './WorldControlsModal';
import EvolutionControlsModal from './EvolutionControlsModal';
import StatsTab from './Tabs/StatsTab';
import AboutTab from './Tabs/AboutTab';

// Night is a presentation pass over the world canvases: a blue-shifted dim.
// The container goes flat black to match, since the canvas void color reads
// near-black once the filter is applied and a seam would show at the edges.
const NIGHT_FILTER = 'brightness(0.3) hue-rotate(180deg) saturate(0.5)';
const NIGHT_VOID = '#000000';

/* The Playwright suite drives the simulation through window.engine, so the
   handle is part of the app's contract rather than a debugging leftover.
   Optional because it is only attached once App's mount effect has run. */
declare global {
  interface Window {
    engine?: Engine;
  }
}

const PANEL_TITLES: Record<string, string> = {
  save: 'SAVE / LOAD',
  about: 'ABOUT',
  stats: 'STATS',
};

const App: React.FC = () => {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [lifeformsOpen, setLifeformsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [headless, setHeadless] = useState(WorldConfig.headless);
  // Derived as a boolean, so this only re-renders App when night actually
  // flips — not on every engine emit.
  const isNight = useEngineValue(engine, e => Boolean(e.env?.is_night), false);
  const [worldsOpen, setWorldsOpen] = useState(false);
  const envRef = useRef<HTMLDivElement>(null);
  const envCanvasRef = useRef<HTMLCanvasElement>(null);
  const decoCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Refs are populated by the time effects run, so the engine can take the
    // world canvas directly instead of looking elements up by id.
    const newEngine: Engine = new Engine({
      env_canvas: envCanvasRef.current!,
      env_container: envRef.current!,
      glow_canvas: glowCanvasRef.current!,
      deco_canvas: decoCanvasRef.current!,
    });
    window.engine = newEngine;
    newEngine.start();
    setEngine(newEngine);

    return () => newEngine.dispose();
  }, []);

  // Escape backs out one layer at a time: armed world tool, then popup, then dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const envController = engine?.env?.controller;
      if (worldsOpen) {
        setWorldsOpen(false);
      } else if (brainOpen) {
        setBrainOpen(false);
      } else if (presetsOpen) {
        setPresetsOpen(false);
      } else if (rulesOpen) {
        setRulesOpen(false);
      } else if (worldOpen) {
        setWorldOpen(false);
      } else if (lifeformsOpen) {
        setLifeformsOpen(false);
      } else if (envController && (envController.mode === Modes.Clone || envController.mode === Modes.Select)) {
        envController.mode = Modes.None;
        envController.org_to_clone = null;
        engine.emitChange(true);
      } else if (activePanel) {
        setActivePanel(null);
      } else if (editorOpen) {
        setEditorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine, activePanel, editorOpen, lifeformsOpen, presetsOpen, rulesOpen, worldOpen, brainOpen, worldsOpen]);

  // Headless skips all drawing so the simulation runs far faster; repaint
  // everything on the way back so the canvas isn't left stale.
  const toggleHeadless = () => {
    const next = !WorldConfig.headless;
    WorldConfig.headless = next;
    setHeadless(next);
    if (!next) engine?.env?.renderFull();
    engine?.emitChange(true);
  };

  // Single-key hotkeys from the original control panel. Suppressed while a
  // text field or dropdown has focus so typing a species name or setting a
  // number never fires a tool.
  useEffect(() => {
    const setMode = (mode: number) => {
      if (!engine) return;
      engine.env.controller.mode = mode;
      engine.emitChange(true);
    };

    const handleHotkey = (e: KeyboardEvent) => {
      if (!engine || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          engine.toggleRunning();
          break;
        case 'a': engine.env.controller.resetView(); break;
        case 's': setMode(Modes.Drag); break;
        case 'd': setMode(Modes.WallDrop); break;
        case 'f': setMode(Modes.FoodDrop); break;
        case 'g': setMode(Modes.ClickKill); break;
        case 'r': setMode(Modes.RadiationDrop); break;
        case 'h': toggleHeadless(); break;
        case 'b':
          engine.env.clearWalls();
          engine.emitChange(true);
          Notifier.notify('Walls cleared');
          break;
        case 'z':
          setMode(engine.env.controller.mode === Modes.Select ? Modes.None : Modes.Select);
          break;
        case 'x': setEditorOpen(open => !open); break;
        case 'c':
          engine.env.controller.org_to_clone = engine.organism_editor.organism;
          setMode(Modes.Clone);
          Notifier.notify('Click in the world to place · ESC to cancel');
          break;
      }
    };

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, headless]);

  // Shared by both pickers. Presets ship without a species name, so fall back
  // to the label the user picked.
  const handleOpenInLab = (raw: unknown, name: string) => {
    if (!engine) return;
    /* Parsed from a preset file or built from a fossil record entry, so its
       shape is not known statically. `org` is a type-only view naming just the
       two members probed here; loadRawOrg still receives the raw value. */
    const org = raw as { anatomy?: { cells?: unknown[] }; species_name?: string } | null | undefined;
    if (!org?.anatomy?.cells?.length) {
      Notifier.notify('Not a valid organism');
      return;
    }
    engine.organism_editor.loadRawOrg(raw);
    if (!org.species_name) engine.organism_editor.renameSpecies(name);
    engine.emitChange(true);
    setLifeformsOpen(false);
    setPresetsOpen(false);
    setEditorOpen(true);
    Notifier.notify(`Loaded ${name} into the lab`);
  };

  // When an organism is picked from the world in Select mode, drop it into
  // the editor: open the dock and disarm the tool. The organism reference
  // changes exactly when a new organism is loaded into the editor.
  const editorOrganism = useEngineValue(engine, e => e.organism_editor.organism, null);
  useEffect(() => {
    if (!engine || !editorOrganism) return;
    if (engine.env.controller.mode === Modes.Select) {
      engine.env.controller.mode = Modes.None;
      engine.emitChange(true);
      setEditorOpen(true);
      Notifier.notify('Organism loaded into the editor');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOrganism]);

  const selectArmed = useEngineValue(engine, e => e.env.controller.mode === Modes.Select, false);

  // Modals are mutually exclusive; the dock and popups can coexist with them
  const closeModals = () => {
    setRulesOpen(false);
    setWorldOpen(false);
    setPresetsOpen(false);
    setLifeformsOpen(false);
    setBrainOpen(false);
    setWorldsOpen(false);
  };

  const handleToolbarClick = (item: string) => {
    if (item === 'edit') {
      setEditorOpen(open => !open);
      setActivePanel(null);
    } else if (item === 'rules') {
      const next = !rulesOpen;
      closeModals();
      setRulesOpen(next);
      setActivePanel(null);
    } else if (item === 'environment') {
      const next = !worldOpen;
      closeModals();
      setWorldOpen(next);
      setActivePanel(null);
    } else if (item === 'select') {
      if (!engine) return;
      engine.env.controller.mode = selectArmed ? Modes.None : Modes.Select;
      engine.emitChange(true);
      if (!selectArmed)
        Notifier.notify('Click an organism in the world to load it');
    } else {
      setActivePanel(prev => prev === item ? null : item);
    }
  };

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'save':
        return <SaveTab engine={engine} onBrowseWorlds={() => setWorldsOpen(true)} />;
      case 'stats':
        return <StatsTab engine={engine} />;
      case 'about':
        return <AboutTab />;
      default:
        return null;
    }
  };

  const nightStyle: React.CSSProperties = { filter: isNight ? NIGHT_FILTER : undefined };

  return (
    <div className={styles.appContainer} data-engine-ready={engine ? "true" : "false"}>
      <div
        id="env"
        ref={envRef}
        className={styles.envArea}
        style={{ backgroundColor: isNight ? NIGHT_VOID : undefined }}
      >
        <canvas id="env-canvas" ref={envCanvasRef} style={nightStyle}></canvas>
        <canvas id="env-deco-canvas" ref={decoCanvasRef} style={nightStyle}></canvas>
        <canvas id="env-glow-canvas" ref={glowCanvasRef} style={nightStyle}></canvas>
      </div>
      <Floaties engine={engine} />
      <MicroscopeOverlay engine={engine} />

      {/* HUD Regions */}
      <HudTopLeft engine={engine} headless={headless} onToggleHeadless={toggleHeadless} />
      <HudTopCenter engine={engine} onLifeformsClick={() => setLifeformsOpen(open => !open)} />
      <HudTopRight engine={engine} />
      <HudBottomBar
        engine={engine}
        activePanel={activePanel}
        selectArmed={selectArmed}
        editorOpen={editorOpen}
        rulesOpen={rulesOpen}
        worldOpen={worldOpen}
        onItemClick={handleToolbarClick}
      />
      <HudNotifications />

      {headless && (
        <div className={styles.headlessNotice} data-testid="headless-notice" onClick={toggleHeadless} title="Click to resume rendering">
          <i className="fa-solid fa-eye-slash" />
          <span>RENDERING OFF</span>
        </div>
      )}

      {/* Popup panels mount on open and unmount on close */}
      {activePanel && (
        <HudPanel
          title={PANEL_TITLES[activePanel] || activePanel.toUpperCase()}
          onClose={() => setActivePanel(null)}
        >
          {renderPanelContent()}
        </HudPanel>
      )}

      {/* The organism editor lives in a side dock so the world stays visible */}
      {editorOpen && (
        <EditorDock
          engine={engine}
          onClose={() => setEditorOpen(false)}
          onOpenPresets={() => setPresetsOpen(true)}
          onOpenBrain={() => setBrainOpen(true)}
        />
      )}

      {worldsOpen && (
        <WorldsModal engine={engine} onClose={() => setWorldsOpen(false)} />
      )}

      {brainOpen && (
        <BrainModal engine={engine} onClose={() => setBrainOpen(false)} />
      )}

      {rulesOpen && (
        <EvolutionControlsModal engine={engine} onClose={() => setRulesOpen(false)} />
      )}

      {worldOpen && (
        <WorldControlsModal engine={engine} onClose={() => setWorldOpen(false)} />
      )}

      {presetsOpen && (
        <PresetsModal
          onClose={() => setPresetsOpen(false)}
          onOpenInLab={handleOpenInLab}
        />
      )}

      {lifeformsOpen && (
        <LifeformsModal
          engine={engine}
          onClose={() => setLifeformsOpen(false)}
          onOpenInLab={handleOpenInLab}
        />
      )}
    </div>
  );
};

export default App;
