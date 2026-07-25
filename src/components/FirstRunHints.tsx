import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import type Organism from '../Organism/Organism';

/* First-run hints: after the demo world loads (see Utils/FirstRun), a few
   one-line labels fire on the world itself, each anchored to a real organism
   and tracking it through pan, zoom and its own movement. They point at what
   to look at -- they never block, and none of this mounts on later visits.

   Three hints, in order:
     1. meet     -- any lifeform (a mover if one is on screen): click to inspect.
     2. producer -- where the food economy comes from.
     3. evolved  -- fires when a species that did not exist at load shows up,
                    the payoff the demo world was chosen to deliver quickly.

   Anchoring reuses the deco/glow overlay camera: overlayCamera() maps world
   px to container px, and the env container is the full viewport. */

interface HintsProps {
  engine: Engine | null;
  active: boolean;
}

/* ?hintpace=fast compresses every timing so the whole sequence fits inside
   the repo's 15s Playwright budget -- same test-only URL pattern as
   ?floaties=static. */
const FAST = new URLSearchParams(window.location.search).get('hintpace') === 'fast';
const PACE = FAST ? 1 / 10 : 1;

const MEET_DELAY_MS = 2500 * PACE; // let the world register as alive before labeling it
const HINT_MS = 9000 * PACE;
const GAP_MS = 1500 * PACE;
const PICK_RETRY_MS = 1000 * PACE;
const PICK_ATTEMPTS = 8; // then skip the hint (e.g. a world with no producers)
const SCAN_INTERVAL_MS = 500 * PACE; // new-species scan cadence while waiting
const EVOLVED_GIVEUP_MS = 120000 * PACE;
// A label only anchors to an organism at least this far inside the viewport,
// so it never fires half off screen.
const EDGE_MARGIN = 80;

interface ActiveHint {
  text: string;
  org: Organism;
  until: number;
}

const FirstRunHints: React.FC<HintsProps> = ({ engine, active }) => {
  // Text/side are state (they change a handful of times); position is written
  // straight to the element every frame, like the canvas overlays.
  const [text, setText] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine || !active) return;
    const env = engine.env;

    // Everything below is per-arming session state, local to the effect.
    const t0 = performance.now();
    const worldOrganisms = env.organisms; // reset()/loadRaw() reassign this array
    const baseline = new Set<string>();
    for (const org of env.organisms)
      if (org.species) baseline.add(org.species.name);

    const queue: ('meet' | 'producer' | 'evolved')[] = ['meet', 'producer', 'evolved'];
    let current: ActiveHint | null = null;
    // The previous hint's anchor: never point two hints at the same creature.
    let lastAnchor: Organism | null = null;
    let nextAt = t0 + MEET_DELAY_MS;
    let attempts = 0;
    let lastScan = 0;
    let raf = 0;
    let done = false;

    const finish = () => {
      done = true;
      setText(null);
    };

    /* The closest qualifying organism to the viewport center, or null. Only
       living organisms comfortably on screen qualify -- the anchor has to be
       where the user is already looking. */
    const pick = (pred: (org: Organism) => boolean): Organism | null => {
      const cam = env.overlayCamera();
      if (!cam) return null;
      const cs = env.grid_map.cell_size;
      const vw = window.innerWidth, vh = window.innerHeight;
      let best: Organism | null = null;
      let bestD = Infinity;
      for (const org of env.organisms) {
        if (!org.living || org === lastAnchor || !pred(org)) continue;
        const sx = cam.ox + (org.c + 0.5) * cs * cam.s;
        const sy = cam.oy + (org.r + 0.5) * cs * cam.s;
        if (sx < EDGE_MARGIN || sx > vw - EDGE_MARGIN || sy < EDGE_MARGIN || sy > vh - EDGE_MARGIN)
          continue;
        const d = (sx - vw / 2) ** 2 + (sy - vh / 2) ** 2;
        if (d < bestD) { bestD = d; best = org; }
      }
      return best;
    };

    const show = (org: Organism, message: string, now: number) => {
      current = { text: message, org, until: now + HINT_MS };
      lastAnchor = org;
      queue.shift();
      attempts = 0;
      setText(message);
    };

    /* One attempt at starting the next queued hint; false means try again. */
    const tryStart = (kind: 'meet' | 'producer' | 'evolved', now: number): boolean => {
      if (kind === 'meet') {
        const org = pick(o => o.anatomy.is_mover) ?? pick(() => true);
        if (org) show(org, 'a lifeform — click it to look inside', now);
        return !!org;
      }
      if (kind === 'producer') {
        const org = pick(o => o.anatomy.is_producer && !o.anatomy.is_mover)
          ?? pick(o => o.anatomy.is_producer);
        if (org) show(org, 'a producer — it grows the food everything eats', now);
        return !!org;
      }
      // evolved: a species that did not exist when the demo world loaded
      const org = pick(o => !!o.species && !baseline.has(o.species.name) && o.anatomy.is_mover)
        ?? pick(o => !!o.species && !baseline.has(o.species.name));
      if (org)
        show(org, org.anatomy.is_mover
          ? 'just evolved a mover — it can walk'
          : 'a new species just branched off', now);
      return !!org;
    };

    const position = () => {
      const el = labelRef.current;
      if (!el || !current) return;
      const cam = env.overlayCamera();
      if (!cam) { el.style.visibility = 'hidden'; return; }
      const cs = env.grid_map.cell_size;
      const sx = cam.ox + (current.org.c + 0.5) * cs * cam.s;
      const sy = cam.oy + (current.org.r + 0.5) * cs * cam.s;
      const vw = window.innerWidth, vh = window.innerHeight;
      // Panned away? Keep the clock running but hide the label until it's back.
      if (sx < 0 || sx > vw || sy < 0 || sy > vh) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      // Measured, not guessed: flip to the anchor's left when the label would
      // run off the right edge (and the left side actually has the room).
      const w = el.offsetWidth;
      const flip = sx + 16 + w > vw - 8 && sx - 16 - w >= 8;
      setFlipped(flip);
      el.style.left = `${Math.round(sx + (flip ? -16 : 16))}px`;
      el.style.top = `${Math.round(Math.min(Math.max(sy, 60), vh - 60))}px`;
    };

    const frame = (now: number) => {
      if (done) return;
      // The world was reset or replaced under us: stop narrating it.
      if (env.organisms !== worldOrganisms) { finish(); return; }

      if (current) {
        if (now >= current.until || !current.org.living) {
          current = null;
          setText(null);
          nextAt = now + GAP_MS;
        } else {
          position();
        }
      } else if (queue.length === 0) {
        finish();
        return;
      } else if (queue[0] === 'evolved') {
        if (now - t0 > EVOLVED_GIVEUP_MS) { finish(); return; }
        if (now >= nextAt && now - lastScan >= SCAN_INTERVAL_MS) {
          lastScan = now;
          tryStart('evolved', now);
        }
      } else if (now >= nextAt) {
        if (!tryStart(queue[0], now)) {
          if (++attempts >= PICK_ATTEMPTS) { queue.shift(); attempts = 0; }
          nextAt = now + PICK_RETRY_MS;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [engine, active]);

  if (!text) return null;

  return (
    <div
      ref={labelRef}
      className={`${styles.worldHint} ${flipped ? styles.worldHintFlip : ''}`}
      data-testid="first-run-hint"
    >
      {!flipped && <span className={styles.worldHintArrow}>←</span>}
      <span>{text}</span>
      {flipped && <span className={styles.worldHintArrow}>→</span>}
    </div>
  );
};

export default FirstRunHints;
