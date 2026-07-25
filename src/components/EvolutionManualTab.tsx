import React from 'react';
import styles from './styles/Hud.module.css';
import PixelSlider from './PixelSlider';
import { GROUPS } from './evolutionParams';
import type { Field, ParamAccess } from './evolutionParams';

/* The original flat control list, unchanged: every editable Hyperparam grouped
   by subject, one uniform row apiece. The Console tab promotes a handful of
   these to dials and folds the rest away; this tab is the complete surface
   underneath, and stays the place where anything not worth a dial lives. */
const EvolutionManualTab: React.FC<ParamAccess> = ({ params, setParam }) => {
  const renderField = (field: Field) => {
    // The global rate only applies when evolved rates are off
    if (field.key === 'globalMutability' && !params.useGlobalMutability) return null;
    // ...and the schedule only means anything when the scheduler is on
    if (field.key === 'randomEventInterval' && !params.randomEvents) return null;

    if (field.kind === 'bool') {
      const checked = field.invert ? !params[field.key] : !!params[field.key];
      return (
        <label key={field.key} className={styles.ctrlRow} title={field.title}>
          <span className={styles.ctrlLabel}>{field.label}</span>
          <input
            type="checkbox"
            id={field.key}
            checked={checked}
            onChange={e => setParam(field.key, field.invert ? !e.target.checked : e.target.checked)}
          />
        </label>
      );
    }
    return (
      <label key={field.key} className={styles.ctrlRow} title={field.title}>
        <span className={styles.ctrlLabel}>{field.label}</span>
        <PixelSlider
          id={field.key}
          value={params[field.key]}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={e => {
            const value = parseFloat(e.target.value);
            if (!Number.isNaN(value)) setParam(field.key, value);
          }}
        />
        <span className={styles.ctrlValue}>{params[field.key]}</span>
      </label>
    );
  };

  return (
    <div className={styles.ctrlBody}>
      {GROUPS.map(group => (
        <section key={group.title} className={styles.ctrlGroup}>
          <h4>{group.title}</h4>
          {group.fields.map(renderField)}
        </section>
      ))}
    </div>
  );
};

export default EvolutionManualTab;
