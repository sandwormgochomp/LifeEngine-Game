import React, { useEffect, useRef } from 'react';
import styles from './styles/Hud.module.css';
import CellStates from '../Organism/Cell/CellStates';
import { renderOrganismSprite } from '../Rendering/DecorationRenderer';

// A cell as it appears either on a live anatomy (state is the CellState
// singleton) or in serialized JSON (state is just {name}).
export interface ThumbCell {
  loc_col: number;
  loc_row: number;
  custom_color?: string | null;
  // Present on live anatomy cells; orients an eye's pupil in decorated mode.
  direction?: number;
  state: { name?: string; color?: string };
}

interface OrganismThumbProps {
  cells: ThumbCell[];
  size?: number;
  // When true, render the full decorated sprite (shaded bodies, connective
  // tissue, eyeballs) instead of the flat body plan.
  decorated?: boolean;
}

/* Built from CellStates.all rather than indexing the registry by name: a
   serialized cell's state.name is an arbitrary string, and the registry also
   holds `all`, `living` and three methods, so keying it directly is unsound.
   Holds the states themselves, not their colors — ColorScheme repaints
   state.color at runtime, so the color has to be read on each lookup. */
const CELL_STATES_BY_NAME = new Map(CellStates.all.map(s => [s.name as string, s]));

const cellColor = (cell: ThumbCell): string =>
  cell.custom_color ||
  CELL_STATES_BY_NAME.get(cell.state?.name ?? '')?.color ||
  cell.state?.color ||
  '#888';

// Mini rendering of an organism's body plan, scaled to fit the tile.
const OrganismThumb: React.FC<OrganismThumbProps> = ({ cells, size = 72, decorated = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (decorated) {
      // The sprite pipeline reads state.color off each cell; serialized cells
      // carry only a name, so resolve the runtime color here (as the flat path
      // does below) before handing them over.
      const resolved = (cells ?? []).map(cell => ({
        loc_col: cell.loc_col,
        loc_row: cell.loc_row,
        custom_color: cell.custom_color ?? null,
        direction: cell.direction,
        state: { name: cell.state?.name ?? '', color: cellColor(cell) },
      }));
      renderOrganismSprite(canvas, resolved, size);
      return;
    }

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
    const cellMap = new Set(cells.map(c => `${c.loc_col},${c.loc_row}`));

    for (const cell of cells) {
      ctx.fillStyle = cellColor(cell);
      const px = origin_x + cell.loc_col * cs;
      const py = origin_y + cell.loc_row * cs;

      if (cs >= 3) {
        const c = cs >= 8 ? 2 : 1;
        const col = cell.loc_col, row = cell.loc_row;
        const hasN  = cellMap.has(`${col},${row - 1}`);
        const hasS  = cellMap.has(`${col},${row + 1}`);
        const hasW  = cellMap.has(`${col - 1},${row}`);
        const hasE  = cellMap.has(`${col + 1},${row}`);
        const hasNW = cellMap.has(`${col - 1},${row - 1}`);
        const hasNE = cellMap.has(`${col + 1},${row - 1}`);
        const hasSW = cellMap.has(`${col - 1},${row + 1}`);
        const hasSE = cellMap.has(`${col + 1},${row + 1}`);

        ctx.fillRect(px, py, cs, cs);

        // Erase ONLY outer corners where none of orthogonal/diagonal neighbors exist
        if (!hasN && !hasW && !hasNW) ctx.clearRect(px, py, c, c);
        if (!hasN && !hasE && !hasNE) ctx.clearRect(px + cs - c, py, c, c);
        if (!hasS && !hasW && !hasSW) ctx.clearRect(px, py + cs - c, c, c);
        if (!hasS && !hasE && !hasSE) ctx.clearRect(px + cs - c, py + cs - c, c, c);
      } else {
        ctx.fillRect(px, py, Math.max(cs, 1), Math.max(cs, 1));
      }
    }
  }, [cells, size, decorated]);

  return <canvas ref={canvasRef} width={size} height={size} className={styles.pickerThumb}></canvas>;
};

export default OrganismThumb;
