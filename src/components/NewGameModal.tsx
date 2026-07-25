import React, { useState } from 'react';
import styles from './styles/NewGameModal.module.css';
import type Engine from '../Engine';
import WorldConfig from '../WorldConfig';
import Notifier from '../Utils/Notifier';

interface NewGameModalProps {
  engine: Engine | null;
  onClose: () => void;
}

/* The "New Game" setup dialog, reached from the bottom-toolbar button. It gathers the
   world options that used to be scattered through World Controls and applies
   them all at once when the user commits — so nothing takes effect until they
   press Start, and Start itself is the confirmation. */
const NewGameModal: React.FC<NewGameModalProps> = ({ engine, onClose }) => {
  // Seed each field from the value that is live right now, so opening the
  // dialog and pressing Start with no edits reproduces the current world.
  const [petriDish, setPetriDish] = useState(WorldConfig.petri_dish);
  const [clearWalls, setClearWalls] = useState(WorldConfig.clear_walls_on_reset);
  const [cellSize, setCellSize] = useState(engine?.env.grid_map.cell_size ?? 5);
  const [startLife, setStartLife] = useState(true);
  const [autoReset, setAutoReset] = useState(WorldConfig.auto_reset);
  const [autoPause, setAutoPause] = useState(WorldConfig.auto_pause);

  const handleStart = () => {
    if (!engine) return;
    WorldConfig.petri_dish = petriDish;
    WorldConfig.clear_walls_on_reset = clearWalls;
    WorldConfig.auto_reset = autoReset;
    WorldConfig.auto_pause = autoPause;
    // Resize rebuilds the grid from scratch, so it must come before reset()
    // repopulates it and buildPetriDish() re-walls the fresh edges.
    engine.env.resizeFillWindow(cellSize);
    engine.env.reset(startLife);
    if (petriDish) engine.env.buildPetriDish();
    engine.emitChange(true);
    Notifier.notify('New game started');
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="newgame-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-seedling" style={{ marginRight: '8px' }}></i>
            NEW GAME
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.ctrlBody}>
          <section className={styles.ctrlGroup}>
            <h4>World</h4>
            <label className={styles.ctrlRow} title="Enclose the world in a circular dish of indestructible glass">
              <span className={styles.ctrlLabel}>Petri dish world</span>
              <input type="checkbox" id="newgame-petri" checked={petriDish} onChange={e => setPetriDish(e.target.checked)} />
            </label>
            <label className={styles.ctrlRow} title="When on, walls are cleared whenever the environment resets on extinction">
              <span className={styles.ctrlLabel}>Clear walls on reset</span>
              <input type="checkbox" id="newgame-clear-walls" checked={clearWalls} onChange={e => setClearWalls(e.target.checked)} />
            </label>
            <label className={styles.ctrlRow} title="Pixel size of a single cell — smaller cells mean a larger world">
              <span className={styles.ctrlLabel}>Cell size</span>
              <input type="number" id="newgame-cell-size" className={styles.ctrlNumber} min={1} max={100} value={cellSize} onChange={e => setCellSize(parseInt(e.target.value) || 1)} />
            </label>
          </section>

          <section className={styles.ctrlGroup}>
            <h4>Life</h4>
            <label className={styles.ctrlRow} title="Start the world with a single origin organism (off starts an empty world you can seed yourself)">
              <span className={styles.ctrlLabel}>Start with life</span>
              <input type="checkbox" id="newgame-life" checked={startLife} onChange={e => setStartLife(e.target.checked)} />
            </label>
          </section>

          <section className={styles.ctrlGroup}>
            <h4>On extinction</h4>
            <label className={styles.ctrlRow} title="Automatically restart the simulation when every organism dies">
              <span className={styles.ctrlLabel}>Reset on extinction</span>
              <input type="checkbox" id="newgame-auto-reset" checked={autoReset} onChange={e => setAutoReset(e.target.checked)} />
            </label>
            <label className={styles.ctrlRow} title="Pause instead of resetting when every organism dies (overrides reset on extinction)">
              <span className={styles.ctrlLabel}>Pause on extinction</span>
              <input type="checkbox" id="newgame-auto-pause" checked={autoPause} onChange={e => setAutoPause(e.target.checked)} />
            </label>
          </section>
        </div>

        <div className={styles.newGameFooter}>
          <button className={styles.newGameStart} id="newgame-start" onClick={handleStart}>
            <i className="fa-solid fa-play" style={{ marginRight: '8px' }}></i>
            Start New Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewGameModal;
