import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type { EngineAPI } from '../types/engine';

interface HudTopLeftProps {
  engine: EngineAPI | null;
}

const HudTopLeft: React.FC<HudTopLeftProps> = ({ engine }) => {
  const running = useEngineValue(engine, e => e.running, false);

  const handlePlay = () => {
    engine?.controlpanel.setPaused(false);
  };

  const handlePause = () => {
    engine?.controlpanel.setPaused(true);
  };

  const handleReset = () => {
    engine?.env?.controller?.resetView();
  };

  const handleSave = () => {
    console.log('Save clicked – placeholder');
  };

  return (
    <div className={styles.topLeft}>
      <div className={styles.logoRow}>
        <span className={styles.logoTitle}>LIFEENGINE</span>
        <span className={styles.logoVersion}>v1.2</span>
      </div>
      <div className={styles.playbackRow}>
        <button className={styles.playbackBtn} title="Menu">
          <i className="fa-solid fa-bars" />
        </button>
        <button
          className={`${styles.playbackBtn} ${running ? styles.playbackBtnActive : ''}`}
          onClick={handlePlay}
          title="Play"
        >
          <i className="fa-solid fa-play" />
        </button>
        <button
          className={`${styles.playbackBtn} ${engine && !running ? styles.playbackBtnActive : ''}`}
          onClick={handlePause}
          title="Pause"
        >
          <i className="fa-solid fa-pause" />
        </button>
        <button className={styles.playbackBtn} onClick={handleReset} title="Reset View">
          <i className="fa-solid fa-rotate" />
        </button>
        <button className={styles.playbackBtn} onClick={handleSave} title="Save">
          <i className="fa-solid fa-floppy-disk" />
        </button>
      </div>
    </div>
  );
};

export default HudTopLeft;
