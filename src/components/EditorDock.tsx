import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type { EngineAPI, CellStateAPI } from '../types/engine';
import CellStates from '../Organism/Cell/CellStates';
import Modes from '../Controllers/ControlModes';
import Notifier from '../Utils/Notifier';

interface EditorDockProps {
  engine: EngineAPI | null;
  onClose: () => void;
}

// Short blurbs shown as tooltips on the cell palette
const CELL_INFO: Record<string, string> = {
  mouth: 'Eats adjacent food',
  producer: 'Grows food in nearby empty cells',
  mover: 'Lets the organism move and turn',
  killer: 'Harms organisms it touches',
  armor: 'Blocks killer cells',
  eye: 'Sees ahead to steer movers. Click a placed eye to rotate it',
  healer: 'Repairs damage by spending stored food',
  explosive: 'Explodes on death, harming everything nearby',
  poison: 'Poisons organisms that touch it',
  pheromone: 'Emits a signal other organisms can sense',
  common: 'Plain structural cell',
  parasite: 'Steals food from adjacent organisms',
  chameleon: 'Invisible to eyes',
  shooter: 'Fires at targets the organism sees',
};

// Ability badges derived from which cell types are present
const ABILITY_BADGES: Record<string, string> = {
  mouth: 'EATS',
  producer: 'GROWS FOOD',
  mover: 'MOVES',
  eye: 'SEES',
  killer: 'ATTACKS',
  armor: 'ARMORED',
  healer: 'HEALS',
  explosive: 'EXPLODES',
  poison: 'POISONS',
  parasite: 'STEALS',
  chameleon: 'HIDDEN',
  shooter: 'SHOOTS',
  pheromone: 'SIGNALS',
};

interface Preset {
  name: string;
  value: string;
}

const MouseLeftIcon: React.FC = () => (
  <svg width="11" height="14" viewBox="0 0 12 16" fill="none" style={{ verticalAlign: '-2px', marginRight: '2px' }}>
    <rect x="1" y="1" width="10" height="14" rx="5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1.2" />
    <path d="M 1 6 A 5 5 0 0 1 6 1 L 6 7.5 L 1 7.5 Z" fill="#00FF41" />
    <line x1="6" y1="1" x2="6" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
    <line x1="1" y1="7.5" x2="11" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
  </svg>
);

const MouseRightIcon: React.FC = () => (
  <svg width="11" height="14" viewBox="0 0 12 16" fill="none" style={{ verticalAlign: '-2px', marginRight: '2px' }}>
    <rect x="1" y="1" width="10" height="14" rx="5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1.2" />
    <path d="M 6 1 A 5 5 0 0 1 11 6 L 11 7.5 L 6 7.5 Z" fill="#00FF41" />
    <line x1="6" y1="1" x2="6" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
    <line x1="1" y1="7.5" x2="11" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
  </svg>
);

