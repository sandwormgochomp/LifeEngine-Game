import React, { useEffect, useState, useRef } from 'react';
import styles from './styles/App.module.css';
import hudStyles from './styles/Hud.module.css';

// Using @ts-ignore for now since Engine is JS
// @ts-ignore
import Engine from '../Engine';

// HUD regions
import HudTopLeft from './HudTopLeft';
import HudTopCenter from './HudTopCenter';
import HudTopRight from './HudTopRight';
import HudBottomBar from './HudBottomBar';
import HudPanel from './HudPanel';

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
  const [engine, setEngine] = useState<any>(null);
  const [activePanel, setActivePanel] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the next tick to ensure canvas elements are mounted
    let newEngine: any = null;
    const timer = setTimeout(() => {
      newEngine = new Engine();
      (window as any).engine = newEngine;
      newEngine.start(60);
      setEngine(newEngine);
    }, 0);

    return () => {
      clearTimeout(timer);
      if (newEngine) newEngine.dispose();
    };
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

  // Render non-persistent panel content (panels that can mount/unmount freely)
  const renderDynamicPanelContent = () => {
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
      default:
        return null;
    }
  };

  // Check if the active panel is one of the "persistent" ones (editor/stats)
  // that must always stay mounted
  const isDynamicPanel = activePanel && !['edit', 'stats'].includes(activePanel);

  return (
    <div className={styles.appContainer} data-engine-ready={engine ? "true" : "false"}>
      <div id="env" className={styles.envArea}>
        <canvas id="env-canvas"></canvas>
      </div>
      
      {/* HUD Regions */}
      <HudTopLeft engine={engine} />
      <HudTopCenter engine={engine} />
      <HudTopRight engine={engine} />
      <HudBottomBar activePanel={activePanel} onPanelToggle={handlePanelToggle} />

      {/* Dynamic panels (select, print, rules, environment) — mount/unmount */}
      {isDynamicPanel && (
        <HudPanel 
          title={PANEL_TITLES[activePanel!] || activePanel!.toUpperCase()} 
          onClose={() => setActivePanel(null)}
        >
          {renderDynamicPanelContent()}
        </HudPanel>
      )}

      {/* 
        Editor panel — always rendered to keep canvas in DOM for OrganismEditor.
        Hidden via display:none when not active.
      */}
      <div style={{ display: activePanel === 'edit' ? 'block' : 'none' }}>
        <HudPanel title="EDIT" onClose={() => setActivePanel(null)}>
          <EditorTab engine={engine} />
        </HudPanel>
      </div>

      {/* 
        Stats panel — always rendered to keep chartContainer in DOM.
        Hidden via display:none when not active.
      */}
      <div style={{ display: activePanel === 'stats' ? 'block' : 'none' }}>
        <HudPanel title="STATS" onClose={() => setActivePanel(null)}>
          <StatsTab engine={engine} active={activePanel === 'stats'} />
        </HudPanel>
      </div>
    </div>
  );
};

export default App;
