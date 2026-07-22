import React, { useState } from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import WorldConfig from '../WorldConfig';
import type { WorldConfigShape } from '../WorldConfig';
import Notifier from '../Utils/Notifier';

interface WorldControlsModalProps {
  engine: Engine | null;
  onClose: () => void;
}

const WorldControlsModal: React.FC<WorldControlsModalProps> = ({ engine, onClose }) => {
  const resetCount = useEngineValue(engine, e => e.env.reset_count, 0);

  // WorldConfig is a plain module object; mirror the flags we own here
  const [config, setConfig] = useState({
    petri_dish: WorldConfig.petri_dish,
    auto_reset: WorldConfig.auto_reset,
    auto_pause: WorldConfig.auto_pause,
    clear_walls_on_reset: WorldConfig.clear_walls_on_reset,
  });
  const [cellSize, setCellSize] = useState(5);
  const [fillWindow, setFillWindow] = useState(true);
  const [cols, setCols] = useState(100);
  const [rows, setRows] = useState(100);

  // Generic in the key so `value` is the type that flag actually holds
  // (boolean for the toggles) rather than a union
  const setFlag = <K extends keyof typeof config>(key: K, value: WorldConfigShape[K]) => {
    WorldConfig[key] = value;
    setConfig(prev => ({ ...prev, [key]: value }));
    engine?.emitChange(true);
  };

  const handlePetriToggle = (on: boolean) => {
    setFlag('petri_dish', on);
    if (!engine) return;
    if (on) engine.env.buildPetriDish();
    else engine.env.clearWalls();
    engine.emitChange(true);
  };

  const handleResize = () => {
    if (!engine) return;
    if (!window.confirm('Resizing resets the world. Proceed?')) return;
    if (fillWindow) engine.env.resizeFillWindow(cellSize);
    else engine.env.resizeGridColRow(cellSize, cols, rows);
    engine.env.reset(true);
    if (WorldConfig.petri_dish) engine.env.buildPetriDish();
    engine.emitChange(true);
    Notifier.notify('World resized');
  };

  const handleRestart = () => {
    if (!engine) return;
    if (!window.confirm('Restart with a single origin organism?')) return;
    engine.env.reset(true);
    if (WorldConfig.petri_dish) engine.env.buildPetriDish();
    engine.emitChange(true);
    Notifier.notify('Simulation restarted');
  };

  const handleClear = () => {
    if (!engine) return;
    if (!window.confirm('Remove every organism? The world layout is kept.')) return;
    engine.env.reset(false);
    engine.emitChange(true);
    Notifier.notify('All organisms cleared');
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="world-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-earth-americas" style={{ marginRight: '8px' }}></i>
            WORLD CONTROLS
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.ctrlBody}>
          <section className={styles.ctrlGroup}>
            <h4>Terrain</h4>
            <label className={styles.ctrlRow} title="Enclose the world in a circular dish of indestructible glass (turning it off removes all walls)">
              <span className={styles.ctrlLabel}>Petri dish world</span>
              <input type="checkbox" id="petri-dish-toggle" checked={config.petri_dish} onChange={e => handlePetriToggle(e.target.checked)} />
            </label>
            <label className={styles.ctrlRow} title="When on, walls are cleared whenever the environment resets">
              <span className={styles.ctrlLabel}>Clear walls on reset</span>
              <input type="checkbox" id="clear-walls-reset" checked={config.clear_walls_on_reset} onChange={e => setFlag('clear_walls_on_reset', e.target.checked)} />
            </label>
          </section>

          <section className={styles.ctrlGroup}>
            <h4>Grid size</h4>
            <label className={styles.ctrlRow} title="Pixel size of a single cell — smaller cells mean a larger world">
              <span className={styles.ctrlLabel}>Cell size</span>
              <input type="number" id="cell-size" className={styles.ctrlNumber} min={1} max={100} value={cellSize} onChange={e => setCellSize(parseInt(e.target.value) || 1)} />
            </label>
            <label className={styles.ctrlRow} title="Size the grid to fill the browser window">
              <span className={styles.ctrlLabel}>Fill window</span>
              <input type="checkbox" id="fill-window" checked={fillWindow} onChange={e => setFillWindow(e.target.checked)} />
            </label>
            {!fillWindow && (
              <>
                <label className={styles.ctrlRow} title="Number of columns in the grid">
                  <span className={styles.ctrlLabel}>Columns</span>
                  <input type="number" id="col-input" className={styles.ctrlNumber} min={1} value={cols} onChange={e => setCols(parseInt(e.target.value) || 1)} />
                </label>
                <label className={styles.ctrlRow} title="Number of rows in the grid">
                  <span className={styles.ctrlLabel}>Rows</span>
                  <input type="number" id="row-input" className={styles.ctrlNumber} min={1} value={rows} onChange={e => setRows(parseInt(e.target.value) || 1)} />
                </label>
              </>
            )}
            <div className={styles.buttonGroup}>
              <button className={styles.ctrlBtn} id="resize" title="Apply the grid size and restart the world" onClick={handleResize}>
                Resize & Reset
              </button>
            </div>
          </section>

          <section className={styles.ctrlGroup}>
            <h4>Life</h4>
            <div className={styles.buttonGroup}>
              <button className={styles.ctrlBtn} id="reset-env" title="Wipe the world and start again from a single origin organism" onClick={handleRestart}>
                Restart
              </button>
              <button className={styles.ctrlBtn} id="clear-env" title="Remove every organism but keep walls, food and layout" onClick={handleClear}>
                Clear Life
              </button>
            </div>
          </section>

          <section className={styles.ctrlGroup}>
            <h4>On extinction</h4>
            <label className={styles.ctrlRow} title="Automatically restart the simulation when every organism dies">
              <span className={styles.ctrlLabel}>Reset on extinction</span>
              <input type="checkbox" id="auto-reset" checked={config.auto_reset} onChange={e => setFlag('auto_reset', e.target.checked)} />
            </label>
            <label className={styles.ctrlRow} title="Pause instead of resetting when every organism dies (overrides reset on extinction)">
              <span className={styles.ctrlLabel}>Pause on extinction</span>
              <input type="checkbox" id="auto-pause" checked={config.auto_pause} onChange={e => setFlag('auto_pause', e.target.checked)} />
            </label>
            <p id="reset-count" className={styles.ctrlNote}>Auto reset count: {resetCount}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WorldControlsModal;