const EditorDock: React.FC<EditorDockProps> = ({ engine, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<Preset[]>([]);

  const editor = engine?.organism_editor;
  const controller = editor?.controller;

  // Attach the editor canvas to the engine while the dock is mounted
  useEffect(() => {
    const container = containerRef.current;
    if (!editor || !canvasRef.current || !container) return;
    editor.bindCanvas(canvasRef.current, container);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        if (editor.canZoomIn()) {
          editor.zoomIn();
          engine?.emitChange(true);
        }
      } else if (e.deltaY > 0) {
        if (editor.canZoomOut()) {
          editor.zoomOut();
          engine?.emitChange(true);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      editor.releaseCanvas();
    };
  }, [editor, engine]);

  // Load the preset manifest once (same assets dir user creations go in)
  useEffect(() => {
    fetch('assets/organisms/_list.json')
      .then(res => (res.ok ? res.json() : []))
      .then(list => setPresets(Array.isArray(list) ? list : []))
      .catch(() => setPresets([]));
  }, []);

  // All state lives on the engine; emitChange(true) makes edits reflect
  // immediately instead of on the next throttled tick.
  const touch = () => engine?.emitChange(true);

  const tool = useEngineValue(engine, e => e.organism_editor.controller.mode, Modes.Edit);
  const cellTypeName = useEngineValue(engine, e => e.organism_editor.controller.edit_cell_type?.name ?? '', '');
  const paintColor = useEngineValue(engine, e => e.organism_editor.controller.custom_color, '#ff00ff');
  const cellCount = useEngineValue(engine, e => e.organism_editor.organism?.anatomy?.cells?.length || 0, 0);
  const speciesName = useEngineValue(engine, e => e.organism_editor.organism?.species?.name ?? '', '');
  const canUndo = useEngineValue(engine, e => e.organism_editor.canUndo(), false);
  const canRedo = useEngineValue(engine, e => e.organism_editor.canRedo(), false);
  const canZoomIn = useEngineValue(engine, e => e.organism_editor.canZoomIn(), true);
  const canZoomOut = useEngineValue(engine, e => e.organism_editor.canZoomOut(), true);
  const cellSize = useEngineValue(engine, e => e.organism_editor.cell_size, 14);
  const envMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  const abilities = useEngineValue(
    engine,
    e => {
      const present = new Set(e.organism_editor.organism?.anatomy?.cells?.map(c => c.state.name) ?? []);
      return Object.keys(ABILITY_BADGES).filter(name => present.has(name)).join(',');
    },
    ''
  );

  const deployArmed = envMode === Modes.Clone;
  const selectArmed = envMode === Modes.Select;

  const setTool = (mode: number) => {
    if (!controller) return;
    controller.mode = mode;
    touch();
  };

  const selectCellType = (cellState: CellStateAPI) => {
    if (!controller) return;
    controller.edit_cell_type = cellState;
    controller.mode = Modes.Edit;
    touch();
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!controller) return;
    controller.custom_color = e.target.value;
    controller.mode = Modes.Paint;
    touch();
  };

  const handleRename = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor?.renameSpecies(e.target.value);
    touch();
  };

  const run = (fn?: () => void) => () => {
    fn?.();
    touch();
  };

  // Undo/redo shortcuts while the dock is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor || !(e.ctrlKey || e.metaKey)) return;
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
        engine?.emitChange(true);
      } else if (key === 'y') {
        e.preventDefault();
        editor.redo();
        engine?.emitChange(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, engine]);

  const handleSave = () => {
    if (!editor) return;
    const raw = editor.organism.serialize();
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${speciesName || 'organism'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadRaw = (raw: any, label: string) => {
    if (!editor || !raw?.anatomy?.cells?.length) {
      Notifier.notify('Not a valid organism file');
      return;
    }
    editor.loadRawOrg(raw);
    if (!raw.species_name) editor.renameSpecies(label);
    touch();
    Notifier.notify(`Loaded ${raw.species_name || label}`);
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text()
      .then(text => loadRaw(JSON.parse(text), file.name.replace(/\.json$/i, '')))
      .catch(() => Notifier.notify('Not a valid organism file'));
  };

  const handlePresetChosen = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    e.target.value = '';
    if (!value) return;
    const preset = presets.find(p => p.value === value);
    fetch(`assets/organisms/${value}.json`)
      .then(res => res.json())
      .then(raw => loadRaw(raw, preset?.name || value))
      .catch(() => Notifier.notify('Could not load preset'));
  };

  const toggleDeploy = () => {
    if (!engine) return;
    if (deployArmed) {
      engine.env.controller.mode = Modes.None;
    } else {
      engine.env.controller.mode = Modes.Clone;
      engine.env.controller.org_to_clone = engine.organism_editor.organism;
      Notifier.notify('Click in the world to place · ESC to cancel');
    }
    touch();
  };

  const toggleSelect = () => {
    if (!engine) return;
    if (selectArmed) {
      engine.env.controller.mode = Modes.None;
    } else {
      engine.env.controller.mode = Modes.Select;
      Notifier.notify('Click an organism in the world to load it');
    }
    touch();
  };

  return (
    <div className={styles.dockWrap} data-testid="editor-dock">
      {/* Cell palette rail: every type visible at once, no scrolling */}
      <div className={styles.dockRail}>
        {CellStates.living.map((cellState: CellStateAPI) => (
          <button
            key={cellState.name}
            id={cellState.name}
            className={`cell-type ${styles.dockRailBtn} ${tool === Modes.Edit && cellTypeName === cellState.name ? styles.dockCellBtnActive : ''}`}
            title={CELL_INFO[cellState.name] || cellState.name}
            onClick={() => selectCellType(cellState)}
          >
            <span className={styles.dockCellSwatch} style={{ backgroundColor: cellState.color }}></span>
            <span className={styles.dockCellName}>{cellState.name}</span>
          </button>
        ))}
      </div>

      <div className={styles.dock}>
      <div className={styles.panelHeader}>
        <span className={`${styles.panelTitle} ${styles.dockTitle}`}>
          <i className="fa-solid fa-flask" style={{ marginRight: '6px' }}></i>
          ORGANISM LAB
        </span>
        <span className={styles.dockHeaderTools}>
          <button className={styles.dockHeaderBtn} id="save-org" title="Save organism as JSON" onClick={handleSave}>
            <i className="fa-solid fa-download"></i>
          </button>
          <button className={styles.dockHeaderBtn} id="load-org" title="Load organism from a JSON file" onClick={() => fileInputRef.current?.click()}>
            <i className="fa-solid fa-upload"></i>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleFileChosen}
          />
          <select
            id="preset-select"
            className={styles.dockPresetSelect}
            defaultValue=""
            onChange={handlePresetChosen}
            title="Load a bundled preset organism"
          >
            <option value="" disabled>Presets…</option>
            {presets.map(p => (
              <option key={p.value} value={p.value}>{p.name}</option>
            ))}
          </select>
        </span>
        <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Canvas stays pinned while the controls below scroll */}
      <div className={styles.dockCanvasSection}>
        <div id="editor-env" ref={containerRef} className={styles.dockCanvasBox}>
          <canvas id="editor-canvas" ref={canvasRef}></canvas>
          <div className={styles.dockZoomOverlay}>
            <button id="zoom-out" title="Zoom out" onClick={run(editor?.zoomOut.bind(editor))} disabled={!canZoomOut}>−</button>
            <span className={styles.zoomPixelLabel} title="Cell pixel size">{cellSize}px</span>
            <button id="zoom-in" title="Zoom in" onClick={run(editor?.zoomIn.bind(editor))} disabled={!canZoomIn}>+</button>
            <button id="zoom-fit" title="Fit organism to view" onClick={run(editor?.zoomToFit.bind(editor))}>▣</button>
          </div>
        </div>

        <div className={styles.dockCanvasBar}>
          <span className={styles.dockHint}>
            <MouseLeftIcon /> apply · <MouseRightIcon /> erase
          </span>
        </div>
      </div>

      <div className={`${styles.panelBody} ${styles.dockBody}`}>
        <h4>Tools</h4>
        <div className={styles.buttonGroup}>
          <button
            id="draw-tool"
            className={tool === Modes.Edit ? styles.active : ''}
            title="Place the selected cell type"
            onClick={() => setTool(Modes.Edit)}
          >
            <i className="fa-solid fa-pen"></i> Draw{cellTypeName ? ` · ${cellTypeName}` : ''}
          </button>
          <button
            id="erase-tool"
            className={tool === Modes.Erase ? styles.active : ''}
            title="Remove cells"
            onClick={() => setTool(Modes.Erase)}
          >
            <i className="fa-solid fa-eraser"></i> Erase
          </button>
          <button
            id="paint-tool"
            className={tool === Modes.Paint ? styles.active : ''}
            title="Recolor cells with the chosen color"
            onClick={() => setTool(Modes.Paint)}
          >
            <i className="fa-solid fa-fill-drip"></i> Paint
          </button>
          <input
            type="color"
            id="cell-color-picker"
            title="Paint color"
            value={paintColor}
            onChange={handleColorChange}
          />
        </div>

        <h4>Actions</h4>
        <div className={styles.buttonGroup}>
          <button id="undo-btn" title="Undo (Ctrl+Z)" onClick={run(editor?.undo.bind(editor))} disabled={!canUndo}>
            <i className="fa-solid fa-rotate-left"></i>
          </button>
          <button id="redo-btn" title="Redo (Ctrl+Y)" onClick={run(editor?.redo.bind(editor))} disabled={!canRedo}>
            <i className="fa-solid fa-rotate-right"></i>
          </button>
          <button id="rotate-btn" title="Rotate 90°" onClick={run(editor?.rotateOrganism.bind(editor))}>
            <i className="fa-solid fa-arrows-spin"></i>
          </button>
          <button id="flip-btn" title="Mirror horizontally" onClick={run(editor?.flipOrganism.bind(editor))}>
            <i className="fa-solid fa-left-right"></i>
          </button>
          <button id="clear-editor" title="Reset to a single mouth cell" onClick={run(editor?.clearOrganism.bind(editor))}>
            Clear
          </button>
          <button id="random-btn" title="Generate a random organism" onClick={run(editor?.randomOrganism.bind(editor))}>
            Random
          </button>
        </div>

        <h4>Organism</h4>
        <div id="edit-organism-details" className={styles.dockInfoCard}>
          <input
            id="species-name"
            className={styles.dockNameInput}
            type="text"
            value={speciesName}
            onChange={handleRename}
            spellCheck={false}
            title="Species name"
          />
          <p className="cell-count">Cell count: {cellCount}</p>
          <div className={styles.dockBadges}>
            {abilities.split(',').filter(Boolean).map(name => (
              <span key={name} className={styles.dockBadge}>{ABILITY_BADGES[name]}</span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.dockDeployRow}>
          <button
            id="select-org"
            className={selectArmed ? styles.active : ''}
            title="Pick an organism from the world to edit"
            onClick={toggleSelect}
          >
            <i className="fa-solid fa-arrow-pointer"></i> {selectArmed ? 'Click an organism…' : 'Select from world'}
          </button>
          <button
            id="deploy-org"
            className={deployArmed ? styles.active : ''}
            title="Place copies of this organism in the world"
            onClick={toggleDeploy}
          >
            <i className="fa-solid fa-circle-down"></i> {deployArmed ? 'Click to place…' : 'Deploy to world'}
          </button>
      </div>
      </div>
    </div>
  );
};

export default EditorDock;
