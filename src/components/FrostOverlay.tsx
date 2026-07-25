import React, { useEffect, useRef } from 'react';
import type Engine from '../Engine';

// The ice age made visible: a cold blue wash over the screen and pixel snow
// falling the whole time the event runs. Pure decoration on its own
// click-transparent layer — the famine itself is just the foodProdProb crash
// in WorldEnvironment.
//
// The wash is screen-space — the freeze is the world's weather and the screen
// is the window you watch it through — but the snow lives in world
// coordinates, projected through the controller's *raw* pan/zoom like
// RadiationSmoke: flakes hang in the air over the dish, so they must grow
// when you zoom in and slide when you pan, or the layer reads as a sticker on
// the glass. The snowfield is an endless tiling of one TILE-sized pattern
// rather than a patch cut to the world's bounding box: the box is bigger than
// the dish and its edge is nothing — snow stopping at it would draw a
// rectangle in the void that isn't the border of anything.
//
// Flakes are stateless pure functions of (time, index, tile), so there are no
// particles to allocate or age, and ?floaties=static freezes the clock for
// the visual suite.

// How hard the wash leans on the screen at full strength.
const TINT_ALPHA = 0.12;

// The repeating snowfield tile, in world px, and its density: one flake per
// this many world px² (at 100% zoom that is also screen px²). Each tile
// instance re-jitters phase and column by a tile-coordinate hash, so the
// repetition never lines up to the eye.
const TILE = 640;
const PX_PER_FLAKE = 2400;
// Zoomed far out, the visible tile count explodes; past this many drawn
// flakes the instance loop strides over the pattern instead. At those zooms a
// flake is a 1px dot, so thinning is invisible where it happens.
const MAX_DRAWS = 800;

// Fall speed range, in cell heights per second.
const FALL_MIN = 2.0;
const FALL_MAX = 4.5;

// Pale ice palette; mostly white with the odd blue flake for depth.
const SNOW_COLORS = [
  '255, 255, 255',
  '215, 238, 255',
  '170, 215, 255',
];

// Fade time constant, in seconds. The event snaps on and off in the sim; the
// weather rolling in and thawing out over a couple of seconds is what sells
// it — and it covers early ends too (a bloom cancels the ice age outright).
const FADE_TAU = 0.8;

// The same frozen clock Floaties and RadiationSmoke use in static mode.
const STATIC_T = 12.34;

