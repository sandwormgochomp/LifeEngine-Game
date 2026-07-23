import React, { useEffect, useRef, useState } from 'react';
import type Engine from '../Engine';
import styles from './styles/EyedropperCursor.module.css';
import { EYEDROPPER_MAP, EyedropperStyleKey } from './EyedropperStyles';

interface EyedropperCursorProps {
  engine: Engine | null;
  activeMode: number;
  envRef: React.RefObject<HTMLDivElement | null>;
}

const PIXELS = [
  // y = 0
  { x: 12, y: 0, t: 'B' }, { x: 13, y: 0, t: 'B' }, { x: 14, y: 0, t: 'B' },
  // y = 1
  { x: 11, y: 1, t: 'B' }, { x: 12, y: 1, t: 'P' }, { x: 13, y: 1, t: 'P' }, { x: 14, y: 1, t: 'P' }, { x: 15, y: 1, t: 'B' },
  // y = 2
  { x: 10, y: 2, t: 'B' }, { x: 11, y: 2, t: 'P' }, { x: 12, y: 2, t: 'H' }, { x: 13, y: 2, t: 'P' }, { x: 14, y: 2, t: 'P' }, { x: 15, y: 2, t: 'B' },
  // y = 3
  { x: 9, y: 3, t: 'B' }, { x: 10, y: 3, t: 'B' }, { x: 11, y: 3, t: 'P' }, { x: 12, y: 3, t: 'P' }, { x: 13, y: 3, t: 'B' }, { x: 14, y: 3, t: 'B' },
  // y = 4
  { x: 8, y: 4, t: 'B' }, { x: 9, y: 4, t: 'G' }, { x: 10, y: 4, t: 'G' }, { x: 11, y: 4, t: 'B' }, { x: 12, y: 4, t: 'B' },
  // y = 5
  { x: 7, y: 5, t: 'B' }, { x: 8, y: 5, t: 'G' }, { x: 9, y: 5, t: 'W' }, { x: 10, y: 5, t: 'L' }, { x: 11, y: 5, t: 'G' }, { x: 12, y: 5, t: 'B' },
  // y = 6
  { x: 6, y: 6, t: 'B' }, { x: 7, y: 6, t: 'G' }, { x: 8, y: 6, t: 'W' }, { x: 9, y: 6, t: 'L' }, { x: 10, y: 6, t: 'L' }, { x: 11, y: 6, t: 'G' }, { x: 12, y: 6, t: 'B' },
  // y = 7
  { x: 5, y: 7, t: 'B' }, { x: 6, y: 7, t: 'G' }, { x: 7, y: 7, t: 'W' }, { x: 8, y: 7, t: 'L' }, { x: 9, y: 7, t: 'L' }, { x: 10, y: 7, t: 'G' }, { x: 11, y: 7, t: 'B' },
  // y = 8
  { x: 4, y: 8, t: 'B' }, { x: 5, y: 8, t: 'G' }, { x: 6, y: 8, t: 'W' }, { x: 7, y: 8, t: 'L' }, { x: 8, y: 8, t: 'L' }, { x: 9, y: 8, t: 'G' }, { x: 10, y: 8, t: 'B' },
  // y = 9
  { x: 3, y: 9, t: 'B' }, { x: 4, y: 9, t: 'G' }, { x: 5, y: 9, t: 'W' }, { x: 6, y: 9, t: 'L' }, { x: 7, y: 9, t: 'L' }, { x: 8, y: 9, t: 'G' }, { x: 9, y: 9, t: 'B' },
  // y = 10
  { x: 2, y: 10, t: 'B' }, { x: 3, y: 10, t: 'G' }, { x: 4, y: 10, t: 'W' }, { x: 5, y: 10, t: 'L' }, { x: 6, y: 10, t: 'L' }, { x: 7, y: 10, t: 'G' }, { x: 8, y: 10, t: 'B' },
  // y = 11
  { x: 1, y: 11, t: 'B' }, { x: 2, y: 11, t: 'G' }, { x: 3, y: 11, t: 'W' }, { x: 4, y: 11, t: 'W' }, { x: 5, y: 11, t: 'G' }, { x: 6, y: 11, t: 'G' }, { x: 7, y: 11, t: 'B' },
  // y = 12
  { x: 0, y: 12, t: 'B' }, { x: 1, y: 12, t: 'G' }, { x: 2, y: 12, t: 'W' }, { x: 3, y: 12, t: 'W' }, { x: 4, y: 12, t: 'G' }, { x: 5, y: 12, t: 'B' },
  // y = 13
  { x: 0, y: 13, t: 'B' }, { x: 1, y: 13, t: 'G' }, { x: 2, y: 13, t: 'W' }, { x: 3, y: 13, t: 'G' }, { x: 4, y: 13, t: 'B' },
  // y = 14
  { x: 0, y: 14, t: 'B' }, { x: 1, y: 14, t: 'G' }, { x: 2, y: 14, t: 'G' }, { x: 3, y: 14, t: 'B' },
  // y = 15
  { x: 1, y: 15, t: 'B' }, { x: 2, y: 15, t: 'B' }
];

const COLOR_MAP: Record<string, string> = {
  B: '#111118',
  P: '#ff0055',
  H: '#ff80aa',
  G: 'rgba(67, 232, 224, 0.45)',
  W: '#ffffff',
  L: 'var(--eyedropper-liquid-color, #00FF41)'
};

