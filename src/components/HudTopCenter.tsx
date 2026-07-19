import React, { useEffect, useState } from 'react';
import styles from './styles/Hud.module.css';

const FossilRecord = require('../Stats/FossilRecord');

interface HudTopCenterProps {
  engine: any;
}

const HudTopCenter: React.FC<HudTopCenterProps> = ({ engine }) => {
  const [, forceRender] = useState({});

  useEffect(() => {
    const interval = setInterval(() => {
      forceRender({});
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const gen = (engine?.env?.total_ticks || 0).toLocaleString();
  const pop = (engine?.env?.organisms?.length || 0).toLocaleString();
  const lifeforms = (FossilRecord.numExtantSpecies() || 0).toLocaleString();

  return (
    <div className={styles.topCenter}>
      <div className={styles.statsBar}>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>GEN:</span>
          <span className={styles.statValue}>{gen}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>POP:</span>
          <span className={styles.statValue}>{pop}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>LIFEFORMS:</span>
          <span className={styles.statValue}>{lifeforms}</span>
        </span>
      </div>
    </div>
  );
};

export default HudTopCenter;
