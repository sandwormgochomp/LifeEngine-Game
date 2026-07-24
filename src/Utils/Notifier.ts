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

/* Optional structured data attached to a notification. `organism` is the body
   plan to preview -- present on species/organism events (a lineage emerged or
   died, a new size record), absent on aggregate ones (a coalesced count, a
   population crash). `key` coalesces updates: a message carrying a key replaces
   the existing log line with the same key (e.g. a running "N lifeforms emerged"
   counter) instead of appending a new one. */
export interface NotificationMeta {
    organism?: NotificationCell[];
    key?: string;
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
