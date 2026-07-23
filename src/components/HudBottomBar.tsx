import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import Modes from '../Controllers/ControlModes';
import WorldConfig from '../WorldConfig';

interface HudBottomBarProps {
  engine: Engine | null;
  activePanel: string | null;
  editorOpen: boolean;
  rulesOpen: boolean;
  onItemClick: (item: string) => void;
}

const toolbarItems = [
  { id: 'new-game', iconClass: 'fa-seedling', label: 'NEW', item: 'new', title: 'Start a new game: choose a fresh world and seed life' },
  { id: 'tool-save', iconClass: 'fa-floppy-disk', label: 'SAVE', item: 'save', title: 'Save or load a snapshot of the whole world' },
  { id: 'tool-edit', iconClass: 'fa-flask', label: 'LAB', item: 'edit', title: 'Open the Organism Lab: design, edit, and deploy life forms' },
  { id: 'tool-rules', iconClass: 'fa-dna', label: 'EVOLUTION', item: 'rules', title: 'Tune the evolution rules (mutation, lifespan, energy)' },
  { id: 'tool-stats', iconClass: 'fa-chart-bar', label: 'STATS', item: 'stats', title: 'Population, species, and evolution charts over time' },
  { id: 'tool-about', iconClass: 'fa-circle-info', label: 'ABOUT', item: 'about', title: 'What the cells do, the hotkeys, and project links' },
];

const MouseLeftIcon: React.FC = () => (
  <svg width="11" height="14" viewBox="0 0 12 16" fill="none" style={{ verticalAlign: '-2px', marginRight: '2px' }}>
    <rect x="1" y="1" width="10" height="14" rx="5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1.2" />
    <path d="M 1 6 A 5 5 0 0 1 6 1 L 6 7.5 L 1 7.5 Z" fill="#00FF41" />
    <line x1="6" y1="1" x2="6" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
    <line x1="1" y1="7.5" x2="11" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
  </svg>
);

const MouseMiddleIcon: React.FC = () => (
  <svg width="11" height="14" viewBox="0 0 12 16" fill="none" style={{ verticalAlign: '-2px', marginRight: '2px' }}>
    <rect x="1" y="1" width="10" height="14" rx="5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1.2" />
    <rect x="4.5" y="3" width="3" height="4.5" rx="1.5" fill="#00FF41" />
    <line x1="1" y1="7.5" x2="11" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
  </svg>
);

const MouseRightIcon: React.FC = () => (
  <svg width="11" height="14" viewBox="0 0 12 16" fill="none" style={{ verticalAlign: '-2px', marginRight: '2px' }}>
    <rect x="1" y="1" width="10" height="14" rx="5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1.2" />
    <path d="M 6 1 A 5 5 0 0 1 11 6 L 11 7.5 L 6 7.5 Z" fill="#00FF41" />
    <line x1="6" y1="1" x2="6" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
    <line x1="1" y1="7.5" x2="11" y2="7.5" stroke="rgba(0, 255, 65, 0.7)" strokeWidth="1" />
  </svg>
);

function renderClickHint(mode: number, brushSize: number) {
  const brush = `Radius: ${brushSize}`;
  switch (mode) {
    case Modes.Clone:
      return (
        <span>
          <MouseLeftIcon /> place organism · <MouseRightIcon /> cancel · <MouseMiddleIcon /> pan
        </span>
      );
    case Modes.Select:
      return (
        <span>
          <MouseLeftIcon /> sample for lab · <MouseRightIcon /> cancel · <MouseMiddleIcon /> pan
        </span>
      );
    case Modes.FoodDrop:
      return (
        <span>
          <MouseLeftIcon /> place food · <MouseRightIcon /> erase food · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.WallDrop:
      return (
        <span>
          <MouseLeftIcon /> place wall · <MouseRightIcon /> erase wall · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.InvincibleWallDrop:
      return (
        <span>
          <MouseLeftIcon /> place wall · <MouseRightIcon /> erase wall · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.RadiationDrop:
      return (
        <span>
          <MouseLeftIcon /> add radiation · <MouseRightIcon /> remove radiation · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.ClickKill:
      return (
        <span>
          <MouseLeftIcon /> kill organism · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.SeedLife:
      return (
        <span>
          <MouseLeftIcon /> paint random life · <MouseRightIcon /> clear life · <MouseMiddleIcon /> pan · brush {brush}
        </span>
      );
    case Modes.Drag:
      return (
        <span>
          <MouseLeftIcon /> pan view · wheel: zoom
        </span>
      );
    default:
      return (
        <span>
          <MouseLeftIcon /> sample organism · <MouseRightIcon /> erase · <MouseMiddleIcon /> pan
        </span>
      );
  }
}

const HudBottomBar: React.FC<HudBottomBarProps> = ({ engine, activePanel, editorOpen, rulesOpen, onItemClick }) => {
  const envMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);
  // brush size lives on WorldConfig; re-read it on every engine change so the
  // hint bar tracks the slider
  const brushSize = useEngineValue(engine, () => WorldConfig.brush_size, WorldConfig.brush_size);

  const isActive = (item: string) => {
    if (item === 'edit') return editorOpen;
    if (item === 'rules') return rulesOpen;
    return activePanel === item;
  };

  return (
    <div className={styles.bottomCenter}>
      <div className={styles.gameHintBar}>
        {renderClickHint(envMode, brushSize)}
      </div>
      <div className={styles.toolbar}>
        {toolbarItems.map(({ id, iconClass, label, item, title }) => (
          <button
            key={id}
            id={id}
            title={title}
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
