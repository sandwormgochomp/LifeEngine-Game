import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type { EngineAPI } from '../types/engine';
import FossilRecord from '../Stats/FossilRecord';

interface HudTopCenterProps {
  engine: EngineAPI | null;
  onLifeformsClick?: () => void;
}

const HudTopCenter: React.FC<HudTopCenterProps> = ({ engine, onLifeformsClick }) => {
  const gen = useEngineValue(engine, e => e.env.total_ticks, 0);
  const pop = useEngineValue(engine, e => e.env.organisms.length, 0);
  const lifeforms = useEngineValue(engine, () => FossilRecord.numExtantSpecies(), 0);
  const isNight = useEngineValue(engine, e => Boolean(e.env?.is_night), false);

  return (
    <div className={styles.topCenter}>
      <div className={styles.statsBar}>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>GEN:</span>
          <span className={styles.statValue}>{gen.toLocaleString()}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>POP:</span>
          <span className={styles.statValue}>{pop.toLocaleString()}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <button
          id="lifeforms-stat"
          className={`${styles.statItem} ${styles.statButton}`}
          title="Browse all living species and open one in the Organism Lab"
          onClick={onLifeformsClick}
        >
          <span className={styles.statLabel}>LIFEFORMS:</span>
          <span className={styles.statValue}>{lifeforms.toLocaleString()}</span>
        </button>
        <span className={styles.statDivider}>|</span>
        <span
          className={styles.statItem}
          title={
            isNight
              ? 'NIGHT TIME: Darkness lowers visibility and reduces food production from sunlight'
              : 'DAY TIME: Sunlight allows producer cells to grow food and provides full visibility'
          }
          style={{ cursor: 'help' }}
        >
          {isNight ? (
            <span className={styles.statValue} style={{ color: '#87ceeb' }}>
              <i className="fa-solid fa-moon" style={{ marginRight: '5px' }} />
              NIGHT
            </span>
          ) : (
            <span className={styles.statValue} style={{ color: '#ffd700' }}>
              <i className="fa-solid fa-sun" style={{ marginRight: '5px' }} />
              DAY
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

export default HudTopCenter;
