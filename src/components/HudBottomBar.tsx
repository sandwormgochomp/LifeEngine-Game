import useEngineValue from './useEngineValue';
import type { EngineAPI } from '../types/engine';
import Modes from '../Controllers/ControlModes';

interface HudBottomBarProps {
  engine: EngineAPI | null;
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

function getClickHint(mode: number): string {
  switch (mode) {
    case Modes.Clone:
      return 'L-Click: Place organism in world · M-Click: Pan · ESC: Cancel';
    case Modes.Select:
      return 'L-Click: Select organism for Organism Lab · M-Click: Pan · ESC: Cancel';
    case Modes.FoodDrop:
      return 'L-Click: Place food · M-Click: Pan · Wheel: Zoom';
    case Modes.WallDrop:
      return 'L-Click: Place wall · M-Click: Pan · Wheel: Zoom';
    case Modes.InvincibleWallDrop:
      return 'L-Click: Place invincible wall · M-Click: Pan · Wheel: Zoom';
    case Modes.RadiationDrop:
      return 'L-Click: Place radiation · M-Click: Pan · Wheel: Zoom';
    case Modes.ClickKill:
      return 'L-Click: Kill organism · M-Click: Pan · Wheel: Zoom';
    case Modes.Drag:
      return 'L-Click / Drag: Pan view · Wheel: Zoom';
    default:
      return 'L-Click: Select organism · M-Click: Pan view · Wheel: Zoom';
  }
}

const HudBottomBar: React.FC<HudBottomBarProps> = ({ engine, activePanel, selectArmed, editorOpen, onItemClick }) => {
  const envMode = useEngineValue(engine, e => e.env.controller.mode, Modes.None);

  const isActive = (item: string) => {
    if (item === 'select') return selectArmed;
    if (item === 'edit') return editorOpen;
    return activePanel === item;
  };

  return (
    <div className={styles.bottomCenter}>
      <div className={styles.gameHintBar}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }} />
        {getClickHint(envMode)}
      </div>
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