const OFFSETS: Record<string, { x: number; y: number }> = {
  'pixel-art': { x: 4, y: 56 },
  'cyberpunk-ring': { x: 32, y: 32 },
  'magnifying-loupe': { x: 40, y: 40 },
  'modern-reticle': { x: 32, y: 32 },
  'retro-console': { x: 4, y: 56 },
  'sci-fi-hud': { x: 40, y: 40 },
  'orbital-fluid': { x: 32, y: 32 },
  'glass-pipette': { x: 14, y: 58 },
  'chrono-gear': { x: 32, y: 32 },
  'chameleon-blob': { x: 32, y: 32 },
};

const EyedropperCursor: React.FC<EyedropperCursorProps> = ({ engine, activeMode, envRef }) => {
  const eyedropperRef = useRef<HTMLDivElement>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('pixel-art');
  const [activeColor, setActiveColor] = useState<string>('#00FF41');
  const [coords, setCoords] = useState<{ col: number; row: number }>({ col: 0, row: 0 });
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [colors5x5, setColors5x5] = useState<string[][]>([]);

  const moveTimeoutRef = useRef<number | null>(null);

  // Sync selected style from localStorage
  useEffect(() => {
    const updateStyle = () => {
      const style = localStorage.getItem('eyedropper-style') || 'pixel-art';
      setSelectedStyle(style);
    };

    updateStyle();

    // Listen for storage events (if changed in another tab)
    window.addEventListener('storage', updateStyle);

    // Also poll at a low frequency to catch local state changes quickly
    const interval = setInterval(updateStyle, 500);

    return () => {
      window.removeEventListener('storage', updateStyle);
      clearInterval(interval);
    };
  }, []);

  // Update cursor position and movement state
  useEffect(() => {
    const envEl = envRef.current;
    if (!envEl) return;

    const prevCursor = envEl.style.cursor;
    envEl.style.cursor = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      // Mark movement state
      setIsMoving(true);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      moveTimeoutRef.current = window.setTimeout(() => {
        setIsMoving(false);
      }, 150);

      if (eyedropperRef.current) {
        const offset = OFFSETS[selectedStyle] || { x: 32, y: 32 };
        eyedropperRef.current.style.transform = `translate3d(calc(${e.clientX}px - ${offset.x}px), calc(${e.clientY}px - ${offset.y}px), 0)`;
        if (eyedropperRef.current.style.display !== 'block') {
          eyedropperRef.current.style.display = 'block';
        }
      }
    };

    const handleMouseEnter = () => {
      if (eyedropperRef.current) {
        eyedropperRef.current.style.display = 'block';
      }
    };

    const handleMouseLeave = () => {
      if (eyedropperRef.current) {
        eyedropperRef.current.style.display = 'none';
      }
    };

    envEl.addEventListener('mousemove', handleMouseMove);
    envEl.addEventListener('mouseenter', handleMouseEnter);
    envEl.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      envEl.style.cursor = prevCursor;
      envEl.removeEventListener('mousemove', handleMouseMove);
      envEl.removeEventListener('mouseenter', handleMouseEnter);
      envEl.removeEventListener('mouseleave', handleMouseLeave);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, [envRef, activeMode, selectedStyle]);

  // Sync color & surrounding pixels from simulation engine
  useEffect(() => {
    if (!engine) return;

    let rafId: number;

    const updateColor = () => {
      const controller = engine.env?.controller;
      let color = '#00FF41'; // default retro green
      let cCol = 0;
      let cRow = 0;
      const subGrid: string[][] = [];

      if (controller) {
        cCol = controller.mouse_c || 0;
        cRow = controller.mouse_r || 0;
        setCoords({ col: cCol, row: cRow });

        const cell = controller.cur_cell;
        if (cell) {
          if (cell.cell_owner && cell.cell_owner.custom_color) {
            color = cell.cell_owner.custom_color;
          } else if (cell.state && cell.state.color && cell.state.name !== 'empty') {
            color = cell.state.color;
          }
        }

        // Generate 5x5 sub-grid colors for loupe zoom
        const gridMap = engine.env.grid_map;
        if (gridMap) {
          for (let r = -2; r <= 2; r++) {
            const rowColors: string[] = [];
            for (let c = -2; c <= 2; c++) {
              const cellNeighbor = gridMap.cellAt(cCol + c, cRow + r);
              let neighborColor = '#111118'; // Void
              if (cellNeighbor) {
                if (cellNeighbor.cell_owner && cellNeighbor.cell_owner.custom_color) {
                  neighborColor = cellNeighbor.cell_owner.custom_color;
                } else if (cellNeighbor.state && cellNeighbor.state.color && cellNeighbor.state.name !== 'empty') {
                  neighborColor = cellNeighbor.state.color;
                }
              }
              rowColors.push(neighborColor);
            }
            subGrid.push(rowColors);
          }
        }
      }

      setActiveColor(color);
      setColors5x5(subGrid);

      if (eyedropperRef.current) {
        eyedropperRef.current.style.setProperty('--eyedropper-liquid-color', color);
      }

      rafId = requestAnimationFrame(updateColor);
    };

    rafId = requestAnimationFrame(updateColor);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [engine, activeMode]);

  const EyedropperComponent = EYEDROPPER_MAP[selectedStyle as EyedropperStyleKey];

  return (
    <div ref={eyedropperRef} className={styles.cursorContainer} data-testid="eyedropper-cursor">
      {EyedropperComponent ? (
        <EyedropperComponent
          color={activeColor}
          colors5x5={colors5x5}
          col={coords.col}
          row={coords.row}
          isMoving={isMoving}
        />
      ) : (
        <svg viewBox="0 0 16 16" className={styles.pixelSvg}>
          {PIXELS.map((p, idx) => (
            <rect
              key={idx}
              x={p.x}
              y={p.y}
              width={1}
              height={1}
              fill={COLOR_MAP[p.t]}
            />
          ))}
        </svg>
      )}
    </div>
  );
};

export default EyedropperCursor;
