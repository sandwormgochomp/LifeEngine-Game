// Minimal pub/sub for user-facing messages from the engine layer.
// The React HUD subscribes and renders them as toasts; the engine
// stays free of alert()/DOM access.

/* A body-plan cell an organism-related notification can carry so the HUD can
   draw a preview beside the text. Structurally the subset of OrganismThumb's
   ThumbCell the flat/decorated renderer needs; kept here (not imported from the
   component layer) so the engine stays UI-free. Anatomy cells satisfy it. */
export interface NotificationCell {
    loc_col: number;
    loc_row: number;
    direction?: number;
    custom_color?: string | null;
    state: { name?: string; color?: string };
}

/* What a notification is *about*, so clicking the line can take you there.

   Every variant names what to look for rather than holding what it found: a
   toast outlives the tick that fired it (the same reason `organism` above is a
   flat copy rather than live anatomy), so a stored organism reference would
   routinely be dead by the time anyone clicked it. The HUD resolves these
   against the live world at click time and degrades when the subject is gone
   -- a species with nothing left alive opens the fossil record instead. */
export type NotificationFocus =
    /* A fixed place in the world: centre the camera on it. */
    | { kind: 'cell'; col: number; row: number }
    /* A species by name. Centres on and follows a living member if there is
       one, otherwise opens the Lifeforms picker on it -- which is why one
       variant serves both "a lifeform emerged" and "a lineage went extinct". */
    | { kind: 'species'; name: string }
    /* The line currently being followed. Deliberately *not* a species focus:
       the tracker follows organism references, so a mutated descendant founds a
       new species while staying in the line -- looking the line up by its
       founder's species name would walk you to a cousin. */
    | { kind: 'lineage' }
    /* A live world event, by the `kind` it runs under. A rad storm resolves to
       wherever its front has got to; a parameter shift has no location at all
       and falls through to the window that explains it. */
    | { kind: 'event'; id: string }
    /* No place in the world -- open the surface that explains the line. */
    | { kind: 'panel'; panel: 'lifeforms' | 'evolution' | 'stats' };

/* Optional structured data attached to a notification. `organism` is the body
   plan to preview -- present on species/organism events (a lineage emerged or
   died, a new size record), absent on aggregate ones (a coalesced count, a
   population crash). `key` coalesces updates: a message carrying a key replaces
   the existing log line with the same key (e.g. a running "N lifeforms emerged"
   counter) instead of appending a new one. `focus` makes the line clickable;
   without it the line is inert, which is the default and stays the common case
   (a load confirmation or a validation error has nowhere to go). */
export interface NotificationMeta {
    organism?: NotificationCell[];
    key?: string;
    focus?: NotificationFocus;
}

export type NotificationListener = (message: string, meta?: NotificationMeta) => void;

/* Returned by subscribe(); calling it removes the listener. */
export type Unsubscribe = () => void;

export interface NotifierApi {
    notify(message: string, meta?: NotificationMeta): void;
    subscribe(listener: NotificationListener): Unsubscribe;
}

const listeners = new Set<NotificationListener>();

const Notifier: NotifierApi = {
    notify(message: string, meta?: NotificationMeta): void {
        for (const listener of listeners)
            listener(message, meta);
    },

    subscribe(listener: NotificationListener): Unsubscribe {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
};

export default Notifier;
