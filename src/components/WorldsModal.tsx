import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import Hyperparams from '../Hyperparameters';
import Notifier from '../Utils/Notifier';

interface WorldEntry {
  name: string;
  value: string;
  cols?: number;
  rows?: number;
}

interface WorldsModalProps {
  engine: Engine | null;
  onClose: () => void;
}

const worldUrl = (value: string) => `assets/worlds/${value}.json`;

// Bundled worlds are large (hundreds of KB each), so unlike the organism
// presets they are fetched on demand rather than all upfront.
const WorldsModal: React.FC<WorldsModalProps> = ({ engine, onClose }) => {
  const [worlds, setWorlds] = useState<WorldEntry[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [overrideControls, setOverrideControls] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A world takes seconds to fetch and rebuild. Closing mid-load has to
  // abandon it, or the swap lands on a world the user has already backed out of.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    fetch('assets/worlds/_list.json')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(list => {
        if (!alive.current) return;
        if (Array.isArray(list)) setWorlds(list);
        else setListFailed(true);
      })
      .catch(() => { if (alive.current) setListFailed(true); });
  }, []);

  const applyWorld = (raw: any) => {
    // loadRaw shapes the world to the save's own petri_dish flag; the
    // bundled worlds are rectangular designs that predate the dish.
    engine!.env.loadRaw(raw);
    engine!.emitChange(true);
  };

  const loadBundled = (world: WorldEntry) => {
    if (!engine || loading) return;
    setLoading(world.value);
    fetch(worldUrl(world.value))
      .then(res => res.json())
      .then(raw => {
        if (!alive.current) return;
        if (!raw?.grid || !raw?.organisms) throw new Error('bad world');
        applyWorld(raw);
        // Saved worlds carry the evolution controls they were tuned with
        if (overrideControls && raw.controls) Hyperparams.loadJsonObj(raw.controls);
        Notifier.notify(`Loaded ${world.name}`);
        onClose();
      })
      .catch(() => {
        if (!alive.current) return;
        setLoading(null);
        Notifier.notify('Could not load that world');
      });
  };

  const handleDownload = () => {
    if (!engine?.env) return;
    const raw = engine.env.serialize();
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life_engine_world_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Notifier.notify('World saved successfully');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !engine?.env) return;

    file.text()
      .then(text => {
        if (!alive.current) return;
        const raw = JSON.parse(text);
        if (!raw.grid || !raw.organisms) {
          Notifier.notify('Not a valid world save file');
          return;
        }
        applyWorld(raw);
        Notifier.notify('World state loaded successfully');
        onClose();
      })
      .catch(() => { if (alive.current) Notifier.notify('Failed to load world save file'); });
  };

  const renderEmpty = () => {
    if (listFailed) return <p className={styles.pickerEmpty}>Could not load the world list.</p>;
    if (worlds === null) return <p className={styles.pickerEmpty}>Loading worlds…</p>;
    if (worlds.length === 0) return <p className={styles.pickerEmpty}>No bundled worlds.</p>;
    return null;
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="worlds-modal">
      <div className={`${styles.pickerModal} ${styles.worldsModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-globe" style={{ marginRight: '8px' }}></i>
            WORLDS{worlds ? ` (${worlds.length})` : ''}
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.worldsList}>
          {renderEmpty()}
          {worlds?.map(world => (
            <button
              key={world.value}
              className={`world-card ${styles.worldCard} ${loading === world.value ? styles.worldCardLoading : ''}`}
              data-world={world.value}
              // Every card goes dead during a load, so the ones not being
              // fetched can't look clickable while they silently do nothing
              disabled={loading !== null}
              title={`Replace the current world with ${world.name}`}
              onClick={() => loadBundled(world)}
            >
              <i className="fa-solid fa-earth-americas"></i>
              <span className={styles.worldName}>{world.name}</span>
              <span className={styles.pickerMeta}>
                {loading === world.value
                  ? 'loading…'
                  : world.cols && world.rows ? `${world.cols}×${world.rows}` : ''}
              </span>
            </button>
          ))}
        </div>

        <div className={`${styles.ctrlFooter} ${styles.worldsFooter}`}>
          <label className={styles.ctrlRow} title="Also apply the evolution controls the world was saved with">
            <input
              type="checkbox"
              id="override-controls"
              checked={overrideControls}
              onChange={e => setOverrideControls(e.target.checked)}
            />
            <span className={styles.ctrlLabel}>Apply the world's saved evolution controls</span>
          </label>
          <div className={styles.worldsActions}>
            <button id="save-world-btn" title="Download the current world as a save file" onClick={handleDownload}>
              <i className="fa-solid fa-download" style={{ marginRight: '6px' }}></i>
              Download World
            </button>
            <button id="load-world-btn" title="Load a world from a save file" onClick={() => fileInputRef.current?.click()}>
              <i className="fa-solid fa-upload" style={{ marginRight: '6px' }}></i>
              Load World
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldsModal;
