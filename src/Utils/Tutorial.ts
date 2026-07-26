/* Whether this visit opens the tutorial by itself.

   Same shape as FirstRun, and deliberately a separate flag rather than a second
   reading of that one: the two features answer different questions. FirstRun
   asks "has this browser ever seen the game", and the world hints it gates are
   a property of a world nobody has watched yet. This asks "has this browser
   ever been walked through the game", which a player can want again -- the
   TUTORIAL button replays it without clearing anything, and replaying must not
   also bring back the first-run hints.

   The two are sequenced rather than stacked: on a genuine first visit the
   tutorial opens and the hints arm only once it closes, so a new player is
   never being narrated at from two places at once. See App's mount effect. */

const DONE_KEY = 'life_engine.tutorial_done';

/* The test fixtures and the bench want the world unobstructed, and their
   browser contexts are always fresh, so the flag below would never save them.
   They opt out by URL -- same pattern as ?floaties=static and ?firstrun=off. */
function enabledByUrl(): boolean {
    return new URLSearchParams(window.location.search).get('tutorial') !== 'off';
}

export function shouldRun(): boolean {
    if (!enabledByUrl()) return false;
    /* Unreadable storage (hardened browser) would make every visit a first
       one. Skip the auto-open rather than reopen the tutorial forever; the
       button still works, which is the whole point of having one. */
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
