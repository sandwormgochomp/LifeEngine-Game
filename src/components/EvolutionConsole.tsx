import React from 'react';
import styles from './styles/Hud.module.css';
import type { ParamAccess } from './evolutionParams';

/* The Console tab — concepts/evolution-window-overhauls.md, overhaul 1.
   Placeholder: the tab exists and is wired, the contents are being built. */
const EvolutionConsole: React.FC<ParamAccess> = () => (
  <div className={styles.ctrlBody} data-testid="evolution-console">
    <p className={styles.ctrlNote}>The console is being built.</p>
  </div>
);

export default EvolutionConsole;
