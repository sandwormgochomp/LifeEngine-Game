import React from 'react';
import styles from './styles/Hud.module.css';

interface HudBottomBarProps {
  activePanel: string | null;
  selectArmed: boolean;
  editorOpen: boolean;
  onItemClick: (item: string) => void;
}

const toolbarItems = [
  { id: 'tool-select', iconClass: 'fa-arrow-pointer', label: 'SELECT', item: 'select' },
  { id: 'tool-save', iconClass: 'fa-floppy-disk', label: 'SAVE', item: 'save' },
  { id: 'tool-edit', iconClass: 'fa-flask', label: 'EDIT', item: 'edit' },
  { id: 'tool-rules', iconClass: 'fa-book', label: 'RULES', item: 'rules' },
  { id: 'tool-environment', iconClass: 'fa-gear', label: 'ENVIRONMENT', item: 'environment' },
  { id: 'tool-stats', iconClass: 'fa-chart-bar', label: 'STATS', item: 'stats' },
];

const HudBottomBar: React.FC<HudBottomBarProps> = ({ activePanel, selectArmed, editorOpen, onItemClick }) => {
  const isActive = (item: string) => {
    if (item === 'select') return selectArmed;
    if (item === 'edit') return editorOpen;
    return activePanel === item;
  };

  return (
    <div className={styles.bottomCenter}>
      <div className={styles.toolbar}>
        {toolbarItems.map(({ id, iconClass, label, item }) => (
          <button
            key={id}
            id={id}
            className={`${styles.toolbarBtn} ${isActive(item) ? styles.toolbarBtnActive : ''}`}
            onClick={() => onItemClick(item)}
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
