import React from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import type { ParamAccess } from './evolutionParams';

export interface EvolutionConsoleProps extends ParamAccess {
  /** For live readouts a parameter can't give — e.g. the world's evolved mutability */
  engine: Engine | null;
}

/* The Console tab — concepts/evolution-window-overhauls.md, overhaul 1.
   Placeholder: the tab exists and is wired, the contents are being built. */
const EvolutionConsole: React.FC<EvolutionConsoleProps> = () => (
  <div className={styles.ctrlBody} data-testid="evolution-console">
    <p className={styles.ctrlNote}>The console is being built.</p>
  </div>
);

export default EvolutionConsole;
