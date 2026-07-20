import React, { useMemo } from 'react';
import styles from './styles/Hud.module.css';
import type { EngineAPI } from '../types/engine';
import FossilRecord from '../Stats/FossilRecord';
import OrganismThumb from './OrganismThumb';
import type { ThumbCell } from './OrganismThumb';

interface SpeciesEntry {
  name: string;
  population: number;
  anatomy: {
    cells: ThumbCell[];
    serialize(): unknown;
  };
}

interface LifeformsModalProps {
  engine: EngineAPI | null;
  onClose: () => void;
  onOpenInLab: (raw: unknown, name: string) => void;
}

const LifeformsModal: React.FC<LifeformsModalProps> = ({ engine, onClose, onOpenInLab }) => {
  // Snapshot on open; the sim keeps running but the list doesn't churn under the cursor
  const species = useMemo<SpeciesEntry[]>(() => {
    const list = Object.values((FossilRecord as any).extant_species ?? {}) as SpeciesEntry[];
    return list.sort((a, b) => b.population - a.population);
  }, []);

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="lifeforms-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-bacteria" style={{ marginRight: '8px' }}></i>
            LIFEFORMS ({species.length})
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className={styles.pickerGrid}>
          {species.length === 0 && (
            <p className={styles.pickerEmpty}>No living species right now — deploy something from the Organism Lab.</p>
          )}
          {species.map(sp => (
            <button
              key={sp.name}
              className={`lifeform-card ${styles.pickerCard}`}
              title="Open this species in the Organism Lab"
              onClick={() => onOpenInLab({ anatomy: sp.anatomy.serialize(), species_name: sp.name }, sp.name)}
            >
              <OrganismThumb cells={sp.anatomy.cells} />
              <span className={`lifeform-name ${styles.pickerName}`}>{sp.name}</span>
              <span className={styles.pickerMeta}>pop {sp.population} · {sp.anatomy.cells.length} cells</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LifeformsModal;
