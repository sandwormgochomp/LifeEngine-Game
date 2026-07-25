import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import type { CellState, LivingCellName } from '../Organism/Cell/CellStates';
import CellStates from '../Organism/Cell/CellStates';
import Modes from '../Controllers/ControlModes';
import Notifier from '../Utils/Notifier';
import { CELL_INFO } from './cellInfo';
import CellSwatch from './CellSwatch';
import CellHoverPreview from './CellHoverPreview';
import PixelSlider from './PixelSlider';

interface EditorDockProps {
  engine: Engine | null;
  onClose: () => void;
  onOpenPresets: () => void;
  onOpenBrain: () => void;
}


// Ability badges derived from which cell types are present
/* Keyed by living cell-state name. Partial because `common` carries no
   badge. Typing the keys means a badge for a cell type that does not
   exist fails to compile, rather than silently never rendering. */
const ABILITY_BADGES: Partial<Record<LivingCellName, string>> = {
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

const EditorDock: React.FC<EditorDockProps> = ({ engine, onClose, onOpenPresets, onOpenBrain }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = engine?.organism_editor;
  const controller = editor?.controller;

  // The cell type whose live preview is showing, plus its button's rect so the
  // floating popover can anchor to it. Cleared on mouseleave.
  const [hoveredCell, setHoveredCell] = useState<{ name: LivingCellName; anchor: DOMRect } | null>(null);

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

  // All state lives on the engine; emitChange(true) makes edits reflect
  // immediately instead of on the next throttled tick.
  const touch = () => engine?.emitChange(true);

  const tool = useEngineValue(engine, e => e.organism_editor.controller.mode, Modes.Edit);
  const cellTypeName = useEngineValue(engine, e => e.organism_editor.controller.edit_cell_type?.name ?? '', '');
  const paintColor = useEngineValue(engine, e => e.organism_editor.controller.custom_color, '#ff00ff');
  const speciesName = useEngineValue(engine, e => e.organism_editor.organism?.species?.name ?? '', '');
  const canZoomIn = useEngineValue(engine, e => e.organism_editor.canZoomIn(), true);
  const canZoomOut = useEngineValue(engine, e => e.organism_editor.canZoomOut(), true);
  const cellSize = useEngineValue(engine, e => e.organism_editor.cell_size, 14);
  const moveRange = useEngineValue(engine, e => e.organism_editor.organism.move_range, 4);
  const mutability = useEngineValue(engine, e => e.organism_editor.organism.mutability, 5);
  const healerCost = useEngineValue(engine, e => e.organism_editor.organism.healer_food_cost, 1);
  const poisonDuration = useEngineValue(engine, e => e.organism_editor.organism.poison_duration, 10);
  const hasHealer = useEngineValue(engine, e => !!e.organism_editor.organism.anatomy.has_healer, false);
  const hasPoison = useEngineValue(engine, e => !!e.organism_editor.organism.anatomy.has_poison, false);
  const isNatural = useEngineValue(engine, e => e.organism_editor.organism.isNatural(), true);
  const envMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  const abilities = useEngineValue(
    engine,
    e => {
      const present = new Set(e.organism_editor.organism?.anatomy?.cells?.map(c => c.state.name) ?? []);
      return (Object.keys(ABILITY_BADGES) as LivingCellName[])
        .filter(name => present.has(name)).join(',');
    },
    ''
  );

  const deployArmed = envMode === Modes.Clone;

  const setTool = (mode: number) => {
    if (!controller) return;
    controller.mode = mode;
    touch();
  };

  const selectCellType = (cellState: CellState) => {
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

  // Per-organism traits live on the Organism itself; snapshot them onto the
  // editor's undo history like anatomy edits. A slider drag is one stroke:
  // the first change opens it (beginStroke folds the rest in), and releasing
  // the pointer or leaving the control commits it as a single undo entry.
  // undo()/redo() flush an in-flight stroke themselves.
  const setOrgField = (field: 'move_range' | 'mutability' | 'healer_food_cost' | 'poison_duration', value: number) => {
    if (!editor || Number.isNaN(value)) return;
    editor.beginStroke();
    editor.organism[field] = value;
    touch();
  };

  const commitOrgStroke = () => editor?.commitStroke();

  const handleSeedWorld = () => {
    if (!engine) return;
    if (!window.confirm('Clear the world and seed it with this organism?')) return;
    engine.env.reset(false);
    const center = [Math.floor(engine.env.grid_map.cols / 2), Math.floor(engine.env.grid_map.rows / 2)];
    engine.env.controller.dropOrganism(engine.organism_editor.organism, center[0], center[1]);
    engine.emitChange(true);
    Notifier.notify('World seeded with this organism');
  };

  // Undo/redo shortcuts while the dock is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor || !(e.ctrlKey || e.metaKey)) return;
      // Let text fields keep native undo, but sliders and checkboxes shouldn't
      // swallow the editor's own undo shortcut
      const target = e.target as HTMLElement | null;
      const type = (target as HTMLInputElement | null)?.type;
      const typing = target?.tagName === 'TEXTAREA' ||
        (target?.tagName === 'INPUT' && ['text', 'number', 'search', 'email', 'password', 'url'].includes(type ?? ''));
      if (typing) return;
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

  const loadRaw = (raw: unknown, label: string) => {
    /* Parsed out of a file the user picked, so nothing about its shape is known
       statically. `org` is a type-only view naming just the two members this
       function probes; the value handed to loadRawOrg stays the raw one, and
       every access below is optional-chained exactly as it was before. */
    const org = raw as { anatomy?: { cells?: unknown[] }; species_name?: string } | null | undefined;
    if (!editor || !org?.anatomy?.cells?.length) {
      Notifier.notify('Not a valid organism file');
      return;
    }
    editor.loadRawOrg(raw);
    if (!org.species_name) editor.renameSpecies(label);
    touch();
    Notifier.notify(`Loaded ${org.species_name || label}`);
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text()
      .then(text => loadRaw(JSON.parse(text), file.name.replace(/\.json$/i, '')))
      .catch(() => Notifier.notify('Not a valid organism file'));
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

  return (
    <div className={styles.dockWrap} data-testid="editor-dock">
      {/* Live behaviour preview floating beside the hovered palette cell */}
      {hoveredCell && (
        <CellHoverPreview
          name={hoveredCell.name}
          description={CELL_INFO[hoveredCell.name] || hoveredCell.name}
          anchor={hoveredCell.anchor}
        />
      )}
      {/* Cell palette rail. Erase is pinned above the cell list so it stays
          reachable at any window height -- as the last item of a scrolling
          rail it was the first thing to drop below the fold. */}
      <div className={styles.dockRail}>
        <div className={styles.dockRailPinned}>
          <button
            id="eraser-tool"
            className={`${styles.dockRailBtn} ${tool === Modes.Eraser ? styles.dockCellBtnActive : ''}`}
            title="Erase cells (the center cell is protected)"
            onClick={() => setTool(Modes.Eraser)}
          >
            {/* sized to line up with the 18px cell/paint swatches below it */}
            <i className="fa-solid fa-eraser" style={{ color: 'rgba(0, 255, 65, 0.85)', fontSize: '14px', lineHeight: '18px' }} />
            <span className={styles.dockCellName}>erase</span>
          </button>
          <div className={styles.dockRailSep} />
        </div>

        <div className={styles.dockRailScroll}>
          {/* Swatch only, no label: the hover popover already names the cell and
              shows what it does, and dropping 14 labels is what keeps the whole
              palette on screen without scrolling. */}
          {CellStates.living.map((cellState: CellState<LivingCellName>) => (
            <button
              key={cellState.name}
              id={cellState.name}
              className={`cell-type ${styles.dockRailBtn} ${styles.dockRailSwatchBtn} ${tool === Modes.Edit && cellTypeName === cellState.name ? styles.dockCellBtnActive : ''}`}
              title={CELL_INFO[cellState.name] || cellState.name}
              aria-label={cellState.name}
              onClick={() => selectCellType(cellState)}
              onMouseEnter={e => setHoveredCell({ name: cellState.name, anchor: e.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setHoveredCell(prev => (prev?.name === cellState.name ? null : prev))}
            >
              <CellSwatch cellState={cellState} />
            </button>
          ))}

          {/* Paint lives with the cells: pick a color, click cells to recolor.
              A div rather than a button so the color input nested inside stays
              clickable; clicking either the swatch or the label arms Paint. */}
          <div className={styles.dockRailSep} />
          <div
            id="paint-tool"
            className={`${styles.dockRailBtn} ${tool === Modes.Paint ? styles.dockCellBtnActive : ''}`}
            title="Recolor cells with the chosen color"
            onClick={() => setTool(Modes.Paint)}
          >
            <input
              type="color"
              id="cell-color-picker"
              className={styles.dockPaintSwatch}
              title="Paint color"
              value={paintColor}
              onChange={handleColorChange}
            />
            <span className={styles.dockCellName}>paint</span>
          </div>
        </div>
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
          <button
            className={styles.dockHeaderBtn}
            id="open-presets"
            title="Browse bundled preset organisms"
            onClick={onOpenPresets}
          >
            <i className="fa-solid fa-folder-open"></i>
          </button>
        </span>
        <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Canvas stays pinned while the controls below scroll */}
      <div className={styles.dockCanvasSection}>
        <div id="editor-env" ref={containerRef} className={styles.dockCanvasBox}>
          <canvas id="editor-canvas" ref={canvasRef}></canvas>
          {abilities && (
            <div className={styles.dockBadgeOverlay}>
              {/* `abilities` is the ABILITY_BADGES keys joined into a string, so
                  that useEngineValue can compare it by value rather than by array
                  identity; splitting it recovers the same keys. */}
              {(abilities.split(',') as LivingCellName[]).map(name => (
                <span key={name} className={styles.dockBadge}>{ABILITY_BADGES[name]}</span>
              ))}
            </div>
          )}
          <div className={styles.dockZoomOverlay}>
            <button id="zoom-out" title="Zoom out" onClick={run(editor?.zoomOut.bind(editor))} disabled={!canZoomOut}>−</button>
            <span className={styles.zoomPixelLabel} title="Cell pixel size">{cellSize}px</span>
            <button id="zoom-in" title="Zoom in" onClick={run(editor?.zoomIn.bind(editor))} disabled={!canZoomIn}>+</button>
            <button id="zoom-fit" title="Fit organism to view" onClick={run(editor?.zoomToFit.bind(editor))}>▣</button>
          </div>
          <div className={styles.dockToolOverlay}>
            <button id="clear-editor" title="Reset to a single mouth cell" onClick={run(editor?.clearOrganism.bind(editor))}>
              <i className="fa-solid fa-trash-can"></i>
            </button>
            <button id="random-btn" title="Generate a random organism" onClick={run(editor?.randomOrganism.bind(editor))}>
              <i className="fa-solid fa-dice"></i>
            </button>
            <button id="rotate-btn" title="Rotate 90°" onClick={run(editor?.rotateOrganism.bind(editor))}>
              <i className="fa-solid fa-arrows-spin"></i>
            </button>
            <button id="flip-btn" title="Mirror horizontally" onClick={run(editor?.flipOrganism.bind(editor))}>
              <i className="fa-solid fa-left-right"></i>
            </button>
          </div>
          <div className={styles.dockBrainOverlay}>
            <button id="open-brain" title="Edit this organism's brain: what it chases, flees, and does" onClick={onOpenBrain}>
              <i className="fa-solid fa-brain"></i>
            </button>
          </div>
        </div>

        <div className={styles.dockCanvasBar}>
          <span className={styles.dockHint}>
            <MouseLeftIcon /> apply · <MouseRightIcon /> put tool away · ctrl+z undo · ctrl+y redo
          </span>
        </div>
      </div>

      <div className={`${styles.panelBody} ${styles.dockBody}`}>
        <h4>Organism</h4>
        {/* pointerup/keyup/blur close out any slider stroke; commitStroke
            no-ops when no stroke is open */}
        <div
          id="edit-organism-details"
          className={styles.dockInfoCard}
          onPointerUp={commitOrgStroke}
          onKeyUp={commitOrgStroke}
          onBlur={commitOrgStroke}
        >
          <input
            id="species-name"
            className={styles.dockNameInput}
            type="text"
            value={speciesName}
            onChange={handleRename}
            spellCheck={false}
            title="Species name"
          />
          {!isNatural && (
            <p id="unnatural-warning" className={styles.dockWarning} title="This organism has overlapping cells or no center cell, so it could not arise or reproduce naturally">
              <i className="fa-solid fa-biohazard"></i> Unnatural organism
            </p>
          )}
          <label className={styles.ctrlRow} title="Cells to move before randomly changing direction. Overridden by brain decisions.">
            <span className={styles.ctrlLabel}>Move range</span>
            <PixelSlider id="move-range" min={1} max={100} value={moveRange}
              onChange={e => setOrgField('move_range', parseInt(e.target.value))} />
            <span className={styles.ctrlValue}>{moveRange}</span>
          </label>
          <label className={styles.ctrlRow} title="Probability that this organism's offspring mutate">
            <span className={styles.ctrlLabel}>Mutation rate</span>
            <PixelSlider id="mutation-rate" min={0} max={100} value={mutability}
              onChange={e => setOrgField('mutability', parseFloat(e.target.value))} />
            <span className={styles.ctrlValue}>{mutability}</span>
          </label>
          {hasHealer && (
            <label className={styles.ctrlRow} title="Food this organism's healer cells spend to repair 1 damage">
              <span className={styles.ctrlLabel}>Healer food cost</span>
              <PixelSlider id="healer-cost" min={0} max={1000} value={healerCost}
                onChange={e => setOrgField('healer_food_cost', parseFloat(e.target.value))} />
              <span className={styles.ctrlValue}>{healerCost}</span>
            </label>
          )}
          {hasPoison && (
            <label className={styles.ctrlRow} title="How many ticks this organism's poison lasts on its victims">
              <span className={styles.ctrlLabel}>Poison duration</span>
              <PixelSlider id="poison-duration" min={1} max={1000} value={poisonDuration}
                onChange={e => setOrgField('poison_duration', parseInt(e.target.value))} />
              <span className={styles.ctrlValue}>{poisonDuration}</span>
            </label>
          )}
        </div>
      </div>

      <div className={styles.dockDeployRow}>
          <button id="seed-world" title="Clear the world and start it from this organism" onClick={handleSeedWorld}>
            <i className="fa-solid fa-seedling"></i> Seed World
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
