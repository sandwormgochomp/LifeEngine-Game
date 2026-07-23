import React from 'react';
import styles from '../styles/Hud.module.css';
import CellStates from '../../Organism/Cell/CellStates';
import { CELL_INFO } from '../cellInfo';

const HOTKEYS: [string, string][] = [
  ['Space', 'play / pause'],
  ['A', 'reset view'],
  ['F', 'drop food'],
  ['D', 'drop wall'],
  ['R', 'drop radiation'],
  ['G', 'click to kill'],
  ['B', 'clear all walls'],
  ['H', 'toggle rendering'],
  ['Z', 'sample organism'],
  ['X', 'open the lab'],
  ['C', 'deploy organism'],
  ['Esc', 'back out / close'],
];

const AboutTab: React.FC = () => {
  return (
    <div>
      <h3>The Life Engine</h3>
      <p>
        A virtual ecosystem where organisms eat, reproduce, mutate, and compete. Nothing
        is selected for: whatever survives and out-breeds its neighbours simply spreads.
      </p>
      <p>
        Each organism is a cluster of coloured cells, and each colour does one job.
        Build your own in the Organism Lab and drop it into the world.
      </p>

      <h4>Cell types</h4>
      <div className={styles.legendGrid}>
        {CellStates.living.map(cell => (
          <div key={cell.name} className={styles.legendRow} title={CELL_INFO[cell.name]}>
            <span className={styles.legendSwatch} style={{ backgroundColor: cell.color }}></span>
            <span className={styles.legendName}>{cell.name}</span>
            <span className={styles.legendDesc}>{CELL_INFO[cell.name]}</span>
          </div>
        ))}
      </div>

      <h4>Hotkeys</h4>
      <div className={styles.legendGrid}>
        {HOTKEYS.map(([key, what]) => (
          <div key={key} className={styles.legendRow}>
            <kbd className={styles.hotkey}>{key}</kbd>
            <span className={styles.legendDesc}>{what}</span>
          </div>
        ))}
      </div>

      <h4>Links</h4>
      <p>
        <a href="https://github.com/MaxRobinsonTheGreat/LifeEngine" target="_blank" rel="noreferrer">
          Original project on GitHub
        </a>
        {' · '}
        <a href="https://thelifeengine.net/" target="_blank" rel="noreferrer">
          thelifeengine.net
        </a>
      </p>
    </div>
  );
};

export default AboutTab;
