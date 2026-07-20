import React, { useEffect, useMemo, useRef } from 'react';
import styles from './styles/Hud.module.css';
import type { EngineAPI } from '../types/engine';
import FossilRecord from '../Stats/FossilRecord';

interface SpeciesEntry {
  name: string;
  population: number;
  anatomy: {
    cells: { loc_col: number; loc_row: number; custom_color: string | null; state: { name: string; color: string } }[];
    serialize(): unknown;
  };
}

interface LifeformsModalProps {
  engine: EngineAPI | null;
  onClose: () => void;
  onOpenInLab: (raw: unknown, name: string) => void;
}

// Mini rendering of a species' body plan
const SpeciesThumb: React.FC<{ anatomy: SpeciesEntry['anatomy'] }> = ({ anatomy }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    let ext = 1;
    for (const cell of anatomy.cells)
      ext = Math.max(ext, Math.abs(cell.loc_col), Math.abs(cell.loc_row));
    const cs = Math.max(1, Math.min(10, Math.floor(size / (ext * 2 + 1))));
    const center = size / 2;
    for (const cell of anatomy.cells) {
      ctx.fillStyle = cell.custom_color || cell.state.color;
      ctx.fillRect(center + (cell.loc_col - 0.5) * cs, center + (cell.loc_row - 0.5) * cs, cs, cs);
    }
  }, [anatomy]);

  return <canvas ref={canvasRef} width={72} height={72} className={styles.lifeformThumb}></canvas>;
};

const LifeformsModal: React.FC<LifeformsModalProps> = ({ engine, onClose, onOpenInLab }) => {
  // Snapshot on open; the sim keeps running but the list doesn't churn under the cursor
  const species = useMemo<SpeciesEntry[]>(() => {
    const list = Object.values((FossilRecord as any).extant_species ?? {}) as SpeciesEntry[];
    return list.sort((a, b) => b.population - a.population);
  }, []);

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="lifeforms-modal">
      <div className={styles.lifeformsModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-bacteria" style={{ marginRight: '8px' }}></i>
            LIFEFORMS ({species.length})
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className={styles.lifeformsGrid}>
          {species.length === 0 && (
            <p className={styles.lifeformsEmpty}>No living species right now — deploy something from the Organism Lab.</p>
          )}
          {species.map(sp => (
            <button
              key={sp.name}
              className={`lifeform-card ${styles.lifeformCard}`}
              title="Open this species in the Organism Lab"
              onClick={() => onOpenInLab({ anatomy: sp.anatomy.serialize(), species_name: sp.name }, sp.name)}
            >
              <SpeciesThumb anatomy={sp.anatomy} />
              <span className={`lifeform-name ${styles.lifeformName}`}>{sp.name}</span>
              <span className={styles.lifeformMeta}>pop {sp.population} · {sp.anatomy.cells.length} cells</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LifeformsModal;
