import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import type Organism from '../Organism/Organism';

/* First-run hints: on the very first visit (see Utils/FirstRun), a few
   one-line labels fire on the world itself, each anchored to a real organism
   and tracking it through pan, zoom and its own movement. They point at what
   to look at -- they never block, and none of this mounts on later visits.

   They narrate the origin world, which starts as one three-cell organism in
   its dish, so the three hints tell that story in order:
     1. meet     -- the founder: click it to look inside.
     2. producer -- where the food economy comes from. On a world this sparse
                    the founder may still be the only candidate, so this hint
                    can fall back to re-anchoring on it (see REPEAT_AFTER).
     3. evolved  -- fires when a species that did not exist at arm time shows
                    up: the first branch off the founder, which is the whole
                    point of watching.

   Anchoring reuses the deco/glow overlay camera: overlayCamera() maps world
   px to container px, and the env container is the full viewport. */

interface HintsProps {
  engine: Engine | null;
  active: boolean;
}

/* ?hintpace=fast compresses every wall-clock timing so the whole sequence fits
   inside the repo's 15s Playwright budget -- same test-only URL pattern as
   ?floaties=static. It does not touch EVOLVED_GIVEUP_TICKS; see below. */
const FAST = new URLSearchParams(window.location.search).get('hintpace') === 'fast';
const PACE = FAST ? 1 / 10 : 1;

const MEET_DELAY_MS = 2500 * PACE; // let the world register as alive before labeling it
const HINT_MS = 9000 * PACE;
const GAP_MS = 1500 * PACE;
const PICK_RETRY_MS = 1000 * PACE;
const PICK_ATTEMPTS = 8; // then skip the hint (e.g. a world with no producers)
/* Attempts spent looking for an organism the previous hint did not already
   point at, before settling for that same one. The origin world can genuinely
   hold a single organism for a while. */
const REPEAT_AFTER = 4;
const SCAN_INTERVAL_MS = 500 * PACE; // new-species scan cadence while waiting
/* The evolved hint waits on the simulation, not the clock: pausing to click
   the founder -- which is exactly what hint 1 asks for -- must not spend its
   budget, and neither should a slow speed setting. Deliberately *not* scaled
   by PACE, unlike every constant above: ?hintpace=fast compresses wall-clock
   waits, but a species takes the ticks it takes, and the test buys them by
   running the sim faster instead.

   3000 clears the measured worst case with room to spare: over 15 origin-world
   runs (scripts/measure-origin-world.js) the first non-founder species arrived
   between 54 and 1103 ticks, median ~330. At the default Play speed that is
   about 100 seconds of watching. */
const EVOLVED_GIVEUP_TICKS = 3000;
// A label only anchors to an organism at least this far inside the viewport,
// so it never fires half off screen.
const EDGE_MARGIN = 80;

type HintKind = 'meet' | 'producer' | 'evolved';

interface ActiveHint {
  text: string;
  org: Organism;
  until: number;
  kind: HintKind; // kept so a dead anchor can be replaced with another like it
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
    const tick0 = env.total_ticks;
    const worldOrganisms = env.organisms; // reset()/loadRaw() reassign this array
    const baseline = new Set<string>();
    for (const org of env.organisms)
      if (org.species) baseline.add(org.species.name);

    const queue: HintKind[] = ['meet', 'producer', 'evolved'];
    let current: ActiveHint | null = null;
    /* The previous hint's anchor. Two hints avoid pointing at the same
       creature where there is a choice -- on this world there often isn't, so
       it is a preference rather than a rule (see anchorFor's allowRepeat). */
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
    const pick = (pred: (org: Organism) => boolean, allowRepeat = false): Organism | null => {
      const cam = env.overlayCamera();
      if (!cam) return null;
      const cs = env.grid_map.cell_size;
      const vw = window.innerWidth, vh = window.innerHeight;
      let best: Organism | null = null;
      let bestD = Infinity;
      for (const org of env.organisms) {
        if (!org.living || (org === lastAnchor && !allowRepeat) || !pred(org)) continue;
        const sx = cam.ox + (org.c + 0.5) * cs * cam.s;
        const sy = cam.oy + (org.r + 0.5) * cs * cam.s;
        if (sx < EDGE_MARGIN || sx > vw - EDGE_MARGIN || sy < EDGE_MARGIN || sy > vh - EDGE_MARGIN)
          continue;
        const d = (sx - vw / 2) ** 2 + (sy - vh / 2) ** 2;
        if (d < bestD) { bestD = d; best = org; }
      }
      return best;
    };

    /* What each hint will point at, most-wanted candidate first. The last
       entry is the one it settles for. */
    const candidates = (kind: HintKind): ((org: Organism) => boolean)[] => {
      if (kind === 'meet')
        return [o => o.anatomy.is_mover, () => true];
      if (kind === 'producer')
        return [o => o.anatomy.is_producer && !o.anatomy.is_mover, o => o.anatomy.is_producer];
      // evolved: a species that did not exist when the hints armed
      return [o => !!o.species && !baseline.has(o.species.name)];
    };

    /* The organism a hint should anchor to, or null. Preference order is tried
       against fresh organisms first; only then, and only with permission, will
       it settle for the one the previous hint already used. */
    const anchorFor = (kind: HintKind, allowRepeat: boolean): Organism | null => {
      const preds = candidates(kind);
      for (const pred of preds) {
        const org = pick(pred);
        if (org) return org;
      }
      if (!allowRepeat) return null;
      for (const pred of preds) {
        const org = pick(pred, true);
        if (org) return org;
      }
      return null;
    };

    const textFor = (kind: HintKind, org: Organism): string => {
      if (kind === 'meet') return 'your first lifeform — click it to look inside';
      if (kind === 'producer') return 'a producer — it grows the food everything eats';
      return org.anatomy.is_mover
        ? 'just evolved a mover — it can walk'
        : 'a new species just branched off';
    };

    const show = (org: Organism, kind: HintKind, now: number) => {
      const message = textFor(kind, org);
      current = { text: message, org, until: now + HINT_MS, kind };
      lastAnchor = org;
      queue.shift();
      attempts = 0;
      setText(message);
    };

    /* One attempt at starting the next queued hint; false means try again.

       The founder is itself a producer (OriginOfLife gives it two producer
       cells), so once we have waited long enough for a child to appear,
       pointing at the founder a second time still teaches the right thing --
       better than dropping the hint on a world that only holds one. The
       evolved hint gets the same licence immediately: it has no retry counter
       (frame() rescans it instead), and the alternative is not firing at all. */
    const tryStart = (kind: HintKind, now: number): boolean => {
      const org = anchorFor(kind, kind === 'evolved' || attempts >= REPEAT_AFTER);
      if (org) show(org, kind, now);
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
        if (now >= current.until) {
          current = null;
          setText(null);
          nextAt = now + GAP_MS;
        } else if (!current.org.living) {
          /* The anchor died with time still on the clock. Organisms here are
             short-lived by design, and often enough that reduced a hint to a
             flash too brief to read, so move the label to another organism
             that makes the same point rather than dropping the hint. */
          const replacement = anchorFor(current.kind, true);
          if (replacement) {
            current.org = replacement;
            lastAnchor = replacement;
            position();
          } else {
            current = null;
            setText(null);
            nextAt = now + GAP_MS;
          }
        } else {
          position();
        }
      } else if (queue.length === 0) {
        finish();
        return;
      } else if (queue[0] === 'evolved') {
        if (env.total_ticks - tick0 > EVOLVED_GIVEUP_TICKS) { finish(); return; }
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
