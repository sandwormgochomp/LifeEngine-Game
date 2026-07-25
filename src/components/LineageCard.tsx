import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import OrganismThumb from './OrganismThumb';

interface LineageCardProps {
  engine: Engine | null;
}

// The follow-a-lineage card: a small persistent readout on the line the player
// clicked (Select/sample), in the same cyan as the highlight the tracked
// organisms wear. It stays up after the line goes extinct -- frozen at the
// final tally -- until dismissed or replaced, so a player who looked away
// still gets the ending.
//
// It renders as the last child of the top-left HUD column (HudTopLeft), so it
// flows under the playback controls rather than positioning itself. The
// top-right anchor it used to share with the editor dock and the perf panel
// left it covering the dock's close button.
const LineageCard: React.FC<LineageCardProps> = ({ engine }) => {
  const following = useEngineValue(engine, e => e.env.lineage.following, false);
  const extinct = useEngineValue(engine, e => e.env.lineage.extinct, false);
  const name = useEngineValue(engine, e => e.env.lineage.name, '');
  const alive = useEngineValue(engine, e => e.env.lineage.alive, 0);
  const born = useEngineValue(engine, e => e.env.lineage.born, 0);
  const died = useEngineValue(engine, e => e.env.lineage.died, 0);
  const gens = useEngineValue(engine, e => e.env.lineage.max_generation, 0);
  // Ticks since the follow began; frozen at the extinction tick once the line
  // ends. Derived per emit, same pattern as the ice-age countdown.
  const age = useEngineValue(engine, e => {
    const l = e.env.lineage;
    if (!l.following) return 0;
    return Math.max(0, (l.extinct ? l.end_tick : e.env.total_ticks) - l.start_tick);
  }, 0);

  if (!following || !engine) return null;

  // Stable for the duration of a follow (it only changes when `name` does), so
  // reading it directly instead of through useEngineValue is safe.
  const founderCells = engine.env.lineage.founder_cells;

  return (
    <div
      className={styles.lineageCard}
      data-testid="lineage-card"
    >
      <div className={styles.lineageCardHeader}>
        <span className={styles.lineageCardTitle}>
          {extinct ? '☠ LINE ENDED' : '◉ FOLLOWING'}
        </span>
        <button
          className={styles.lineageCardClose}
          data-testid="lineage-card-close"
          title="Stop following this lineage"
          onClick={() => engine.env.stopFollowing()}
        >
          ✕
        </button>
      </div>
      <div className={styles.lineageCardName}>
        {founderCells.length > 0 && (
          <OrganismThumb cells={founderCells} size={28} decorated />
        )}
        <span>{name}</span>
      </div>
      <div className={styles.lineageCardStats}>
        <span className={styles.lineageCardLabel}>ALIVE</span>
        <span className={styles.lineageCardValue}>{alive.toLocaleString()}</span>
        <span className={styles.lineageCardLabel}>BORN</span>
        <span className={styles.lineageCardValue}>{born.toLocaleString()}</span>
        <span className={styles.lineageCardLabel}>DIED</span>
        <span className={styles.lineageCardValue}>{died.toLocaleString()}</span>
        <span className={styles.lineageCardLabel}>GENS</span>
        <span className={styles.lineageCardValue}>{gens.toLocaleString()}</span>
        <span className={styles.lineageCardLabel}>AGE</span>
        <span className={styles.lineageCardValue}>{age.toLocaleString()}</span>
      </div>
    </div>
  );
};

export default LineageCard;
