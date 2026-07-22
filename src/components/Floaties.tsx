import React, { useEffect, useRef } from 'react';
import type Engine from '../Engine';

// Ambient "microscope dust": faint motes drifting over the world that shy
// away from the cursor. Pure decoration on its own click-transparent layer.
//
// Motes are positioned in world space (the env canvas' untransformed bitmap
// coords) and projected through the same camera the world canvas uses, so they
// sit at a fixed depth in the dish rather than being pasted onto the screen.
// The camera is read straight off the controller each frame instead of through
// useEngineValue: the controller never emits on pan/zoom, and the engine's own
// emits are throttled to 100ms, which would make the dust stutter behind a drag.
const NUM_MOTES = 80;

const PAN_STIFFNESS = 0.10;
const PAN_DAMPING = 0.6;
const SPRING_SPREAD = 0.83;
const SWOOSH = 1.5;

const DISC_ENERGY = 0.08;
const DISC_FALLOFF = 1.15;

const PALETTE = [
  '0, 240, 255',   // Electric Cyan
  '80, 255, 120',  // Neon Lime
  '255, 60, 180',  // Vibrant Magenta
  '180, 90, 255',  // Glowing Violet
  '255, 200, 50',  // Bright Amber
  '210, 245, 255', // Ice Blue / White
  '255, 110, 60',  // Coral Orange
  '60, 220, 255',  // Sky Blue
];

