import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type { EngineAPI } from '../types/engine';

interface HudTopRightProps {
  engine: EngineAPI | null;
}

const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10];

const HudTopRight: React.FC<HudTopRightProps> = ({ engine }) => {
  const currentFps = useEngineValue(engine, e => e.fps || 60, 60);
  const speed = Math.round((currentFps / 60) * 100) / 100;
  const zoom = useEngineValue(engine, e => Math.round((e.env.controller.scale || 1) * 100), 100);

  const changeSpeedIndex = (delta: number) => {
    if (!engine) return;
    let curIndex = 2;
    let minDiff = Infinity;
    SPEED_STEPS.forEach((s, idx) => {
      const diff = Math.abs(s - speed);
      if (diff < minDiff) {
        minDiff = diff;
        curIndex = idx;
      }
    });

    const nextIndex = Math.max(0, Math.min(SPEED_STEPS.length - 1, curIndex + delta));
    const targetFps = SPEED_STEPS[nextIndex] * 60;
    engine.controlpanel.changeEngineSpeed(targetFps);
  };

  const handleResetZoom = () => {
    engine?.env?.controller?.resetView();
  };

  return (
    <div className={styles.topRight}>
      <div className={styles.speedZoomBar}>
        <span className={styles.speedLabel}>SPEED:</span>
        <button
          className={styles.speedBtn}
          onClick={() => changeSpeedIndex(-1)}
          title="Decrease Speed"
          disabled={speed <= SPEED_STEPS[0]}
        >
          <i className="fa-solid fa-minus" />
        </button>
        <span
          className={styles.speedValue}
          onClick={() => changeSpeedIndex(1)}
          title="Click to cycle speed"
          style={{ cursor: 'pointer' }}
        >
          {speed}x
        </span>
        <button
          className={styles.speedBtn}
          onClick={() => changeSpeedIndex(1)}
          title="Increase Speed"
          disabled={speed >= SPEED_STEPS[SPEED_STEPS.length - 1]}
        >
          <i className="fa-solid fa-plus" />
        </button>
        <span className={styles.statDivider}>|</span>
        <span className={styles.zoomLabel}>ZOOM:</span>
        <span className={styles.zoomValue}>{zoom}%</span>
        <span className={styles.zoomIcon} onClick={handleResetZoom} title="Reset Zoom">
          <i className="fa-solid fa-magnifying-glass" />
        </span>
      </div>
    </div>
  );
};

export default HudTopRight;
