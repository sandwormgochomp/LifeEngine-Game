import React, { useState, useEffect } from 'react';
import styles from '../styles/Hud.module.css';
import useEngineValue from '../useEngineValue';
import type { EngineAPI, CellStateAPI } from '../../types/engine';
import CellStates from '../../Organism/Cell/CellStates';
import Modes from '../../Controllers/ControlModes';

interface EditorTabProps {
  engine: EngineAPI | null;
}

const EditorTab: React.FC<EditorTabProps> = ({ engine }) => {
  const [mode, setMode] = useState<number>(Modes.None);
  const [activeCellType, setActiveCellType] = useState<CellStateAPI | null>(null);
  const [customColor, setCustomColor] = useState<string>('#ff00ff');

  const editorController = engine?.organism_editor?.controller;
  const cellCount = useEngineValue(
    engine,
    e => e.organism_editor.organism?.anatomy?.cells?.length || 0,
    0
  );

  useEffect(() => {
    if (editorController) {
      setMode(editorController.mode);
      setActiveCellType(editorController.edit_cell_type);
      setCustomColor(editorController.custom_color || '#ff00ff');
    }
  }, [editorController]);

  const handleModeChange = (newMode: number) => {
    if (editorController) {
      editorController.mode = newMode;
      setMode(newMode);
    }
  };

  const handleCellTypeChange = (cellType: any) => {
    if (editorController) {
      if (activeCellType?.name === cellType.name) {
        editorController.edit_cell_type = null;
        setActiveCellType(null);
      } else {
        editorController.edit_cell_type = cellType;
        setActiveCellType(cellType);
      }
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    if (editorController) {
      editorController.custom_color = color;
    }
  };

  const toggleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editorController) {
      editorController.use_custom_color = e.target.checked;
    }
  };

  return (
    <div>
      <h3>Editor</h3>
      
      <div className={styles.buttonGroup}>
        <button 
          id="edit" 
          className={`edit-mode-btn ${mode === Modes.Edit ? styles.active : ''}`}
          onClick={() => handleModeChange(Modes.Edit)}
        >
          Edit Mode
        </button>
        <button 
          id="paint" 
          className={`edit-mode-btn ${mode === Modes.Paint ? styles.active : ''}`}
          onClick={() => handleModeChange(Modes.Paint)}
        >
          Paint Mode
        </button>
        <button onClick={() => {
          if (editorController) handleModeChange(Modes.None);
        }}>
          None
        </button>
      </div>

      <div className={styles.cellTypesContainer}>
        <h4>Cell Types</h4>
        <div className={styles.cellTypesGrid}>
          {CellStates.living.map((cellState: any) => (
            <button
              key={cellState.name}
              id={cellState.name}
              className={`cell-type ${styles.cellTypeBtn} ${activeCellType?.name === cellState.name ? styles.activeCellType : ''}`}
              style={{
                backgroundColor: cellState.color,
                borderColor: activeCellType?.name === cellState.name ? 'yellow' : 'transparent',
                borderWidth: '2px',
                borderStyle: 'solid'
              }}
              onClick={() => handleCellTypeChange(cellState)}
            >
              {cellState.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.paintControls}>
        <h4>Paint Settings</h4>
        <label>
          <input type="checkbox" id="use-custom-color" onChange={toggleCustomColor} />
          Use Custom Color
        </label>
        <input 
          type="color" 
          id="cell-color-picker" 
          value={customColor} 
          onChange={handleColorChange} 
        />
      </div>

      <div id="edit-organism-details">
        <p className="cell-count">Cell count: {cellCount}</p>
      </div>

      <div className={styles.editorActions}>
        <button id="clear-editor" onClick={() => {
          if (engine?.organism_editor) {
            engine.organism_editor.setDefaultOrg();
          }
        }}>
          Clear Organism
        </button>
      </div>

      {/* The canvas is rendered here but logic is bound in App.tsx */}
      <div style={{ marginTop: '20px' }}>
        <div id="editor-env" style={{ width: '310px', height: '310px', position: 'relative', border: '1px solid rgba(0, 255, 65, 0.3)' }}>
          <canvas id="editor-canvas" width="310" height="310" style={{ position: 'absolute', top: 0, left: 0 }}></canvas>
        </div>
      </div>
    </div>
  );
};

export default EditorTab;
