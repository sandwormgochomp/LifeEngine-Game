import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import FossilRecord from '../Stats/FossilRecord';

interface HudTopCenterProps {
  engine: Engine | null;
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
        <button
          id="day-night-toggle"
          className={`${styles.statItem} ${styles.statButton}`}
          title={
            isNight
              ? 'NIGHT TIME: Click to switch to Day mode (Sunlight)'
              : 'DAY TIME: Click to switch to Night mode (Darkness)'
          }
          onClick={() => {
            if (engine?.env?.setNightMode) {
              engine.env.setNightMode(!isNight);
            }
          }}
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
        </button>
      </div>
    </div>
  );
};

export default HudTopCenter;
