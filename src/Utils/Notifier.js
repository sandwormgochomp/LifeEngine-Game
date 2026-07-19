// Minimal pub/sub for user-facing messages from the engine layer.
// The React HUD subscribes and renders them as toasts; the engine
// stays free of alert()/DOM access.
const listeners = new Set();

const Notifier = {
    notify(message) {
        for (const listener of listeners)
            listener(message);
    },

    subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
};

export default Notifier;
