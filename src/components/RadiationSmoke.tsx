import React, { useEffect, useRef } from 'react';
import type Engine from '../Engine';

// Radiation zones rendered as wavy pixel smoke: each irradiated cell breathes
// a faint green haze and vents pixel puffs that rise and serpentine like the
// floaties' travelling-wave wriggle. Pure decoration on its own
// click-transparent layer; the radiation_map itself stays sim state.
//
// Like Floaties, positions are world-space (the env canvas' untransformed
// bitmap coords) projected through the controller's camera each frame — but
// through the *raw* pan/zoom, not a spring-damped copy: the smoke is glued to
// specific world cells and must track them exactly during a drag.
//
// Everything is stateless per frame: puff positions are pure functions of
// (time, cell hash), so there are no particles to allocate or age and the
// ?floaties=static freeze used by visual tests pins this layer too.

const PUFFS_PER_CELL = 2;
// How far a puff rises before it dissipates, in cell heights.
const RISE_CELLS = 3.5;

const SMOKE_COLORS = [
  '80, 255, 120',  // Neon Lime (shared with the floaties palette)
  '140, 255, 100', // Chartreuse
  '40, 230, 90',   // Deep radioactive green
];

// The same frozen clock Floaties uses in ?floaties=static mode.
const STATIC_T = 12.34;

