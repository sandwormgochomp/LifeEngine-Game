import type Engine from '../Engine';
import type { NotificationFocus } from '../Utils/Notifier';
import type Organism from '../Organism/Organism';

/* Turning a NotificationFocus into an action.
 *
 * Kept out of the components that use it (the toast log and the status bar's
 * event chips) because both want the same behaviour and neither should own it.
 *
 * The whole point of this module is that resolution happens *here*, at click
 * time, rather than where the notification was fired. A toast can sit on screen
 * for six seconds and the world does not wait: the species it named may have
 * died, the storm it announced may have blown out, the organism it previewed is
 * certainly a different one by now. So each descriptor says what to look for,
 * this looks, and every path has an answer for "it isn't there any more" --
 * usually the panel that still remembers it.
 */

/* The HUD surfaces the resolver can fall back to. App owns the state behind
   each one; this module only asks. */
export interface FocusHandlers {
  /* Opens the Lifeforms picker. The name, when given, is the species to
     surface -- including one that has just gone extinct, which the picker
     recovers from the fossil record. */
  openLifeforms(species?: string): void;
  openEvolution(tab: 'console' | 'fate'): void;
  openPanel(id: string): void;
}

/* A live event carrying a moving front -- the rad storm is the only one today.
   Recognised structurally rather than by kind, the same way
   paramShiftsTouching() recognises parameter shifts by their baselines. */
const frontOf = (ev: unknown): number | null => {
  const front = (ev as { front?: unknown }).front;
  return typeof front === 'number' ? front : null;
};

/* The living organism a species focus should take you to, or null if the
   lineage has no members left. First match rather than nearest or largest: any
   member makes the point, and "the one the camera happens to reach" is not a
   distinction a player can perceive. */
const livingMemberOf = (engine: Engine, name: string): Organism | null => {
  for (const org of engine.env.organisms) {
    if (org.living && org.species?.name === name) return org;
  }
  return null;
};

/* Run a focus. Silently does nothing when the engine is not up yet, which is
   the same guard every other HUD handler uses. */
export function applyFocus(
  focus: NotificationFocus,
  engine: Engine | null,
  handlers: FocusHandlers,
): void {
  if (!engine) return;
  const env = engine.env;
  const controller = env.controller;

  switch (focus.kind) {
    case 'cell':
      controller.centerOn(focus.col, focus.row);
      return;

    case 'species': {
      const org = livingMemberOf(engine, focus.name);
      if (org) {
        controller.centerOn(org.c, org.r);
        /* Following does double duty: it tints the line cyan, which is what
           makes a centred organism findable at all once the camera lands. */
        env.followOrganism(org);
        return;
      }
      // Nothing left alive -- the fossil record is where it went.
      handlers.openLifeforms(focus.name);
      return;
    }

    case 'lineage': {
      /* Any living member of the followed line. Asked of the tracker rather
         than matched on species, for the reason the variant documents; the
         card's own highlight already marks them all, so the camera only has to
         reach one of them. */
      const org = env.organisms.find(o => o.living && env.lineage.isTracked(o));
      if (org) controller.centerOn(org.c, org.r);
      // A line with nothing left alive has nowhere to go -- the lineage card is
      // already on screen holding the final tally.
      return;
    }

    case 'event': {
      const ev = env.active_events.find(e => e.kind === focus.id);
      const front = ev ? frontOf(ev) : null;
      if (front !== null) {
        // A front spans every row, so its middle is as good as anywhere and
        // keeps the camera off the world's edge.
        controller.centerOn(Math.round(front), Math.floor(env.num_rows / 2));
        return;
      }
      /* A parameter shift has no location, and an event that has already
         expired has nothing left to look at. Both belong to the window that
         lists what is running and lets it be played again. */
      handlers.openEvolution('fate');
      return;
    }

    case 'panel':
      if (focus.panel === 'lifeforms') handlers.openLifeforms();
      else if (focus.panel === 'evolution') handlers.openEvolution('console');
      else handlers.openPanel(focus.panel);
      return;
  }
}
