import React, { useEffect, useState } from 'react';
import styles from './styles/Hud.module.css';
import type { EngineAPI } from '../types/engine';
import Hyperparams from '../Hyperparameters';
import WorldConfig from '../WorldConfig';
import Notifier from '../Utils/Notifier';

interface WorldEntry {
  name: string;
  value: string;
}

interface WorldsModalProps {
  engine: EngineAPI | null;
  onClose: () => void;
}

const worldUrl = (value: string) => `assets/worlds/${value}.json`;

// Bundled worlds are large (hundreds of KB each), so unlike the organism
// presets they are fetched on demand rather than all upfront.
const WorldsModal: React.FC<WorldsModalProps> = ({ engine, onClose }) => {
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [overrideControls, setOverrideControls] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('assets/worlds/_list.json')
      .then(res => (res.ok ? res.json() : []))
      .then(list => { if (!cancelled && Array.isArray(list)) setWorlds(list); })
      .catch(() => setWorlds([]));
    return () => { cancelled = true; };
  }, []);

  const load = (world: WorldEntry) => {
    if (!engine || loading) return;
    setLoading(world.value);
    fetch(worldUrl(world.value))
      .then(res => res.json())
      .then(raw => {
        if (!raw?.grid || !raw?.organisms) throw new Error('bad world');
        engine.env.loadRaw(raw);
        // Saved worlds carry the evolution controls they were tuned with
        if (overrideControls && raw.controls) Hyperparams.loadJsonObj(raw.controls);
        if (WorldConfig.petri_dish) engine.env.buildPetriDish();
        engine.emitChange(true);
        Notifier.notify(`Loaded ${world.name}`);
        onClose();
      })
      .catch(() => {
        setLoading(null);
        Notifier.notify('Could not load that world');
      });
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="worlds-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-globe" style={{ marginRight: '8px' }}></i>
            WORLDS ({worlds.length})
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.worldsList}>
          {worlds.length === 0 && <p className={styles.pickerEmpty}>Loading worlds…</p>}
          {worlds.map(world => (
            <button
              key={world.value}
              className={`world-card ${styles.worldCard}`}
              data-world={world.value}
              title={`Replace the current world with ${world.name}`}
              onClick={() => load(world)}
            >
              <i className="fa-solid fa-earth-americas"></i>
              <span className={styles.worldName}>{world.name}</span>
              {loading === world.value && <span className={styles.pickerMeta}>loading…</span>}
            </button>
          ))}
        </div>

        <div className={styles.ctrlFooter}>
          <label className={styles.ctrlRow} title="Also apply the evolution controls the world was saved with">
            <input
              type="checkbox"
              id="override-controls"
              checked={overrideControls}
              onChange={e => setOverrideControls(e.target.checked)}
            />
            <span className={styles.ctrlLabel}>Apply the world's saved evolution controls</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default WorldsModal;
