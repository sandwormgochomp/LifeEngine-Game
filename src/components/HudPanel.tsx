import React from 'react';
import styles from './styles/HudPanel.module.css';

interface HudPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const HudPanel: React.FC<HudPanelProps> = ({ title, onClose, children }) => {
  return (
    <div className={styles.panelOverlay}>
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
