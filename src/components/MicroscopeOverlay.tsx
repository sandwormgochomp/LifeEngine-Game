import React, { useEffect, useRef, useState } from 'react';
import type { EngineAPI } from '../types/engine';
import styles from './styles/MicroscopeOverlay.module.css';

interface MicroscopeOverlayProps {
  engine?: EngineAPI | null;
}

const MicroscopeOverlay: React.FC<MicroscopeOverlayProps> = ({ engine }) => {
  const [blurAmount, setBlurAmount] = useState(0);

  const prevScaleRef = useRef(1);
  const velocityRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!engine) return;

    const controller = engine.env?.controller;
    if (!controller) return;

    let currentBlur = 0;

    const checkScale = () => {
      const currentScale = controller.scale || 1;
      const prevScale = prevScaleRef.current;
      const delta = Math.abs(currentScale - prevScale);

      if (delta > 0.001) {
        // Calculate optical depth blur impulse proportional to zoom speed
        const impulse = Math.min(3.0, delta * 30.0);
        velocityRef.current = Math.max(velocityRef.current, impulse);
        prevScaleRef.current = currentScale;
      }

      // Mechanical focus damping curve (snaps into sharp focus as zoom settles)
      if (velocityRef.current > 0.01) {
        velocityRef.current *= 0.82;
        currentBlur = velocityRef.current;
        setBlurAmount(Number(currentBlur.toFixed(2)));
      } else if (currentBlur > 0) {
        velocityRef.current = 0;
        currentBlur = 0;
        setBlurAmount(0);
      }

      rafRef.current = requestAnimationFrame(checkScale);
    };

    rafRef.current = requestAnimationFrame(checkScale);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [engine]);

  return (
    <div className={styles.overlayContainer}>
      {/* Full-screen backdrop blur layer (zero rectangular canvas box artifacts) */}
      {blurAmount > 0.05 && (
        <div
          className={styles.blurLayer}
          style={{
            backdropFilter: `blur(${blurAmount}px)`,
            WebkitBackdropFilter: `blur(${blurAmount}px)`,
          }}
        />
      )}

      {/* Microscope Lens Aperture Vignette */}
      <div className={styles.lensVignette} />
    </div>
  );
};

export default MicroscopeOverlay;
