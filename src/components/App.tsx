import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/App.module.css';
import type { EngineAPI } from '../types/engine';

import Engine from '../Engine';

// HUD regions
import HudTopLeft from './HudTopLeft';
import HudTopCenter from './HudTopCenter';
import HudTopRight from './HudTopRight';
import HudBottomBar from './HudBottomBar';
import HudPanel from './HudPanel';
import HudNotifications from './HudNotifications';

// Tab content
import EditorTab from './Tabs/EditorTab';
import WorldControlsTab from './Tabs/WorldControlsTab';
import EvolutionControlsTab from './Tabs/EvolutionControlsTab';
import StatsTab from './Tabs/StatsTab';

const PANEL_TITLES: Record<string, string> = {
  select: 'SELECT',
  print: 'PRINT',
  edit: 'EDIT',
  rules: 'RULES',
  environment: 'ENVIRONMENT',
  stats: 'STATS',
};

const App: React.FC = () => {
  const [engine, setEngine] = useState<EngineAPI | null>(null);
  const [activePanel, setActivePanel] = useState<string | null>(null);
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

  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePanel) {
        setActivePanel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePanel]);

  const handlePanelToggle = (panel: string) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'select':
        return (
          <div>
            <h3>Select Mode</h3>
            <p>Click on organisms in the world to select and inspect them.</p>
            <p>Selected organisms can be loaded into the editor for modification.</p>
          </div>
        );
      case 'print':
        return (
          <div>
            <h3>Print</h3>
            <p>Print functionality — save a snapshot of the current world state.</p>
          </div>
        );
      case 'rules':
        return <EvolutionControlsTab engine={engine} />;
      case 'environment':
        return <WorldControlsTab engine={engine} />;
      case 'edit':
        return <EditorTab engine={engine} />;
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
      <HudBottomBar activePanel={activePanel} onPanelToggle={handlePanelToggle} />
      <HudNotifications />

      {/* All panels mount on open and unmount on close; the editor and stats
          tabs attach their canvas/chart container to the engine while mounted */}
      {activePanel && (
        <HudPanel
          title={PANEL_TITLES[activePanel] || activePanel.toUpperCase()}
          onClose={() => setActivePanel(null)}
        >
          {renderPanelContent()}
        </HudPanel>
      )}
    </div>
  );
};

export default App;
