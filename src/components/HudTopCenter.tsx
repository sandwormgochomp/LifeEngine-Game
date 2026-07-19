import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type { EngineAPI } from '../types/engine';
import FossilRecord from '../Stats/FossilRecord';

interface HudTopCenterProps {
  engine: EngineAPI | null;
}

const HudTopCenter: React.FC<HudTopCenterProps> = ({ engine }) => {
  const gen = useEngineValue(engine, e => e.env.total_ticks, 0);
  const pop = useEngineValue(engine, e => e.env.organisms.length, 0);
  const lifeforms = useEngineValue(engine, () => FossilRecord.numExtantSpecies(), 0);

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
        <span className={styles.statItem}>
          <span className={styles.statLabel}>LIFEFORMS:</span>
          <span className={styles.statValue}>{lifeforms.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
};

export default HudTopCenter;