// Deterministic integer scramble -> [0, 1). Per-cell/per-puff variety has to
// be a pure function of the cell coordinates (not Math.random) so a puff's
// trajectory is stable across frames and across cache rebuilds.
const hash01 = (n: number): number => {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

interface Puff {
  cycle: number;   // seconds per rise loop
  offset: number;  // where in the loop this puff starts
  color: string;
  sway: number;    // horizontal wave amplitude, in smoke pixels
}

interface RadCell {
  wx: number; // world-space cell center
  wy: number;
  // Hashed sub-cell offset for the shimmer and puff column, so a painted zone
  // reads as scattered smoke rather than a lattice of cell-centered dots.
  ox: number;
  oy: number;
  phase: number;
  puffs: Puff[];
}

interface RadiationSmokeProps {
  engine: Engine | null;
}

// Parse the radiation_map's "col,row" keys once per mutation instead of every
// frame. Rebuilt when the Set instance changes or the environment's
// radiation_version moves — size alone is not enough, because a rad storm's
// front adds one column and drops another in the same step, so it can sweep the
// whole world without the map ever changing size.
const buildCells = (map: Set<string>, cell_size: number): RadCell[] => {
  const out: RadCell[] = [];
  for (const key of map) {
    const comma = key.indexOf(',');
    const col = Number(key.slice(0, comma));
    const row = Number(key.slice(comma + 1));
    const h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
    const puffs: Puff[] = [];
    for (let i = 1; i <= PUFFS_PER_CELL; i++) {
      puffs.push({
        cycle: 2.5 + hash01(h + 101 * i) * 2.0,
        offset: hash01(h + 211 * i),
        color: SMOKE_COLORS[Math.floor(hash01(h + 307 * i) * SMOKE_COLORS.length)],
        sway: 0.75 + hash01(h + 401 * i) * 1.25,
      });
    }
    out.push({
      wx: col * cell_size + cell_size / 2,
      wy: row * cell_size + cell_size / 2,
      ox: (hash01(h + 509) - 0.5) * cell_size * 0.8,
      oy: (hash01(h + 613) - 0.5) * cell_size * 0.8,
      phase: hash01(h) * Math.PI * 2,
      puffs,
    });
  }
  return out;
};

const RadiationSmoke: React.FC<RadiationSmokeProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(engine);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    // Piggybacks on the floaties' static switch so one query param freezes
    // every decorative layer for zero-tolerance visual snapshots.
    const deterministic = new URLSearchParams(window.location.search).get('floaties') === 'static';

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    let cached_map: Set<string> | null = null;
    let cached_version = -1;
    let cells: RadCell[] = [];

    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const env = engineRef.current?.env;
      const map = env?.radiation_map;
      if (!env || !map || !map.size) {
        cached_map = map ?? null;
        cached_version = -1;
        cells = [];
        return;
      }

      const cell_size = env.renderer.cell_size;
      const version = env.radiation_version ?? 0;
      if (map !== cached_map || version !== cached_version) {
        cells = buildCells(map, cell_size);
        cached_map = map;
        cached_version = version;
      }

      const t = deterministic ? STATIC_T : performance.now() / 1000;
      const controller = env.controller;
      const scale = controller.scale || 1;
      const W = controller.canvas?.width || canvas.width;
      const H = controller.canvas?.height || canvas.height;
      const originX = (controller.pan_x || 0) + W / 2 - scale * (W / 2);
      const originY = (controller.pan_y || 0) + H / 2 - scale * (H / 2);

      const nightMult = env.is_night ? 0.55 : 1.0;
      // Same smoke-pixel sizing rule as the floaties' sprites.
      const px = Math.max(1, Math.round(Math.min(3.0, Math.max(0.5, Math.sqrt(scale)))));
      const cellPx = cell_size * scale;
      const riseHeight = RISE_CELLS * cellPx;
      // Frustum culling: puffs extend riseHeight above their cell, plus a
      // little slack for the wave sway.
      const cullMargin = riseHeight + 32;

      for (const cell of cells) {
        const sx = originX + cell.wx * scale;
        const sy = originY + cell.wy * scale;
        if (
          sx < -cullMargin ||
          sx > canvas.width + cullMargin ||
          sy < -cullMargin ||
          sy > canvas.height + cullMargin
        ) {
          continue;
        }

        // Breathing base haze over the cell footprint — far fainter than the
        // old flat 0.2 tint; the shimmer and smoke carry the rest.
        const breath = (0.07 + 0.04 * Math.sin(t * 1.5 + cell.phase)) * nightMult;
        ctx.fillStyle = `rgba(80, 255, 120, ${breath})`;
        ctx.fillRect(Math.floor(sx - cellPx / 2), Math.floor(sy - cellPx / 2), Math.ceil(cellPx), Math.ceil(cellPx));

        const vx = sx + cell.ox * scale; // scattered smoke-column origin
        const vy = sy + cell.oy * scale;

        // A bright shimmer pixel jittering with the same pixel-aligned wave
        // the floaties use, so dense zones read as a sparkling field.
        const shimmer = (0.2 + 0.1 * Math.sin(t * 2.1 + cell.phase)) * nightMult;
        const jitter = Math.round(Math.sin(t * 3.2 + cell.phase) * 0.75) * px;
        ctx.fillStyle = `rgba(190, 255, 190, ${shimmer})`;
        ctx.fillRect(Math.floor(vx) + jitter, Math.floor(vy), px, px);

        for (const puff of cell.puffs) {
          const p = (t / puff.cycle + puff.offset) % 1;
          const rise = p * riseHeight;
          // The floaties' travelling-wave wriggle, with the puff's height
          // standing in for the sprite row: as it rises it samples successive
          // rows of the wave and serpentines, staying on the pixel grid.
          const rowIdx = rise / px;
          const wave = Math.round(Math.sin(t * 3.2 + rowIdx * 0.75 + cell.phase) * puff.sway) * px;
          // Puffs thin out as they climb: fade in fast, then dissipate.
          const fade = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
          const alpha = 0.4 * fade * nightMult;
          // ...and spread: double up the pixel for the top half of the climb.
          const size = px * (p > 0.55 ? 2 : 1);
          ctx.fillStyle = `rgba(${puff.color}, ${alpha})`;
          ctx.fillRect(Math.floor(vx + wave - size / 2), Math.floor(vy - rise), size, size);
        }
      }
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        // Just under the floaties (40): dust drifts over the smoke, and both
        // stay under the HUD.
        zIndex: 39,
        pointerEvents: 'none',
      }}
    />
  );
};

export default RadiationSmoke;
