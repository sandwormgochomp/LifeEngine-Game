import React, { useState } from 'react';
import styles from '../styles/Hud.module.css';

const Hyperparams = require('../../Hyperparameters');

interface EvolutionControlsTabProps {
  engine: any;
}

const EvolutionControlsTab: React.FC<EvolutionControlsTabProps> = ({ engine }) => {
  // Use local state to drive the inputs, initialized from Hyperparams
  const [mutability, setMutability] = useState(Hyperparams.mutability);
  const [lifespan, setLifespan] = useState(Hyperparams.lifespan);
  const [energyDecay, setEnergyDecay] = useState(Hyperparams.energy_decay);

  const updateHyperparam = (key: string, value: number) => {
    Hyperparams[key] = value;
    if (key === 'mutability') setMutability(value);
    if (key === 'lifespan') setLifespan(value);
    if (key === 'energy_decay') setEnergyDecay(value);
  };

  return (
    <div>
      <h3>Evolution Controls</h3>
      <p>Adjust hyperparameters governing the simulation.</p>

      <div className={styles.sliderGroup}>
        <label>
          Mutability: {mutability}
          <input 
            type="range" 
            min="0" max="10" step="0.1" 
            value={mutability}
            onChange={(e) => updateHyperparam('mutability', parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.sliderGroup}>
        <label>
          Base Lifespan: {lifespan}
          <input 
            type="range" 
            min="10" max="200" step="1" 
            value={lifespan}
            onChange={(e) => updateHyperparam('lifespan', parseInt(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.sliderGroup}>
        <label>
          Energy Decay: {energyDecay}
          <input 
            type="range" 
            min="0" max="2" step="0.05" 
            value={energyDecay}
            onChange={(e) => updateHyperparam('energy_decay', parseFloat(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
};

export default EvolutionControlsTab;
