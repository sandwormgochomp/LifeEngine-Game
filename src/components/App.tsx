import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/App.module.css';
import Engine from '../Engine';
import FossilRecord, { type FossilRecordType } from '../Stats/FossilRecord';
import Narrator from '../Stats/Narrator';
import Perf from '../Stats/Perf';
import { generateOrganismName } from '../Utils/NameGenerator';
import type { CellCountMap } from '../Stats/Species';
import Modes from '../Controllers/ControlModes';
import Notifier from '../Utils/Notifier';
import * as FirstRun from '../Utils/FirstRun';
import WorldConfig from '../WorldConfig';
import Hyperparams from '../Hyperparameters';
import useEngineValue from './useEngineValue';

// HUD regions
import HudTopLeft from './HudTopLeft';
import HudTopCenter from './HudTopCenter';
import HudTopRight from './HudTopRight';
import HudBottomBar from './HudBottomBar';
import HudToolPalette from './HudToolPalette';
import HudPanel from './HudPanel';
import HudNotifications from './HudNotifications';
import EditorDock from './EditorDock';
import LifeformsModal from './LifeformsModal';
import PresetsModal from './PresetsModal';
import BrainModal from './BrainModal';
import WorldsModal from './WorldsModal';
import Floaties from './Floaties';
import FirstRunHints from './FirstRunHints';
import RadiationSmoke from './RadiationSmoke';
import FrostOverlay from './FrostOverlay';
import MicroscopeOverlay from './MicroscopeOverlay';
import PerfPanel from './PerfPanel';

// Tab content
import NewGameModal from './NewGameModal';
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
    // The species registry is a module singleton; exposing it alongside the
    // engine lets the Playwright suite (and debugging) reach the fossil record.
    fossilRecord?: FossilRecordType;
    // Pure body-plan -> name function, exposed for the naming test suite.
    generateOrganismName?: (cell_counts: CellCountMap) => string;
    // Timing instrumentation singleton, for the perf test suite and for
    // reading numbers from the console while profiling.
    perf?: typeof Perf;
    /* The evolution controls. Exposed because a few of them have no UI --
       the edible/killable/growable neighbour sets arrive only from a saved
       world's controls -- and the food-adjacency suite has to be able to
       put them somewhere the fast path must refuse. */
    hyperparams?: typeof Hyperparams;
    // The self-narrating-events singleton and the toast bus it emits on, exposed
    // so the narration suite can drive sample()/reset() and spy on the toasts.
    narrator?: typeof Narrator;
    notifier?: typeof Notifier;
  }
}

