/* First-run legibility: the very first visit gets a few world-anchored hints
   (FirstRunHints) pointing at what to look at -- the origin organism, what
   feeds it, and the first species to branch off it.

   This file decides *whether* this visit is that one. It deliberately does not
   touch the world: an earlier version swapped in a curated bundled world
   already mid-drama, which meant a new player never saw the petri dish the
   simulation is actually about (and silently inherited that world's saved
   evolution controls). The hints narrate whatever the engine already built.

   This is not a tutorial: nothing blocks, nothing must be clicked, and none of
   it ever appears again once the flag is written. */

const DONE_KEY = 'life_engine.first_run_done';

/* Tests and the bench harness want no hint overlay in front of the world, and
   their browser contexts are always-fresh (so the localStorage flag never
   saves them). They opt out by URL, same pattern as ?floaties=static. */
function enabledByUrl(): boolean {
  return new URLSearchParams(window.location.search).get('firstrun') !== 'off';
}

export function shouldRun(): boolean {
  if (!enabledByUrl()) return false;
  /* If storage is unreadable (hardened browser), every visit would be a
     "first" one -- skip the hints rather than replay them forever. */
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
