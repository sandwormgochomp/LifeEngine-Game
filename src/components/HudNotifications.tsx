import React, { useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import Notifier from '../Utils/Notifier';

interface Toast {
  id: number;
  message: string;
}

const TOAST_DURATION_MS = 3000;

// Renders engine-layer Notifier messages as transient HUD toasts.
const HudNotifications: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsubscribe = Notifier.subscribe((message: string) => {
      const id = nextId.current++;
      setToasts(prev => [...prev, { id, message }]);
      timers.push(setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, TOAST_DURATION_MS));
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.notifications} data-testid="hud-notifications">
      {toasts.map(toast => (
        <div key={toast.id} className={styles.notification}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};

export default HudNotifications;
