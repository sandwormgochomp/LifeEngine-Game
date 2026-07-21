import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import { SPEED_MODES } from '../Engine';

import Notifier from '../Utils/Notifier';
import WorldConfig from '../WorldConfig';

interface HudTopLeftProps {
  engine: Engine | null;
  headless: boolean;
  onToggleHeadless: () => void;
}

const HudTopLeft: React.FC<HudTopLeftProps> = ({ engine, headless, onToggleHeadless }) => {
  const speedIndex = useEngineValue(engine, e => e.speed_index, 0);

  const handleRestart = () => {
    if (!engine?.env) return;
    if (!window.confirm('Restart simulation and reset the world environment?')) return;
    engine.env.reset(true);
    engine.emitChange(true);
    Notifier.notify('Simulation restarted');
  };

  const handleSave = () => {
    if (!engine?.env) return;
    const raw = engine.env.serialize();
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life_engine_world_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Notifier.notify('World saved successfully');
  };

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
          className={`${styles.playbackBtn} ${styles.playbackGroupBreak}`}
          onClick={handleRestart}
          title="Restart Simulation"
        >
          <i className="fa-solid fa-rotate" />
        </button>
        <button className={styles.playbackBtn} onClick={handleSave} title="Save">
          <i className="fa-solid fa-floppy-disk" />
        </button>
        <button
          id="headless-toggle"
          className={`${styles.playbackBtn} ${headless ? styles.playbackBtnActive : ''}`}
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
