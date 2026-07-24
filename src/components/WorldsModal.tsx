import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import type Organism from '../Organism/Organism';
import Hyperparams from '../Hyperparameters';
import Notifier from '../Utils/Notifier';
import OrganismThumb from './OrganismThumb';
import type { ThumbCell } from './OrganismThumb';
import * as SavedWorlds from '../Utils/SavedWorlds';
import type { SavedWorldMeta } from '../Utils/SavedWorlds';

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

/* The saved world's thumbnail: the body plan of its biggest living organism,
   the one a world is most recognisable by. Copied down to the fields
   OrganismThumb reads, since this goes to storage alongside every other save
   and a live BodyCell drags its owner (and the whole grid) behind it. */
function largestOrganismThumb(organisms: Organism[]): ThumbCell[] | null {
  let largest: Organism | null = null;
  for (const org of organisms) {
    if (!org.living) continue;
    if (!largest || org.anatomy.cells.length > largest.anatomy.cells.length) largest = org;
  }
  if (!largest) return null;
  return largest.anatomy.cells.map(cell => ({
    loc_col: cell.loc_col,
    loc_row: cell.loc_row,
    custom_color: cell.custom_color,
    direction: (cell as { direction?: number }).direction,
    state: { name: cell.state.name },
  }));
}

// Bundled worlds are large (hundreds of KB each), so unlike the organism
// presets they are fetched on demand rather than all upfront.
const WorldsModal: React.FC<WorldsModalProps> = ({ engine, onClose }) => {
  const [worlds, setWorlds] = useState<WorldEntry[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [saved, setSaved] = useState<SavedWorldMeta[]>(() => SavedWorlds.list());
  const [overrideControls, setOverrideControls] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  // The name field, open only while a save is being named
  const [naming, setNaming] = useState<string | null>(null);
  // Deleting a saved world is unrecoverable, so the trash icon arms rather
  // than acts, and the card asks before it goes
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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

  const loadSaved = (entry: SavedWorldMeta) => {
    if (!engine || loading) return;
    const raw = SavedWorlds.load(entry.id) as any;
    if (!raw?.grid || !raw?.organisms) {
      Notifier.notify('That saved world is missing or unreadable');
      return;
    }
    applyWorld(raw);
    if (overrideControls && raw.controls) Hyperparams.loadJsonObj(raw.controls);
    Notifier.notify(`Loaded ${entry.name}`);
    onClose();
  };

  const commitSave = () => {
    const name = (naming ?? '').trim();
    if (!engine?.env || !name) return;
    const raw = engine.env.serialize();
    try {
      const entry = SavedWorlds.save({
        name,
        cols: engine.env.grid_map.cols,
        rows: engine.env.grid_map.rows,
        organisms: engine.env.organisms.filter(org => org.living).length,
        thumb: largestOrganismThumb(engine.env.organisms),
      }, raw);
      setSaved(prev => [entry, ...prev]);
      setNaming(null);
      Notifier.notify(`Saved ${name} to this browser`);
    } catch {
      // Browser storage tops out around 5MB, well under the biggest worlds
      Notifier.notify('Too big for browser storage — download this world instead');
    }
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

  const deleteSaved = (id: string) => {
    SavedWorlds.remove(id);
    setSaved(prev => prev.filter(entry => entry.id !== id));
    setConfirmDelete(null);
  };

  const renderEmpty = () => {
    if (listFailed) return <p className={styles.pickerEmpty}>Could not load the world list.</p>;
    if (worlds === null) return <p className={styles.pickerEmpty}>Loading worlds…</p>;
    if (worlds.length === 0) return <p className={styles.pickerEmpty}>No bundled worlds.</p>;
    return null;
  };

  const total = (worlds?.length ?? 0) + saved.length;

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="worlds-modal">
      <div className={`${styles.pickerModal} ${styles.worldsModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-globe" style={{ marginRight: '8px' }}></i>
            WORLDS{worlds ? ` (${total})` : ''}
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.worldsList}>
          {/* Only labelled once there is more than one kind of world to tell apart */}
          {saved.length > 0 && <span className={styles.worldsSection}>SAVED IN THIS BROWSER</span>}
          {saved.map(entry => (
            <div
              key={entry.id}
              className={`saved-world-card ${styles.worldCard} ${styles.savedCard} ${loading ? styles.worldCardDead : ''}`}
              data-saved-world={entry.name}
            >
              {confirmDelete === entry.id ? (
                <>
                  <span className={styles.worldName}>Delete {entry.name}?</span>
                  <button
                    className={`saved-world-delete-confirm ${styles.savedIconBtn} ${styles.savedIconDanger}`}
                    title={`Delete ${entry.name} permanently`}
                    onClick={() => deleteSaved(entry.id)}
                  >
                    <i className="fa-solid fa-check"></i>
                  </button>
                  <button
                    className={styles.savedIconBtn}
                    title="Keep it"
                    onClick={() => setConfirmDelete(null)}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`saved-world-load ${styles.savedCardMain}`}
                    disabled={loading !== null}
                    title={`Replace the current world with ${entry.name}`}
                    onClick={() => loadSaved(entry)}
                  >
                    {entry.thumb?.length
                      ? <OrganismThumb cells={entry.thumb} size={30} decorated />
                      : <i className="fa-solid fa-earth-americas"></i>}
                    <span className={styles.worldName}>{entry.name}</span>
                    <span className={styles.pickerMeta}>{entry.cols}×{entry.rows}</span>
                  </button>
                  <button
                    className={`saved-world-delete ${styles.savedIconBtn}`}
                    disabled={loading !== null}
                    title={`Delete ${entry.name}`}
                    onClick={() => setConfirmDelete(entry.id)}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </>
              )}
            </div>
          ))}

          {saved.length > 0 && worlds && worlds.length > 0 && (
            <span className={styles.worldsSection}>BUNDLED</span>
          )}
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

          {naming !== null ? (
            <div className={styles.worldsActions}>
              <input
                type="text"
                id="save-world-name"
                className={styles.worldNameInput}
                value={naming}
                maxLength={40}
                autoFocus
                placeholder="Name this world"
                // The suggested name arrives selected, so typing replaces it
                onFocus={e => e.target.select()}
                onChange={e => setNaming(e.target.value)}
                // Escape backs out of naming, not out of the whole picker
                onKeyDown={e => {
                  if (e.key === 'Enter') commitSave();
                  if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); }
                }}
              />
              <button id="save-world-confirm-btn" disabled={!naming.trim()} onClick={commitSave}>
                <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i>
                Save
              </button>
              <button id="save-world-cancel-btn" onClick={() => setNaming(null)}>Cancel</button>
            </div>
          ) : (
            <div className={styles.worldsActions}>
              <button
                id="save-browser-btn"
                title="Save this world in the browser, under a name of your choice"
                onClick={() => setNaming(SavedWorlds.suggestName(saved))}
              >
                <i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>
                Save World
              </button>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default WorldsModal;
