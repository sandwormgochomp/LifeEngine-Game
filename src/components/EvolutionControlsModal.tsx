import React, { useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import Hyperparams from '../Hyperparameters';
import type { HyperparamsSingleton } from '../Hyperparameters';
import Notifier from '../Utils/Notifier';
import EvolutionConsole from './EvolutionConsole';
import FateDeck from './FateDeck';
import EvolutionManualTab from './EvolutionManualTab';
import { ALL_KEYS, snapshotParams } from './evolutionParams';
import type { ParamKey, ParamMirror } from './evolutionParams';

interface EvolutionControlsModalProps {
  engine: Engine | null;
  onClose: () => void;
}

/* The three faces of the same parameters: dials and hazards (Console), played
   as bundled pressures (Fate Deck), or one row per field (Manual). Every tab
   reads the one mirror this shell owns and writes through the one setParam, so
   a change made on any of them is visible on the others the moment you switch. */
type TabId = 'console' | 'fate' | 'manual';

const TABS: { id: TabId; label: string; icon: string; title: string }[] = [
  { id: 'console', label: 'CONSOLE', icon: 'fa-gauge-high', title: 'The controls that decide a run’s character, as dials' },
  { id: 'fate', label: 'FATE DECK', icon: 'fa-clone', title: 'Play a pressure at the world' },
  { id: 'manual', label: 'MANUAL', icon: 'fa-sliders', title: 'Every parameter, one row each' },
];

const EvolutionControlsModal: React.FC<EvolutionControlsModalProps> = ({ engine, onClose }) => {
  // Hyperparams is a plain module object; mirror it so edits re-render.
  const [params, setParams] = useState<ParamMirror>(snapshotParams);
  const [tab, setTab] = useState<TabId>('console');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Re-read the singleton wholesale. Used after anything that writes it behind
     the mirror's back -- a reset, a file load, or a Fate Deck card. */
  const syncFromEngine = () => {
    setParams(snapshotParams());
    engine?.emitChange(true);
  };

  // Generic in the key so the value type is the one that key actually holds,
  // which is what makes the write to Hyperparams check instead of needing a
  // cast.
  const setParam = <K extends ParamKey>(key: K, value: HyperparamsSingleton[K]) => {
    Hyperparams[key] = value;
    setParams(prev => ({ ...prev, [key]: value }));
    engine?.emitChange(true);
  };

  const handleReset = () => {
    engine?.controlpanel.resetHyperparams();
    syncFromEngine();
    Notifier.notify('Evolution controls reset');
  };

  const handleSave = () => {
    const data = Object.fromEntries(ALL_KEYS.map(k => [k, Hyperparams[k]]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evolution_controls.json';
    a.click();
    URL.revokeObjectURL(url);
    Notifier.notify('Evolution controls saved');
  };

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text()
      .then(text => {
        Hyperparams.loadJsonObj(JSON.parse(text));
        syncFromEngine();
        Notifier.notify('Evolution controls loaded');
      })
      .catch(() => Notifier.notify('Not a valid controls file'));
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="evolution-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-dna" style={{ marginRight: '8px' }}></i>
            EVOLUTION CONTROLS
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.evoTabs} role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              id={`evo-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              title={t.title}
              className={`${styles.evoTab} ${tab === t.id ? styles.evoTabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              <i className={`fa-solid ${t.icon}`}></i> {t.label}
            </button>
          ))}
        </div>

        {tab === 'console' && <EvolutionConsole params={params} setParam={setParam} />}
        {tab === 'fate' && <FateDeck engine={engine} onParamsChanged={syncFromEngine} />}
        {tab === 'manual' && <EvolutionManualTab params={params} setParam={setParam} />}

        <div className={styles.ctrlFooter}>
          <button id="reset-rules" title="Restore every control to its default" onClick={handleReset}>
            Reset all
          </button>
          <button id="save-controls" title="Download these controls as JSON" onClick={handleSave}>
            <i className="fa-solid fa-download"></i> Save
          </button>
          <button id="load-controls" title="Load controls from a JSON file" onClick={() => fileInputRef.current?.click()}>
            <i className="fa-solid fa-upload"></i> Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleLoadFile}
          />
        </div>
      </div>
    </div>
  );
};

export default EvolutionControlsModal;
