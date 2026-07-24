import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import Notifier, { type NotificationMeta } from '../Utils/Notifier';
import OrganismThumb from './OrganismThumb';

interface LogEntry {
  id: number;
  // Coalescing key: a new message with the same key updates this line in place
  // (e.g. a running "N lifeforms emerged" counter) instead of adding a new one.
  key?: string;
  message: string;
  // Body plan to preview beside the text, on organism-related events.
  organism?: NotificationMeta['organism'];
}

// The rolling event log shows the most recent lines, newest at the bottom, and
// rolls older lines off once it is full. It clears itself after a spell with no
// new events, so a running world reads like a live feed while an idle HUD stays
// clean (and the element unmounts, which the visual suite waits on).
const MAX_ENTRIES = 5;
const IDLE_CLEAR_MS = 6000;

// Renders engine-layer Notifier messages as a rolling log in the lower-right
// corner, with a small organism preview when the message carries a body plan.
const HudNotifications: React.FC = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextId = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = Notifier.subscribe((message: string, meta?: NotificationMeta) => {
      const key = meta?.key;
      setEntries(prev => {
        // Update in place when a keyed message matches a visible line: keep its
        // id (no remount) but refresh the text/preview and move it to newest.
        if (key) {
          const idx = prev.findIndex(e => e.key === key);
          if (idx !== -1) {
            const updated = { ...prev[idx], message, organism: meta?.organism };
            return [...prev.slice(0, idx), ...prev.slice(idx + 1), updated];
          }
        }
        const next = [...prev, { id: nextId.current++, key, message, organism: meta?.organism }];
        // Roll: keep only the most recent MAX_ENTRIES lines.
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setEntries([]), IDLE_CLEAR_MS);
    });
    return () => {
      unsubscribe();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className={styles.notifications} data-testid="hud-notifications">
      {entries.map(entry => (
        <div key={entry.id} className={styles.notification}>
          {entry.organism && entry.organism.length > 0 && (
            <OrganismThumb cells={entry.organism} size={36} decorated />
          )}
          <span className={styles.notificationText}>{entry.message}</span>
        </div>
      ))}
    </div>
  );
};

export default HudNotifications;
