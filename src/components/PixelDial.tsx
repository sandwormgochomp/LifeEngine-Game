import React, { useRef } from 'react';
import styles from './styles/EvolutionConsole.module.css';

/* The chunky pixel gauge from concepts/evolution-window-options.html, made into
   a real control. PixelSlider's sibling: same job — one number, themed — but a
   dial reads as machinery you operate rather than as a preference you set,
   which is the whole point of overhaul 1.

   It is a control, not a decoration, so it carries the same contract a range
   input would: role="slider", the three aria-value attributes, focusable, and
   arrow keys that move it. Pointer drag is the fun path; the keyboard is the
   one that has to work. */

/* The face's sweep, in degrees clockwise from straight up. -140 puts the
   minimum stop at the lower left and +120 the maximum at the lower right,
   leaving a 100-degree blind spot at the bottom where a needle would have to
   pass through both stops to get anywhere. The conic gradients in the CSS are
   authored from the same origin (-140 + 360 = 220deg). */
const SWEEP_START = -140;
const SWEEP_DEG = 260;
const GRADIENT_FROM = SWEEP_START + 360;

/* One arrow press moves the needle 2% of its travel. Expressed as a fraction
   of the sweep rather than in parameter units because the two dials that share
   this component disagree wildly about what "one unit" is worth — 1 on
   globalMutability is a fifth of the default, 1 on lifespanMultiplier is a
   hundredth. */
const KEY_STEP = 0.02;

/* How a value maps onto the sweep. Split out because a linear angle is useless
   over a range like lifespanMultiplier's 1..10000 — the entire habitable band
   (50..400) would live in the first three degrees of the arc. */
export interface DialScale {
  toFraction(value: number): number;
  fromFraction(fraction: number): number;
}

export function linearScale(min: number, max: number): DialScale {
  return {
    toFraction: value => (max > min ? (value - min) / (max - min) : 0),
    fromFraction: f => min + f * (max - min),
  };
}

/* Geometric: equal angles are equal *ratios*, so 1..10000 gives a quarter turn
   each to 1..10, 10..100, 100..1000 and 1000..10000. Both bounds must be above
   zero — a log dial has no bottom, so any parameter that legitimately means
   zero gets a linear one instead. */
export function logScale(min: number, max: number): DialScale {
  const lo = Math.log(min);
  const span = Math.log(max) - lo;
  return {
    toFraction: value => (span > 0 ? (Math.log(Math.max(value, min)) - lo) / span : 0),
    fromFraction: f => Math.exp(lo + f * span),
  };
}

export interface PixelDialProps {
  /** Goes on the face — the focusable element — so a test can drive the control itself */
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Quantisation of the emitted value, in parameter units */
  step?: number;
  scale?: DialScale;
  /** Fraction of the sweep past which the arc turns red */
  dangerFrom?: number;
  format?: (value: number) => string;
  /** Consequence line under the readout — always visible, never a tooltip */
  hint?: string;
  /** Short state word beside the name (EVOLVED / MANUAL) */
  badge?: string;
  badgeAlert?: boolean;
  title?: string;
  onChange: (value: number) => void;
  children?: React.ReactNode;
}

const clamp01 = (f: number) => (f < 0 ? 0 : f > 1 ? 1 : f);

const PixelDial: React.FC<PixelDialProps> = ({
  id, label, value, min, max, step, scale, dangerFrom = 0.75,
  format, hint, badge, badgeAlert, title, onChange, children,
}) => {
  const faceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const mapping = scale ?? linearScale(min, max);

  const quantize = (raw: number): number => {
    const bounded = Math.min(max, Math.max(min, raw));
    if (!step) return bounded;
    const snapped = min + Math.round((bounded - min) / step) * step;
    // Float steps (0.5, 0.1) otherwise leak 0.30000000000000004 into Hyperparams
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
  };

  const fraction = clamp01(mapping.toFraction(value));
  const commit = (f: number) => {
    const next = quantize(mapping.fromFraction(clamp01(f)));
    if (next !== value) onChange(next);
  };

  /* Step outwards until the quantised value actually changes. Near the bottom
     of a log scale a single 2% press moves less than one whole step and would
     round straight back to where it started, jamming the dial at its minimum. */
  const nudge = (delta: number) => {
    for (let f = fraction + delta; delta > 0 ? f <= 1 : f >= 0; f += delta) {
      const next = quantize(mapping.fromFraction(clamp01(f)));
      if (next !== value) {
        onChange(next);
        return;
      }
    }
    const edge = quantize(mapping.fromFraction(delta > 0 ? 1 : 0));
    if (edge !== value) onChange(edge);
  };

  /* Pointer angle, measured the same way the sweep is. atan2(dx, -dy) is
     clockwise from straight up, so subtracting SWEEP_START lands a point
     inside the face's arc in 0..SWEEP_DEG. */
  const fractionFromPointer = (clientX: number, clientY: number): number => {
    const face = faceRef.current;
    if (!face) return fraction;
    const rect = face.getBoundingClientRect();
    const deg = (Math.atan2(clientX - (rect.left + rect.width / 2), (rect.top + rect.height / 2) - clientY) * 180) / Math.PI;
    let offset = deg - SWEEP_START;
    if (offset < 0) offset += 360;
    if (offset <= SWEEP_DEG) return offset / SWEEP_DEG;
    // In the blind spot behind the stops: snap to whichever stop is nearer
    return offset < SWEEP_DEG + (360 - SWEEP_DEG) / 2 ? 1 : 0;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    dragging.current = true;
    commit(fractionFromPointer(e.clientX, e.clientY));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) commit(fractionFromPointer(e.clientX, e.clientY));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': nudge(KEY_STEP); break;
      case 'ArrowLeft': case 'ArrowDown': nudge(-KEY_STEP); break;
      case 'PageUp': nudge(KEY_STEP * 5); break;
      case 'PageDown': nudge(-KEY_STEP * 5); break;
      case 'Home': commit(0); break;
      case 'End': commit(1); break;
      default: return;
    }
    e.preventDefault();
  };

  const inDanger = fraction >= dangerFrom;
  const faceVars = {
    '--dial-from': `${GRADIENT_FROM}deg`,
    '--dial-sweep': `${SWEEP_DEG}deg`,
    '--dial-arc': `${fraction * SWEEP_DEG}deg`,
    '--dial-danger': `${dangerFrom * SWEEP_DEG}deg`,
    '--dial-needle': `${SWEEP_START + fraction * SWEEP_DEG}deg`,
  } as React.CSSProperties;

  return (
    <div className={styles.dial}>
      <div
        ref={faceRef}
        id={id}
        className={`${styles.dialFace} ${inDanger ? styles.dialFaceDanger : ''}`}
        style={faceVars}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={format ? format(value) : undefined}
        title={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className={styles.dialNeedle}></div>
        <div className={styles.dialHub}></div>
      </div>
      <div className={styles.dialName}>
        {label}
        {badge && (
          <span
            data-testid={id ? `${id}-badge` : undefined}
            className={`${styles.dialBadge} ${badgeAlert ? styles.dialBadgeAlert : ''}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className={styles.dialValue}>{format ? format(value) : value}</div>
      {hint && <div className={styles.dialHint}>{hint}</div>}
      {children}
    </div>
  );
};

export default PixelDial;