const PANEL_TITLES: Record<string, string> = {
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
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [headless, setHeadless] = useState(WorldConfig.headless);
  const [perfOpen, setPerfOpen] = useState(false);
  // Derived as a boolean, so this only re-renders App when night actually
  // flips — not on every engine emit.
  const isNight = useEngineValue(engine, e => Boolean(e.env?.is_night), false);
  const [worldsOpen, setWorldsOpen] = useState(false);
  /* Where a notification click aims the two windows it can open. The species
     name survives the picker being closed and reopened by hand, which is
     harmless -- it only decides which card is ringed, and the ring is dropped
     once that species is gone from the list. */
  const [rulesTab, setRulesTab] = useState<'console' | 'fate'>('console');
  const [lifeformsHighlight, setLifeformsHighlight] = useState<string | null>(null);
  // Armed on the first visit ever, for the origin world (see mount effect)
  const [firstRunHints, setFirstRunHints] = useState(false);
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
    window.fossilRecord = FossilRecord;
    window.generateOrganismName = generateOrganismName;
    window.perf = Perf;
    window.hyperparams = Hyperparams;
    window.narrator = Narrator;
    window.notifier = Notifier;
    newEngine.start();
    setEngine(newEngine);

    /* The very first visit narrates the world the engine just built -- the
       origin organism in its dish. Nothing is loaded, replaced or resized. */
    if (FirstRun.shouldRun()) {
      FirstRun.markDone();
      setFirstRunHints(true);
    }

    return () => newEngine.dispose();
  }, []);

  // Escape backs out one layer at a time: armed world tool, then popup, then dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const envController = engine?.env?.controller;
      if (newGameOpen) {
        setNewGameOpen(false);
      } else if (worldsOpen) {
        setWorldsOpen(false);
      } else if (brainOpen) {
        setBrainOpen(false);
      } else if (presetsOpen) {
        setPresetsOpen(false);
      } else if (rulesOpen) {
        setRulesOpen(false);
      } else if (lifeformsOpen) {
        setLifeformsOpen(false);
      } else if (envController && envController.mode !== Modes.None) {
        envController.cancelMode();
      } else if (perfOpen) {
        setPerfOpen(false);
      } else if (activePanel) {
        setActivePanel(null);
      } else if (editorOpen) {
        setEditorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine, activePanel, editorOpen, lifeformsOpen, presetsOpen, rulesOpen, brainOpen, worldsOpen, newGameOpen, perfOpen]);

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
        case 'd': setMode(Modes.WallDrop); break;
        case 'f': setMode(Modes.FoodDrop); break;
        case 'g': setMode(Modes.ClickKill); break;
        case 'r': setMode(Modes.RadiationDrop); break;
        case 'e': setMode(Modes.Eraser); break;
        case 'l': setMode(Modes.SeedLife); break;
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
        case 'p': setPerfOpen(open => !open); break;
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

  // When a canvas click samples an organism into the editor (Select tool or
  // an unarmed left-click), open the dock. The tool stays armed so successive
  // clicks keep sampling; right-click, Escape or re-clicking the palette
  // button put it away. The controller raises pending_editor_open only on the
  // sampling path, so the dock's own Reset / Random / preset loads -- which
  // also swap the editor organism -- don't retrigger this.
  const editorOrganism = useEngineValue(engine, e => e.organism_editor.organism, null);
  useEffect(() => {
    if (!engine || !editorOrganism) return;
    const controller = engine.env.controller;
    if (controller.pending_editor_open) {
      controller.pending_editor_open = false;
      setEditorOpen(true);
      Notifier.notify('Organism loaded into the editor');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOrganism]);

  // Modals are mutually exclusive; the dock and popups can coexist with them
  const closeModals = () => {
    setRulesOpen(false);
    setPresetsOpen(false);
    setLifeformsOpen(false);
    setBrainOpen(false);
    setWorldsOpen(false);
    setNewGameOpen(false);
  };

  const handleNewGame = () => {
    closeModals();
    setNewGameOpen(true);
    setActivePanel(null);
  };

  const handleToolbarClick = (item: string) => {
    if (item === 'new') {
      handleNewGame();
    } else if (item === 'edit') {
      setEditorOpen(open => !open);
      setActivePanel(null);
    } else if (item === 'rules') {
      const next = !rulesOpen;
      closeModals();
      setRulesOpen(next);
      setActivePanel(null);
    } else if (item === 'save') {
      const next = !worldsOpen;
      closeModals();
      setWorldsOpen(next);
      setActivePanel(null);
    } else {
      setActivePanel(prev => prev === item ? null : item);
    }
  };

  /* The three destinations a notification (or an event chip) can send you to.
     Routed through closeModals() like every other modal opener, so a click on
     the log obeys the same one-modal-at-a-time rule as the toolbar. */
  const openLifeforms = (species?: string) => {
    closeModals();
    setLifeformsHighlight(species ?? null);
    setLifeformsOpen(true);
  };

  const openEvolution = (tab: 'console' | 'fate') => {
    closeModals();
    setRulesTab(tab);
    setRulesOpen(true);
  };

  const renderPanelContent = () => {
    switch (activePanel) {
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
      <FrostOverlay engine={engine} />
      <RadiationSmoke engine={engine} />
      <Floaties engine={engine} />
      <MicroscopeOverlay engine={engine} />
      <FirstRunHints engine={engine} active={firstRunHints} />

      {/* HUD Regions */}
      <HudTopLeft engine={engine} headless={headless} onToggleHeadless={toggleHeadless} />
      <HudTopCenter engine={engine} onLifeformsClick={() => setLifeformsOpen(open => !open)} />
      <HudTopRight engine={engine} onTogglePerf={() => setPerfOpen(open => !open)} />
      <HudToolPalette engine={engine} />
      <HudBottomBar
        engine={engine}
        activePanel={activePanel}
        editorOpen={editorOpen}
        rulesOpen={rulesOpen}
        worldsOpen={worldsOpen}
        onItemClick={handleToolbarClick}
      />
      <HudNotifications
        engine={engine}
        onOpenLifeforms={openLifeforms}
        onOpenEvolution={openEvolution}
        onOpenPanel={setActivePanel}
      />

      {/* Mounting the perf panel enables the timing probes; unmounting turns
          them off and clears the buckets (see PerfPanel's mount effect). */}
      {perfOpen && <PerfPanel engine={engine} />}

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
        <EvolutionControlsModal
          engine={engine}
          initialTab={rulesTab}
          onClose={() => setRulesOpen(false)}
        />
      )}

      {newGameOpen && (
        <NewGameModal engine={engine} onClose={() => setNewGameOpen(false)} />
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
          highlight={lifeformsHighlight}
          onClose={() => setLifeformsOpen(false)}
          onOpenInLab={handleOpenInLab}
        />
      )}
    </div>
  );
};

export default App;
