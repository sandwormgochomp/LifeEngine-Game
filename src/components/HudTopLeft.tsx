import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import { SPEED_MODES } from '../Engine';

import WorldConfig from '../WorldConfig';

interface HudTopLeftProps {
  engine: Engine | null;
  headless: boolean;
  onToggleHeadless: () => void;
}

const HudTopLeft: React.FC<HudTopLeftProps> = ({ engine, headless, onToggleHeadless }) => {
  const speedIndex = useEngineValue(engine, e => e.speed_index, 0);

  return (
    <div className={styles.topLeft}>
      <div className={styles.logoRow}>
        <span className={styles.logoTitle}>LIFEENGINE</span>
        <span className={styles.logoVersion}>v1.2</span>
      </div>
      <div className={styles.playbackRow}>
        {/* The speed ladder, pause included: every rate is one click away and
            the active one is always visible, so there is nothing to infer. */}
        {SPEED_MODES.map((mode, index) => (
          <button
            key={mode.label}
            id={`speed-${index}`}
            className={`${styles.playbackBtn} ${speedIndex === index ? styles.playbackBtnActive : ''}`}
            onClick={() => engine?.setSpeedIndex(index)}
            title={index === 0 ? 'Pause · Space' : `${mode.label} · ${mode.multiplier}x`}
            aria-pressed={speedIndex === index}
          >
            <i className={`fa-solid ${mode.icon}`} />
          </button>
        ))}
        <button
          id="headless-toggle"
          className={`${styles.playbackBtn} ${styles.playbackGroupBreak} ${headless ? styles.playbackBtnActive : ''}`}
          onClick={onToggleHeadless}
          title="Stop drawing the world so the simulation runs much faster. Hotkey: H"
        >
          <i className={`fa-solid ${headless ? 'fa-eye-slash' : 'fa-eye'}`} />
        </button>
      </div>
    </div>
  );
};

export default HudTopLeft;
