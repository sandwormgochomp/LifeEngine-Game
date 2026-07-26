import React from 'react';
import styles from './styles/HudPanel.module.css';

interface HudPanelProps {
  title: string;
  /* Widen the surface for content that is a picture rather than a column of
     readouts. The panel's 520px is sized for the stats/about text; a tree
     wants the width to spend on its time axis. */
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const HudPanel: React.FC<HudPanelProps> = ({ title, wide, onClose, children }) => {
  return (
    <div className={wide ? `${styles.panelOverlay} ${styles.panelOverlayWide}` : styles.panelOverlay}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{title}</span>
        <button className={styles.panelClose} onClick={onClose}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div className={styles.panelBody}>
        {children}
      </div>
    </div>
  );
};

export default HudPanel;