// Deterministic integer scramble -> [0, 1), shared idiom with RadiationSmoke:
// per-flake variety must be a pure function of the index so a flake's path is
// stable across frames.
const hash01 = (n: number): number => {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

interface Flake {
  x0: number;      // world px column within the tile
  drift: number;   // diagonal lean, world px over a full fall
  period: number;  // seconds per full fall through the tile
  offset: number;  // where in the loop it starts
  sway: number;    // horizontal wave amplitude, in snow pixels
  phase: number;
  color: string;
  alpha: number;
  big: boolean;    // a few flakes render at double size for depth
}

const buildFlakes = (cell_size: number): Flake[] => {
  const count = Math.round((TILE * TILE) / PX_PER_FLAKE);
  const flakes: Flake[] = [];
  for (let i = 0; i < count; i++) {
    const speed = (FALL_MIN + hash01(i * 127 + 1) * (FALL_MAX - FALL_MIN)) * cell_size;
    flakes.push({
      x0: hash01(i * 127 + 31) * TILE,
      drift: (hash01(i * 127 + 47) - 0.5) * TILE * 0.2,
      period: TILE / speed,
      offset: hash01(i * 127 + 61),
      sway: 0.75 + hash01(i * 127 + 83) * 1.5,
      phase: hash01(i * 127 + 101) * Math.PI * 2,
      color: SNOW_COLORS[Math.floor(hash01(i * 127 + 113) * SNOW_COLORS.length)],
      alpha: 0.4 + hash01(i * 127 + 131) * 0.4,
      big: hash01(i * 127 + 149) < 0.25,
    });
  }
  return flakes;
};

interface FrostOverlayProps {
  engine: Engine | null;
}

const FrostOverlay: React.FC<FrostOverlayProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(engine);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const deterministic = new URLSearchParams(window.location.search).get('floaties') === 'static';

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    let flakes: Flake[] = [];
    let flake_cell_size = 0;
    let intensity = 0;
    let last_now = performance.now();

    const tick = () => {
      raf = requestAnimationFrame(tick);

      const now = performance.now();
      const dt = Math.min(0.1, (now - last_now) / 1000);
      last_now = now;

      const env = engineRef.current?.env;
      const active = Boolean(env?.active_events.some(e => e.kind === 'iceage'));
      // Mirror the sim state onto the element so tests (and curious devtools)
      // can see it without sampling pixels mid-fade.
      canvas.dataset.frost = active ? 'true' : 'false';

      /* The event snaps on/off; the weather eases. In static mode the fade
         would leave snapshots at the mercy of frame timing, so snap there. */
      const target = active ? 1 : 0;
      intensity = deterministic ? target : intensity + (target - intensity) * (1 - Math.exp(-dt / FADE_TAU));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!env || intensity < 0.01) {
        intensity = target === 0 ? 0 : intensity;
        return;
      }

      const cell_size = env.renderer.cell_size;
      if (cell_size !== flake_cell_size) {
        flakes = buildFlakes(cell_size);
        flake_cell_size = cell_size;
      }

      const t = deterministic ? STATIC_T : now / 1000;
      const nightMult = env.is_night ? 0.55 : 1.0;

      // Cold wash over the whole screen, the same register as the night filter.
      ctx.fillStyle = `rgba(140, 190, 255, ${TINT_ALPHA * intensity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const controller = env.controller;
      const scale = controller.scale || 1;
      const W = controller.canvas?.width || canvas.width;
      const H = controller.canvas?.height || canvas.height;
      const originX = (controller.pan_x || 0) + W / 2 - scale * (W / 2);
      const originY = (controller.pan_y || 0) + H / 2 - scale * (H / 2);

      // The tile range covering the viewport, in world coordinates.
      const kx0 = Math.floor((0 - originX) / scale / TILE);
      const kx1 = Math.floor((canvas.width - originX) / scale / TILE);
      const ky0 = Math.floor((0 - originY) / scale / TILE);
      const ky1 = Math.floor((canvas.height - originY) / scale / TILE);
      const tiles = (kx1 - kx0 + 1) * (ky1 - ky0 + 1);
      const stride = Math.max(1, Math.ceil((tiles * flakes.length) / MAX_DRAWS));

      // Same smoke-pixel sizing rule as the floaties' sprites.
      const px = Math.max(1, Math.round(Math.min(3.0, Math.max(0.5, Math.sqrt(scale)))));

      for (let ky = ky0; ky <= ky1; ky++) {
        for (let kx = kx0; kx <= kx1; kx++) {
          // Decorrelates this tile's copy of the pattern: shifts every
          // flake's phase and column, and rotates which flakes survive the
          // stride, so neighbouring tiles never mirror each other.
          const seed = hash01(Math.imul(kx, 92821) + Math.imul(ky, 68917));
          for (let i = Math.floor(seed * stride); i < flakes.length; i += stride) {
            const flake = flakes[i];
            const p = (t / flake.period + flake.offset + seed) % 1;
            const wy = ky * TILE + p * TILE;
            const wx = kx * TILE + ((((flake.x0 + seed * TILE + flake.drift * p) % TILE) + TILE) % TILE);

            const sx = originX + wx * scale;
            const sy = originY + wy * scale;
            if (sx < -8 || sx > canvas.width + 8 || sy < -8 || sy > canvas.height + 8) continue;

            // The floaties' travelling-wave wriggle, sampled by fall height,
            // so a flake serpentines down on the pixel grid instead of
            // dropping straight.
            const rowIdx = (wy * scale) / px;
            const wave = Math.round(Math.sin(t * 2.6 + rowIdx * 0.55 + flake.phase) * flake.sway) * px;
            // Ease in at the top of the fall and melt out at the bottom, so
            // the wrap back to the tile top never pops.
            const fade = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;

            // One notch chunkier than the smoke's puffs: a 1px flake at
            // default zoom reads as a stuck star, 2px reads as snow.
            const size = px * (flake.big ? 2 : 1) + 1;
            ctx.fillStyle = `rgba(${flake.color}, ${flake.alpha * fade * intensity * nightMult})`;
            ctx.fillRect(Math.floor(sx + wave - size / 2), Math.floor(sy), size, size);
          }
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
      data-testid="frost-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        // Under the radiation smoke (39) and floaties (40): snow is the
        // furthest backdrop of the decorative stack, and all stay under the HUD.
        zIndex: 38,
        pointerEvents: 'none',
      }}
    />
  );
};

export default FrostOverlay;