const SPRITES: Record<string, number[][]> = {
  // --- Small & Medium Floaties ---
  dot: [
    [1, 1],
    [1, 1],
  ],
  cross: [
    [0, 1, 0],
    [1, 2, 1],
    [0, 1, 0],
  ],
  diamond: [
    [0, 0, 1, 0, 0],
    [0, 1, 2, 1, 0],
    [1, 2, 2, 2, 1],
    [0, 1, 2, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  ring: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  bacillus: [
    [0, 1, 1, 0],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [0, 1, 1, 0],
  ],
  squiggle: [
    [1, 1, 0, 0, 0, 0],
    [0, 1, 2, 0, 0, 0],
    [0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 2, 0],
    [0, 0, 0, 0, 1, 1],
  ],
  spirillum: [
    [0, 1, 1, 0, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 2, 0, 0],
    [0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0, 1, 1],
  ],
  cluster: [
    [1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0, 0],
  ],
  // --- Large & Giant Pixel Organisms ---
  giant_amoeba: [
    [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0],
    [1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1],
    [1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1],
    [0, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  ],
  giant_paramecium: [
    [0, 0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 2, 2, 2, 1, 0, 0],
    [0, 1, 1, 2, 2, 2, 1, 1, 0],
    [1, 1, 2, 2, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 1, 1, 2, 1, 1],
    [1, 1, 2, 1, 0, 0, 1, 1, 1],
    [0, 1, 1, 2, 1, 1, 2, 1, 0],
    [0, 1, 1, 2, 2, 2, 1, 1, 0],
    [0, 0, 1, 2, 2, 2, 1, 0, 0],
    [0, 0, 1, 1, 2, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
  ],
  giant_radiolarian: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 2, 2, 2, 1, 0, 0],
    [1, 1, 1, 2, 2, 2, 1, 1, 1],
    [0, 0, 1, 2, 2, 2, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
  ],
  big_flagellate: [
    [0, 0, 1, 1, 1, 0, 0],
    [0, 1, 2, 2, 2, 1, 0],
    [1, 1, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 2, 1, 1],
    [0, 1, 1, 2, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0],
  ],
  big_filament: [
    [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
    [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  ],
};

const GIANT_SPRITES = ['giant_amoeba', 'giant_paramecium', 'giant_radiolarian', 'big_flagellate', 'big_filament'];
const REGULAR_SPRITES = Object.keys(SPRITES).filter(k => !GIANT_SPRITES.includes(k));

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  pan_x: number;
  pan_y: number;
  pvx: number;
  pvy: number;
  stiffness: number;
  spriteName: string;
  color: string;
  basePixelSize: number;
  isGiant: boolean;
}

interface FloatiesProps {
  engine: Engine | null;
}

const wrap = (v: number, lo: number, hi: number) => {
  const span = hi - lo;
  if (!(span > 0)) return v;
  return lo + ((((v - lo) % span) + span) % span);
};

// Deterministic PRNG (mulberry32). Only used in the test-only "static" mode
// below, so visual snapshots don't flake on the random mote layout; production
// keeps Math.random for organic variety.
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The frozen clock used in static mode: any constant works, it just has to be
// the same every run so the wriggle/pulse phase is reproducible.
const STATIC_T = 12.34;

const drawPixelSprite = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  matrix: number[][],
  pixelSize: number,
  color: string,
  alpha: number,
  pulseFactor: number = 1.0,
  t: number = 0,
  phase: number = 0
) => {
  const height = matrix.length;
  const width = matrix[0].length;
  const startX = Math.floor(px - (width * pixelSize) / 2);
  const startY = Math.floor(py - (height * pixelSize) / 2);

  // Organic pixel-aligned travelling wave wriggle
  const wriggleWave = (r: number) =>
    Math.round(Math.sin(t * 3.2 + r * 0.75 + phase) * 0.75) * pixelSize;

  for (let r = 0; r < height; r++) {
    const rowOffset = wriggleWave(r);
    for (let c = 0; c < width; c++) {
      const val = matrix[r][c];
      if (val === 0) continue;
      if (val === 2) {
        // Faint, subtle organelle core glow
        const coreAlpha = Math.min(0.4, alpha * 1.3 * pulseFactor);
        ctx.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
      } else {
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
      }
      ctx.fillRect(
        startX + c * pixelSize + rowOffset,
        startY + r * pixelSize,
        pixelSize,
        pixelSize
      );
    }
  }
};

const Floaties: React.FC<FloatiesProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(engine);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const mouse = { x: -1000, y: -1000 };

    // Test-only static mode: the harness loads the page with ?floaties=static
    // to pin the layout (seeded RNG) and freeze all motion, so zero-tolerance
    // visual snapshots don't flake on drifting dust. Untouched in production.
    const deterministic = new URLSearchParams(window.location.search).get('floaties') === 'static';
    const rand = deterministic ? mulberry32(0xc0ffee) : Math.random;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const motes: Mote[] = Array.from({ length: NUM_MOTES }, (_, i) => {
      const isGiant = i % 4 === 0;
      const spriteList = isGiant ? GIANT_SPRITES : REGULAR_SPRITES;
      const spriteName = spriteList[Math.floor(rand() * spriteList.length)];

      const basePixelSize = isGiant
        ? Math.floor(2 + rand() * 2)
        : Math.floor(1 + rand() * 2);

      return {
        x: rand() * canvas.width,
        y: rand() * canvas.height,
        r: isGiant ? 3.0 + rand() * 2 : 0.8 + rand() * 2.0,
        // Slow ambient drift
        vx: (rand() - 0.5) * (isGiant ? 0.05 : 0.10),
        vy: (rand() - 0.5) * (isGiant ? 0.05 : 0.10),
        phase: rand() * Math.PI * 2,
        pan_x: 0,
        pan_y: 0,
        pvx: 0,
        pvy: 0,
        stiffness: PAN_STIFFNESS * (1 + (rand() - 0.5) * SPRING_SPREAD),
        spriteName,
        color: PALETTE[Math.floor(rand() * PALETTE.length)],
        basePixelSize,
        isGiant,
      };
    });

    let seeded = false;
    let prev_pan_x = 0;
    let prev_pan_y = 0;
    let prev_scale = 1;

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = deterministic ? STATIC_T : performance.now() / 1000;

      const controller = engineRef.current?.env?.controller;
      const scale = controller?.scale || 1;
      const pan_x = controller?.pan_x || 0;
      const pan_y = controller?.pan_y || 0;
      const W = controller?.canvas?.width || canvas.width;
      const H = controller?.canvas?.height || canvas.height;

      if (!seeded) {
        for (const m of motes) {
          m.pan_x = pan_x;
          m.pan_y = pan_y;
        }
        prev_pan_x = pan_x;
        prev_pan_y = pan_y;
        prev_scale = scale;
        seeded = true;
      }

      if (scale !== prev_scale) {
        const zoom_dx = pan_x - prev_pan_x;
        const zoom_dy = pan_y - prev_pan_y;
        for (const m of motes) {
          m.pan_x += zoom_dx;
          m.pan_y += zoom_dy;
        }
      }
      prev_pan_x = pan_x;
      prev_pan_y = pan_y;
      prev_scale = scale;

      // Significantly expanded world wrapping bounds (2000px margin) so floaties
      // cover a massive space around the dish without popping in at visible edges.
      const margin = 2000;
      const left = -margin;
      const right = W + margin;
      const top = -margin;
      const bottom = H + margin;

      const isNight = Boolean(engineRef.current?.env?.is_night);
      const nightMult = isNight ? 0.55 : 1.0;

      for (const m of motes) {
        m.pvx = (m.pvx + (pan_x - m.pan_x) * m.stiffness) * PAN_DAMPING;
        m.pvy = (m.pvy + (pan_y - m.pan_y) * m.stiffness) * PAN_DAMPING;
        m.pan_x += m.pvx;
        m.pan_y += m.pvy;
        const mOriginX = m.pan_x + W / 2 - scale * (W / 2);
        const mOriginY = m.pan_y + H / 2 - scale * (H / 2);

        // Slow, gentle floating motion. Frozen in static mode so the motes
        // hold their seeded positions and the snapshot is reproducible.
        if (!deterministic) {
          m.x += (m.vx + Math.sin(t * 0.3 + m.phase) * 0.03) / scale;
          m.y += (m.vy + Math.cos(t * 0.25 + m.phase) * 0.03) / scale;
        }

        // Wrap against the expanded world extent
        m.x = wrap(m.x, left, right);
        m.y = wrap(m.y, top, bottom);

        let sx = mOriginX + m.x * scale;
        let sy = mOriginY + m.y * scale;

        // Frustum culling: Only draw motes currently visible on screen
        const renderMargin = 160;
        if (
          sx < -renderMargin ||
          sx > canvas.width + renderMargin ||
          sy < -renderMargin ||
          sy > canvas.height + renderMargin
        ) {
          continue;
        }

        // Gentle mouse interaction
        const dx = sx - mouse.x;
        const dy = sy - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 50 && dist > 0.01) {
          const push = ((50 - dist) / 50) * 0.35;
          m.x += ((dx / dist) * push) / scale;
          m.y += ((dy / dist) * push) / scale;
          sx += (dx / dist) * push;
          sy += (dy / dist) * push;
        }

        const rawPixelSize = m.basePixelSize * Math.min(3.0, Math.max(0.5, Math.sqrt(scale)));
        const pixelSize = Math.max(1, Math.round(rawPixelSize));
        const matrix = SPRITES[m.spriteName] || SPRITES.dot;

        // Translucent ambient opacities scaled by night mode
        const baseAlpha = (m.isGiant
          ? Math.min(0.08, Math.max(0.025, (DISC_ENERGY / Math.pow(m.r, DISC_FALLOFF)) * 0.8))
          : Math.min(0.14, Math.max(0.04, (DISC_ENERGY / Math.pow(m.r, DISC_FALLOFF)) * 1.1))) * nightMult;

        const pulseFactor = 0.9 + Math.sin(t * 1.2 + m.phase) * 0.15;

        const tx = -m.pvx * SWOOSH;
        const ty = -m.pvy * SWOOSH;
        const len = Math.hypot(tx, ty);
        const samples = Math.min(
          10,
          Math.max(1, Math.round(len / (pixelSize * 3.0)))
        );
        const sampleAlpha = baseAlpha / Math.sqrt(samples);

        for (let i = 0; i < samples; i++) {
          const f = samples === 1 ? 0 : i / (samples - 1);
          drawPixelSprite(
            ctx,
            sx + tx * f,
            sy + ty * f,
            matrix,
            pixelSize,
            m.color,
            sampleAlpha * (1 - f * 0.4),
            pulseFactor,
            t,
            m.phase
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    />
  );
};

export default Floaties;
