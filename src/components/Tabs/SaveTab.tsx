import React, { useRef } from 'react';
import styles from '../styles/Hud.module.css';
import type Engine from '../../Engine';
import Notifier from '../../Utils/Notifier';

interface SaveTabProps {
  engine: Engine | null;
  onBrowseWorlds: () => void;
}

const SaveTab: React.FC<SaveTabProps> = ({ engine, onBrowseWorlds }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveWorld = () => {
    if (!engine?.env) return;
    const raw = engine.env.serialize();
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life_engine_world_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Notifier.notify('World saved successfully');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !engine?.env) return;

    file.text()
      .then(text => {
        const raw = JSON.parse(text);
        if (!raw.grid || !raw.organisms) {
          Notifier.notify('Not a valid world save file');
          return;
        }
        engine.env.loadRaw(raw);
        engine.emitChange(true);
        Notifier.notify('World state loaded successfully');
      })
      .catch(() => Notifier.notify('Failed to load world save file'));
  };

  return (
    <div>
      <h3>Your Worlds</h3>
      <p style={{ marginBottom: '12px', fontSize: '14px', color: 'rgba(0, 255, 65, 0.8)' }}>
        Save a snapshot of the current world state, including grid layout, organisms, and simulation settings, or load a previously saved world.
      </p>

      <div className={styles.buttonGroup}>
        <button id="save-world-btn" onClick={handleSaveWorld}>
          <i className="fa-solid fa-download" style={{ marginRight: '6px' }}></i>
          Download World
        </button>
        <button id="load-world-btn" onClick={() => fileInputRef.current?.click()}>
          <i className="fa-solid fa-upload" style={{ marginRight: '6px' }}></i>
          Load World
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button id="browse-worlds-btn" title="Browse the worlds bundled with the game" onClick={onBrowseWorlds}>
          <i className="fa-solid fa-globe" style={{ marginRight: '6px' }}></i>
          Browse Worlds
        </button>
      </div>
    </div>
  );
};

export default SaveTab;
