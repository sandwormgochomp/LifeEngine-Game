import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';

interface HudTopRightProps {
  engine: any;
}

const HudTopRight: React.FC<HudTopRightProps> = ({ engine }) => {
  const speed = useEngineValue(engine, e => Math.round((e.fps || 60) / 60 * 10) / 10, 1);
  const zoom = useEngineValue(engine, e => Math.round((e.env.controller.scale || 1) * 100), 100);

  const handleResetZoom = () => {
    engine?.env?.controller?.resetView();
  };

  return (
    <div className={styles.topRight}>
      <div className={styles.speedZoomBar}>
        <span className={styles.speedLabel}>SPEED:</span>
        <span className={styles.speedValue}>{speed}x</span>
        <span className={styles.speedIcon}>
          <i className="fa-solid fa-forward-step" />
          <i className="fa-solid fa-forward-step" />
        </span>
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
