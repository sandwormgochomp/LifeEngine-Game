import React, { useEffect, useState } from 'react';
import styles from './styles/Hud.module.css';
import Notifier from '../Utils/Notifier';
import OrganismThumb from './OrganismThumb';
import type { ThumbCell } from './OrganismThumb';

interface Preset {
  name: string;
  value: string;
}

interface PresetRaw {
  anatomy?: { cells: ThumbCell[] };
  species_name?: string;
}

interface PresetsModalProps {
  onClose: () => void;
  onOpenInLab: (raw: unknown, name: string) => void;
}

const presetUrl = (value: string) => `assets/organisms/${value}.json`;

const PresetsModal: React.FC<PresetsModalProps> = ({ onClose, onOpenInLab }) => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loaded, setLoaded] = useState<Record<string, PresetRaw>>({});

  // Fetch the manifest, then every preset in parallel so thumbnails fill in
  // as they arrive — one preset (Bob) is far larger than the rest and would
  // otherwise hold up the whole grid.
  useEffect(() => {
    let cancelled = false;
    fetch('assets/organisms/_list.json')
      .then(res => (res.ok ? res.json() : []))
      .then((list: Preset[]) => {
        if (cancelled || !Array.isArray(list)) return;
        setPresets(list);
        for (const preset of list) {
          fetch(presetUrl(preset.value))
            .then(res => res.json())
            .then((raw: PresetRaw) => {
              if (!cancelled) setLoaded(prev => ({ ...prev, [preset.value]: raw }));
            })
            .catch(() => {});
        }
      })
      .catch(() => setPresets([]));
    return () => { cancelled = true; };
  }, []);

  const choose = (preset: Preset) => {
    const raw = loaded[preset.value];
    if (raw) {
      onOpenInLab(raw, preset.name);
      return;
    }
    // Still in flight (or failed): fetch on demand so the click never no-ops
    fetch(presetUrl(preset.value))
      .then(res => res.json())
      .then(fetched => onOpenInLab(fetched, preset.name))
      .catch(() => Notifier.notify('Could not load preset'));
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="presets-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-folder-open" style={{ marginRight: '8px' }}></i>
            PRESET ORGANISMS ({presets.length})
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className={styles.pickerGrid}>
          {presets.length === 0 && (
            <p className={styles.pickerEmpty}>Loading presets…</p>
          )}
          {presets.map(preset => {
            const raw = loaded[preset.value];
            const cells = raw?.anatomy?.cells;
            return (
              <button
                key={preset.value}
                className={`preset-card ${styles.pickerCard}`}
                data-preset={preset.value}
                title={`Load ${preset.name} into the Organism Lab`}
                onClick={() => choose(preset)}
              >
                {cells
                  ? <OrganismThumb cells={cells} />
                  : <span className={styles.pickerThumbPending}></span>}
                <span className={`preset-name ${styles.pickerName}`}>{preset.name}</span>
                <span className={styles.pickerMeta}>
                  {cells ? `${cells.length} cells` : '…'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PresetsModal;
