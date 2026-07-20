import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/App.module.css';
import type { EngineAPI } from '../types/engine';

import Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import Notifier from '../Utils/Notifier';
import useEngineValue from './useEngineValue';

// HUD regions
import HudTopLeft from './HudTopLeft';
import HudTopCenter from './HudTopCenter';
import HudTopRight from './HudTopRight';
import HudBottomBar from './HudBottomBar';
import HudPanel from './HudPanel';
import HudNotifications from './HudNotifications';
import EditorDock from './EditorDock';

// Tab content
import SaveTab from './Tabs/SaveTab';
import WorldControlsTab from './Tabs/WorldControlsTab';
import EvolutionControlsTab from './Tabs/EvolutionControlsTab';
import StatsTab from './Tabs/StatsTab';

const PANEL_TITLES: Record<string, string> = {
  save: 'SAVE / LOAD',
  rules: 'RULES',
  environment: 'ENVIRONMENT',
  stats: 'STATS',
};

const App: React.FC = () => {
  const [engine, setEngine] = useState<EngineAPI | null>(null);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const envRef = useRef<HTMLDivElement>(null);
  const envCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Refs are populated by the time effects run, so the engine can take the
    // world canvas directly instead of looking elements up by id.
    const newEngine: EngineAPI = new Engine({
      env_canvas: envCanvasRef.current!,
      env_container: envRef.current!,
    });
    (window as any).engine = newEngine;
    newEngine.start(60);
    setEngine(newEngine);

    return () => newEngine.dispose();
  }, []);

  // Escape backs out one layer at a time: armed world tool, then popup, then dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const envController = engine?.env?.controller;
      if (envController && (envController.mode === Modes.Clone || envController.mode === Modes.Select)) {
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
  }, [engine, activePanel, editorOpen]);

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

  const handleToolbarClick = (item: string) => {
    if (item === 'edit') {
      setEditorOpen(open => !open);
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
        return <SaveTab engine={engine} />;
      case 'rules':
        return <EvolutionControlsTab engine={engine} />;
      case 'environment':
        return <WorldControlsTab engine={engine} />;
      case 'stats':
        return <StatsTab engine={engine} />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.appContainer} data-engine-ready={engine ? "true" : "false"}>
      <div id="env" ref={envRef} className={styles.envArea}>
        <canvas id="env-canvas" ref={envCanvasRef}></canvas>
      </div>

      {/* HUD Regions */}
      <HudTopLeft engine={engine} />
      <HudTopCenter engine={engine} />
      <HudTopRight engine={engine} />
      <HudBottomBar
        engine={engine}
        activePanel={activePanel}
        selectArmed={selectArmed}
        editorOpen={editorOpen}
        onItemClick={handleToolbarClick}
      />
      <HudNotifications />

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
      {editorOpen && <EditorDock engine={engine} onClose={() => setEditorOpen(false)} />}
    </div>
  );
};

export default App;
