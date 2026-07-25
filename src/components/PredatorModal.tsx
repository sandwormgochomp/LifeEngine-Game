import React, { useEffect } from 'react';
import styles from './styles/PredatorModal.module.css';
import OrganismThumb from './OrganismThumb';
import PREDATORS from '../Organism/Predators';
import type { PredatorSpecies } from '../Organism/Predators';

interface PredatorModalProps {
  onClose: () => void;
  // Arms the release tool with this species; the caller closes the modal.
  onChoose: (predator: PredatorSpecies) => void;
}

/* The bestiary behind the Events tab's Predator button. Picking one does not
   release it — it arms the world tool, so the player still chooses *where* the
   pack lands, which is most of the drama (a pack dropped into a dense producer
   mat and one dropped on bare ground are different events).

   Escape is handled here rather than in App's chain: the chain runs off App
   state, and this modal is owned by the tool palette. */
const PredatorModal: React.FC<PredatorModalProps> = ({ onClose, onChoose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase: App's own Escape handler is on window too, and this modal
    // is the topmost layer while it is open.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="predator-modal">
      <div className={`${styles.pickerModal} ${styles.predatorModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-biohazard" style={{ marginRight: '8px' }}></i>
            INVASIVE PREDATORS
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p className={styles.predatorIntro}>
          Each is a hand-built hunter, not a mutation. Pick one, then click the world
          to release its founding pack — they evolve like anything else from there.
        </p>

        <div className={styles.predatorList}>
          {PREDATORS.map(predator => (
            <button
              key={predator.id}
              id={`predator-${predator.id}`}
              className={styles.predatorCard}
              title={`Release ${predator.name} into the world`}
              onClick={() => onChoose(predator)}
            >
              <OrganismThumb cells={predator.genome.anatomy.cells} size={72} decorated />
              <span className={styles.predatorText}>
                <span className={styles.predatorName}>{predator.name}</span>
                <span className={styles.predatorBinomial}>{predator.binomial}</span>
                <span className={styles.predatorTagline}>{predator.tagline}</span>
                <span className={styles.predatorDesc}>{predator.description}</span>
                <span className={styles.predatorMeta}>
                  {predator.pack} founders · {predator.genome.anatomy.cells.length} cells · mutability {predator.genome.mutability}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PredatorModal;
