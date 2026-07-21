import React, { useEffect, useRef } from 'react';
import styles from './styles/Hud.module.css';
import { renderCellSwatch } from '../Rendering/DecorationRenderer';
import type { CellState } from '../Organism/Cell/CellStates';

interface CellSwatchProps {
  cellState: CellState;
  // CSS display size in px; the canvas backing store is rendered at 2x for
  // crisp pixel-art edges.
  size?: number;
}

/* A palette swatch that previews a cell type with the same decorated sprite the
   editor and world canvases draw (shaded body, outline, eyeball), instead of a
   flat colour square. state.color is a dependency because ColorScheme repaints
   it at runtime -- see OrganismThumb for the same reason. */
const CellSwatch: React.FC<CellSwatchProps> = ({ cellState, size = 18 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderCellSwatch(canvasRef.current, { name: cellState.name, color: cellState.color });
    }
  }, [cellState.name, cellState.color]);

  const backing = size * 2;
  return (
    <canvas
      ref={canvasRef}
      width={backing}
      height={backing}
      className={styles.dockCellSwatch}
      style={{ width: size, height: size }}
    />
  );
};

export default CellSwatch;
