import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import Notifier, { type NotificationMeta, type NotificationFocus } from '../Utils/Notifier';
import OrganismThumb from './OrganismThumb';
import { applyFocus, type FocusHandlers } from './notificationFocus';
import type Engine from '../Engine';

interface LogEntry {
  id: number;
  // Coalescing key: a new message with the same key updates this line in place
  // (e.g. a running "N lifeforms emerged" counter) instead of adding a new one.
  key?: string;
  message: string;
  // Body plan to preview beside the text, on organism-related events.
  organism?: NotificationMeta['organism'];
  // What the line is about, when it is about something reachable. Absent makes
  // the line inert -- rendered as plain text with no click target.
  focus?: NotificationFocus;
}

// The rolling event log shows the most recent lines, newest at the bottom, and
// rolls older lines off once it is full. It clears itself after a spell with no
// new events, so a running world reads like a live feed while an idle HUD stays
// clean (and the element unmounts, which the visual suite waits on).
const MAX_ENTRIES = 5;
const IDLE_CLEAR_MS = 6000;

interface HudNotificationsProps {
  engine: Engine | null;
  onOpenLifeforms: (species?: string) => void;
  onOpenEvolution: (tab: 'console' | 'fate') => void;
  onOpenPanel: (id: string) => void;
}

// Renders engine-layer Notifier messages as a rolling log in the lower-right
// corner, with a small organism preview when the message carries a body plan.
// A line that carries a focus is a button: clicking it goes to whatever the
// line is talking about (see notificationFocus.ts for how that is resolved).
const HudNotifications: React.FC<HudNotificationsProps> = ({
  engine,
  onOpenLifeforms,
  onOpenEvolution,
  onOpenPanel,
}) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextId = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /* Whether the pointer is over the log. Held in a ref, not state, because the
     subscribe effect below must not re-run (and re-subscribe) on hover. */
  const hovering = useRef(false);

  /* Restart the idle countdown. Skipped while the pointer is over the panel:
     six seconds is plenty of time to reach for a line and have it vanish
     mid-click, which is precisely the failure a clickable log invites. The
     lifeforms picker holds its cards still for the same reason. */
  const armIdleClear = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (hovering.current) return;
    idleTimer.current = setTimeout(() => setEntries([]), IDLE_CLEAR_MS);
  }, []);

  useEffect(() => {
    const unsubscribe = Notifier.subscribe((message: string, meta?: NotificationMeta) => {
      const key = meta?.key;
      setEntries(prev => {
        // Update in place when a keyed message matches a visible line: keep its
        // id (no remount) but refresh the text/preview and move it to newest.
        if (key) {
          const idx = prev.findIndex(e => e.key === key);
          if (idx !== -1) {
            const updated = { ...prev[idx], message, organism: meta?.organism, focus: meta?.focus };
            return [...prev.slice(0, idx), ...prev.slice(idx + 1), updated];
          }
        }
        const next = [...prev, {
          id: nextId.current++,
          key,
          message,
          organism: meta?.organism,
          focus: meta?.focus,
        }];
        // Roll: keep only the most recent MAX_ENTRIES lines.
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
      armIdleClear();
    });
    return () => {
      unsubscribe();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [armIdleClear]);

  const handlers: FocusHandlers = {
    openLifeforms: onOpenLifeforms,
    openEvolution: onOpenEvolution,
    openPanel: onOpenPanel,
  };

  if (entries.length === 0) return null;

  return (
    <div className={styles.notifications} data-testid="hud-notifications">
      {entries.map(entry => {
        const body = (
          <>
            {entry.organism && entry.organism.length > 0 && (
              <OrganismThumb cells={entry.organism} size={36} decorated />
            )}
            <span className={styles.notificationText}>{entry.message}</span>
          </>
        );

        /* Inert lines stay exactly what they were -- a div of text. Only the
           actionable ones become buttons, which is also what re-enables pointer
           events on them (the panel itself stays click-through, so the canvas
           underneath keeps taking paint strokes through the log's dead space). */
        if (!entry.focus) {
          return <div key={entry.id} className={styles.notification}>{body}</div>;
        }
        /* The hover guard lives on the rows, not the panel: the panel is
           pointer-events: none, so a mouseenter on it would never fire at all.
           Which is the right seam anyway -- the log only needs to hold still
           while the cursor is over something that can actually be clicked. */
        return (
          <button
            key={entry.id}
            type="button"
            className={`${styles.notification} ${styles.notificationAction}`}
            data-focus={entry.focus.kind}
            title="Go to what this is about"
            onMouseEnter={() => {
              hovering.current = true;
              if (idleTimer.current) clearTimeout(idleTimer.current);
            }}
            onMouseLeave={() => {
              hovering.current = false;
              armIdleClear();
            }}
            onClick={() => applyFocus(entry.focus!, engine, handlers)}
          >
            {body}
            <span className={styles.notificationChevron} aria-hidden="true">›</span>
          </button>
        );
      })}
    </div>
  );
};

export default HudNotifications;
