import React, { useState } from 'react';
import styles from './styles/Hud.module.css';

interface HudTopLeftProps {
  engine: any;
}

const HudTopLeft: React.FC<HudTopLeftProps> = ({ engine }) => {
  const [, forceRender] = useState({});

  const handlePlay = () => {
    if (!engine) return;
    engine.start(engine.fps || 60);
    forceRender({});
  };

  const handlePause = () => {
    if (!engine) return;
    engine.stop();
    forceRender({});
  };

  const handleReset = () => {
    engine?.env?.resetView();
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
          className={`${styles.playbackBtn} ${engine?.running ? styles.playbackBtnActive : ''}`}
          onClick={handlePlay}
          title="Play"
        >
          <i className="fa-solid fa-play" />
        </button>
        <button
          className={`${styles.playbackBtn} ${engine && !engine.running ? styles.playbackBtnActive : ''}`}
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
