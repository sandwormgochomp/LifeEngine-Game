import React, { useState } from 'react';
import styles from '../styles/Hud.module.css';
import type { EngineAPI } from '../../types/engine';
import Hyperparams from '../../Hyperparameters';

interface EvolutionControlsTabProps {
  engine: EngineAPI | null;
}

const EvolutionControlsTab: React.FC<EvolutionControlsTabProps> = ({ engine }) => {
  // Local state mirrors Hyperparams to drive the inputs
  const [params, setParams] = useState(() => ({
    mutability: Hyperparams.mutability,
    lifespan: Hyperparams.lifespan,
    energy_decay: Hyperparams.energy_decay,
  }));

  const updateHyperparam = (key: keyof typeof params, value: number) => {
    Hyperparams[key] = value;
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h3>Evolution Controls</h3>
      <p>Adjust hyperparameters governing the simulation.</p>

      <div className={styles.sliderGroup}>
        <label>
          Mutability: {params.mutability}
          <input 
            type="range" 
            min="0" max="10" step="0.1" 
            value={params.mutability}
            onChange={(e) => updateHyperparam('mutability', parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.sliderGroup}>
        <label>
          Base Lifespan: {params.lifespan}
          <input 
            type="range" 
            min="10" max="200" step="1" 
            value={params.lifespan}
            onChange={(e) => updateHyperparam('lifespan', parseInt(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.sliderGroup}>
        <label>
          Energy Decay: {params.energy_decay}
          <input 
            type="range" 
            min="0" max="2" step="0.05" 
            value={params.energy_decay}
            onChange={(e) => updateHyperparam('energy_decay', parseFloat(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
};

export default EvolutionControlsTab;
