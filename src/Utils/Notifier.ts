// Minimal pub/sub for user-facing messages from the engine layer.
// The React HUD subscribes and renders them as toasts; the engine
// stays free of alert()/DOM access.
export type NotificationListener = (message: string) => void;

/* Returned by subscribe(); calling it removes the listener. */
export type Unsubscribe = () => void;

export interface NotifierApi {
    notify(message: string): void;
    subscribe(listener: NotificationListener): Unsubscribe;
}

const listeners = new Set<NotificationListener>();

const Notifier: NotifierApi = {
    notify(message: string): void {
        for (const listener of listeners)
            listener(message);
    },

    subscribe(listener: NotificationListener): Unsubscribe {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
};

export default Notifier;
