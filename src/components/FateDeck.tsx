import React from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';

export interface FateDeckProps {
  engine: Engine | null;
  /** Called after a card writes through to Hyperparams, so sibling tabs resync */
  onParamsChanged: () => void;
}

/* The Fate Deck tab — concepts/evolution-window-overhauls.md, overhaul 4.
   Placeholder: the tab exists and is wired, the contents are being built. */
const FateDeck: React.FC<FateDeckProps> = () => (
  <div className={styles.ctrlBody} data-testid="fate-deck">
    <p className={styles.ctrlNote}>The deck is being shuffled.</p>
  </div>
);

export default FateDeck;
