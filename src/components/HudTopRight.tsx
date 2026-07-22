import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';

interface HudTopRightProps {
  engine: Engine | null;
  // Toggles the perf breakdown panel; the fps readout is its natural
  // affordance, since that's the number people want explained.
  onTogglePerf?: () => void;
}

const HudTopRight: React.FC<HudTopRightProps> = ({ engine, onTogglePerf }) => {
  const zoom = useEngineValue(engine, e => Math.round((e.env.controller.scale || 1) * 100), 100);
  // Measured render rate, which falls below the target when the world is busy.
  // Live even while paused: the ui loop keeps repainting for panning/editing.
  const actualFps = useEngineValue(engine, e => Math.round(e.actual_fps || 0), 0);

  const handleResetZoom = () => {
    engine?.env?.controller?.resetView();
  };

  return (
    <div className={styles.topRight}>
      <div className={styles.speedZoomBar}>
        {/* Speed selection lives in the playback row now; what is left here is
            the measured rate, which is a readout rather than a control. */}
        <span
          id="fps-actual"
          className={styles.fpsActual}
          title="Performance details · P"
          onClick={onTogglePerf}
          style={onTogglePerf ? { cursor: 'pointer' } : undefined}
        >
          {Number.isFinite(actualFps) ? `${actualFps} fps` : '—'}
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
