/* First-run legibility: the very first visit skips the blank OriginOfLife
   world and opens on a curated bundled world already mid-drama, so something
   interesting happens inside the first minute of just watching. A handful of
   world-anchored hints (FirstRunHints) then point at what to look at.

   This is deliberately not a tutorial: nothing blocks, nothing must be
   clicked, and none of it ever appears again once the flag is written. */

import Hyperparams from '../Hyperparameters';
import type Engine from '../Engine';

const DONE_KEY = 'life_engine.first_run_done';

/* Chosen by measurement, not taste (scripts/audition-worlds.js). All 20
   bundled worlds were auditioned for one simulated minute at the default Play
   speed (1800 ticks), counting what the Narrator announced, then finalists
   for three more minutes. ArthursWorld won:
   first narrated event ~4s in, a new mover species inside 2 seconds' worth of
   ticks, individually *named* emergences at a readable cadence (~11 in 3 min,
   where the churnier worlds coalesce into "23 new lifeforms emerged" noise),
   hundreds of visibly walking organisms from the first frame, cheap ticks
   (1.2ms), and a population that eases rather than crashes over the minutes
   after (605 -> 277 with 15 species; the flashier candidates collapsed to
   double digits). */
export const DEMO_WORLD = 'ArthursWorld';

/* Tests and the bench harness assume the blank OriginOfLife world, and their
   browser contexts are always-fresh (so the localStorage flag never saves
   them). They opt out by URL, same pattern as ?floaties=static. */
function enabledByUrl(): boolean {
  return new URLSearchParams(window.location.search).get('firstrun') !== 'off';
}

export function shouldRun(): boolean {
  if (!enabledByUrl()) return false;
  /* If storage is unreadable (hardened browser), every visit would be a
     "first" one -- skip the demo rather than replay it forever. */
  try {
    return localStorage.getItem(DONE_KEY) === null;
  } catch {
    return false;
  }
}

export function markDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* nothing to record on -- shouldRun() already treats this as done */
  }
}

/* Fetch and load the demo world, exactly the way WorldsModal loads a bundled
   world (including its saved evolution controls -- the drama it was picked
   for happens under them). Resolves false on any failure, leaving the
   OriginOfLife world running and the first-run flag unset so the next visit
   can try again. */
export async function loadDemoWorld(engine: Engine): Promise<boolean> {
  try {
    const res = await fetch(`assets/worlds/${DEMO_WORLD}.json`);
    const raw: any = await res.json();
    if (!raw?.grid || !raw?.organisms) return false;
    engine.env.loadRaw(raw);
    if (raw.controls) Hyperparams.loadJsonObj(raw.controls);
    engine.emitChange(true);
    markDone();
    return true;
  } catch {
    return false;
  }
}
