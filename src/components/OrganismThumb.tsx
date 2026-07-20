import React, { useEffect, useRef } from 'react';
import styles from './styles/Hud.module.css';
import CellStates from '../Organism/Cell/CellStates';

// A cell as it appears either on a live anatomy (state is the CellState
// singleton) or in serialized JSON (state is just {name}).
export interface ThumbCell {
  loc_col: number;
  loc_row: number;
  custom_color?: string | null;
  state: { name?: string; color?: string };
}

interface OrganismThumbProps {
  cells: ThumbCell[];
  size?: number;
}

const cellColor = (cell: ThumbCell): string =>
  cell.custom_color ||
  (CellStates as any)[cell.state?.name ?? '']?.color ||
  cell.state?.color ||
  '#888';

// Mini rendering of an organism's body plan, scaled to fit the tile.
const OrganismThumb: React.FC<OrganismThumbProps> = ({ cells, size = 72 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    if (!cells?.length) return;

    // Fit the organism's bounding box rather than centering on its origin
    // cell: some presets sit entirely off-origin and would otherwise render
    // as a speck in the corner of an empty tile.
    let min_c = Infinity, max_c = -Infinity, min_r = Infinity, max_r = -Infinity;
    for (const cell of cells) {
      min_c = Math.min(min_c, cell.loc_col);
      max_c = Math.max(max_c, cell.loc_col);
      min_r = Math.min(min_r, cell.loc_row);
      max_r = Math.max(max_r, cell.loc_row);
    }
    const cols = max_c - min_c + 1;
    const rows = max_r - min_r + 1;
    // Sub-pixel cells are allowed so huge organisms still show their shape
    const cs = Math.min(10, (size - 4) / Math.max(cols, rows));
    const origin_x = (size - cols * cs) / 2 - min_c * cs;
    const origin_y = (size - rows * cs) / 2 - min_r * cs;
    for (const cell of cells) {
      ctx.fillStyle = cellColor(cell);
      ctx.fillRect(origin_x + cell.loc_col * cs, origin_y + cell.loc_row * cs, Math.max(cs, 1), Math.max(cs, 1));
    }
  }, [cells, size]);

  return <canvas ref={canvasRef} width={size} height={size} className={styles.pickerThumb}></canvas>;
};

export default OrganismThumb;
