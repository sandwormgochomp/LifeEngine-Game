import React from 'react';
import styles from './styles/Hud.module.css';

interface HudBottomBarProps {
  activePanel: string | null;
  onPanelToggle: (panel: string) => void;
}

const toolbarItems = [
  { id: 'tool-select', iconClass: 'fa-arrow-pointer', label: 'SELECT', panelName: 'select' },
  { id: 'tool-print', iconClass: 'fa-print', label: 'PRINT', panelName: 'print' },
  { id: 'tool-edit', iconClass: 'fa-pen', label: 'EDIT', panelName: 'edit' },
  { id: 'tool-rules', iconClass: 'fa-book', label: 'RULES', panelName: 'rules' },
  { id: 'tool-environment', iconClass: 'fa-gear', label: 'ENVIRONMENT', panelName: 'environment' },
  { id: 'tool-stats', iconClass: 'fa-chart-bar', label: 'STATS', panelName: 'stats' },
];

const HudBottomBar: React.FC<HudBottomBarProps> = ({ activePanel, onPanelToggle }) => {
  return (
    <div className={styles.bottomCenter}>
      <div className={styles.toolbar}>
        {toolbarItems.map(({ id, iconClass, label, panelName }) => (
          <button
            key={id}
            id={id}
            className={`${styles.toolbarBtn} ${activePanel === panelName ? styles.toolbarBtnActive : ''}`}
            onClick={() => onPanelToggle(panelName)}
          >
            <i className={`fa-solid ${iconClass} ${styles.toolbarIcon}`}></i>
            <span className={styles.toolbarLabel}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HudBottomBar;
