import React, { useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import Hyperparams from '../Hyperparameters';
import type { HyperparamsData, HyperparamsSingleton } from '../Hyperparameters';
import Notifier from '../Utils/Notifier';

interface EvolutionControlsModalProps {
  engine: Engine | null;
  onClose: () => void;
}

/* The Hyperparams fields this modal can edit, split by the input that edits
   them. Deriving the two key sets from HyperparamsData means a number field
   pointing at a boolean parameter (or at a parameter that no longer exists)
   fails to compile. The neighbour-list fields belong to neither set and so are
   not editable here, which matches what GROUPS already listed. */
type NumParamKey = { [K in keyof HyperparamsData]: HyperparamsData[K] extends number ? K : never }[keyof HyperparamsData];
type BoolParamKey = { [K in keyof HyperparamsData]: HyperparamsData[K] extends boolean ? K : never }[keyof HyperparamsData];
type ParamKey = NumParamKey | BoolParamKey;

interface NumField {
  kind: 'num';
  key: NumParamKey;
  label: string;
  title: string;
  min?: number;
  max?: number;
  step?: number;
}

interface BoolField {
  kind: 'bool';
  key: BoolParamKey;
  label: string;
  title: string;
  /** Checkbox reads/writes the negation of the stored value */
  invert?: boolean;
}

type Field = NumField | BoolField;

// Local mirror of the editable slice of Hyperparams, field types included
type ParamMirror = Pick<HyperparamsData, ParamKey>;

// Every parameter here is one the engine actually reads. Tooltips are carried
// over from the pre-React control panel.
const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'Life',
    fields: [
      { kind: 'num', key: 'foodProdProb', label: 'Food production %', title: 'The probability that a producer cell will produce food each tick.', min: 0.001, max: 100, step: 1 },
      { kind: 'num', key: 'lifespanMultiplier', label: 'Lifespan multiplier', title: 'An organism lives for this many ticks per cell in its body.', min: 1, max: 10000, step: 1 },
      { kind: 'num', key: 'foodDropProb', label: 'Auto food drop rate', title: 'Rate at which food is automatically generated and dropped in the world.', min: 0, max: 1000, step: 0.1 },
      { kind: 'bool', key: 'rotationEnabled', label: 'Rotation enabled', title: 'Organisms rotate when born and while moving.' },
      { kind: 'bool', key: 'instaKill', label: 'One touch kill', title: 'When on, killer cells immediately kill organisms they touch. When off, organisms have as much health as they have cells and only take 1 damage from killer cells.' },
    ],
  },
  {
    title: 'Vision',
    fields: [
      { kind: 'num', key: 'lookRange', label: 'Look range', title: 'How far an eye cell can see (in number of cells).', min: 1, max: 50, step: 1 },
      { kind: 'bool', key: 'seeThroughSelf', label: 'See through self', title: 'Allows eyes to see through an organism’s own cells.' },
    ],
  },
  {
    title: 'Mutation',
    fields: [
      { kind: 'bool', key: 'useGlobalMutability', label: 'Use evolved mutation rate', title: 'When on, each organism has its own mutation rate that can increase or decrease. When off, all organisms share the global mutation rate.', invert: true },
      { kind: 'num', key: 'globalMutability', label: 'Global mutation rate', title: 'Mutation rate shared by every organism when evolved rates are off.', min: 0, max: 100, step: 1 },
      { kind: 'num', key: 'addProb', label: 'Add cell %', title: 'A new cell will stem from an existing one.', min: 0, max: 100, step: 1 },
      { kind: 'num', key: 'changeProb', label: 'Change cell %', title: 'A currently existing cell will change its type.', min: 0, max: 100, step: 1 },
      { kind: 'num', key: 'removeProb', label: 'Remove cell %', title: 'An existing cell will be removed.', min: 0, max: 100, step: 1 },
    ],
  },
  {
    title: 'Cells',
    fields: [
      { kind: 'num', key: 'healerFoodCost', label: 'Healer food cost', title: 'Food cost consumed by healer cells to repair 1 damage.', min: 0, max: 1000, step: 1 },
      { kind: 'num', key: 'explosionRadius', label: 'Explosion radius', title: 'Radius of the explosion (in cells) when an explosive cell detonates.', min: 1, max: 10, step: 1 },
      { kind: 'num', key: 'wallDurability', label: 'Wall durability', title: 'Durability of walls (number of killer hits to destroy; explosions deal 10 damage).', min: 1, max: 1000, step: 1 },
      { kind: 'bool', key: 'moversCanProduce', label: 'Movers can produce food', title: 'When on, movers can produce food from producer cells. When off, producer cells are disabled on mover organisms.' },
    ],
  },
  {
    title: 'Reproduction & limits',
    fields: [
      { kind: 'num', key: 'extraMoverFoodCost', label: 'Extra mover cost', title: 'Additional food cost for movers to reproduce.', min: 0, max: 1000, step: 1 },
      { kind: 'bool', key: 'foodBlocksReproduction', label: 'Food blocks reproduction', title: 'When on, reproduction fails if offspring intersect with food. When off, offspring remove blocking food.' },
      { kind: 'num', key: 'maxOrganisms', label: 'Maximum organisms', title: 'Maximum number of organisms (-1 is unlimited).', min: -1, max: 100000, step: 1 },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key));

const EvolutionControlsModal: React.FC<EvolutionControlsModalProps> = ({ engine, onClose }) => {
  // Hyperparams is a plain module object; mirror it so edits re-render.
  // fromEntries loses the key/value pairing, so the snapshot is asserted back
  // into the mirror shape it was built from.
  const [params, setParams] = useState<ParamMirror>(() =>
    Object.fromEntries(ALL_KEYS.map(k => [k, Hyperparams[k]])) as ParamMirror
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncFromEngine = () => {
    setParams(Object.fromEntries(ALL_KEYS.map(k => [k, Hyperparams[k]])) as ParamMirror);
    engine?.emitChange(true);
  };

  // Generic in the key so the value type is the one that key actually holds,
  // which is what makes the write to Hyperparams check instead of needing a
  // cast. Indexed off the singleton rather than HyperparamsData because that is
  // the declared type of the assignment target; for a ParamKey the two agree.
  const setParam = <K extends ParamKey>(key: K, value: HyperparamsSingleton[K]) => {
    Hyperparams[key] = value;
    setParams(prev => ({ ...prev, [key]: value }));
    engine?.emitChange(true);
  };

  const handleReset = () => {
    engine?.controlpanel.resetHyperparams();
    syncFromEngine();
    Notifier.notify('Evolution controls reset');
  };

  const handleSave = () => {
    const data = Object.fromEntries(ALL_KEYS.map(k => [k, Hyperparams[k]]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evolution_controls.json';
    a.click();
    URL.revokeObjectURL(url);
    Notifier.notify('Evolution controls saved');
  };

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text()
      .then(text => {
        Hyperparams.loadJsonObj(JSON.parse(text));
        syncFromEngine();
        Notifier.notify('Evolution controls loaded');
      })
      .catch(() => Notifier.notify('Not a valid controls file'));
  };

  const renderField = (field: Field) => {
    // The global rate only applies when evolved rates are off
    if (field.key === 'globalMutability' && !params.useGlobalMutability) return null;

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
        <input
          type="range"
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
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="evolution-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-dna" style={{ marginRight: '8px' }}></i>
            EVOLUTION CONTROLS
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.ctrlBody}>
          {GROUPS.map(group => (
            <section key={group.title} className={styles.ctrlGroup}>
              <h4>{group.title}</h4>
              {group.fields.map(renderField)}
            </section>
          ))}
        </div>

        <div className={styles.ctrlFooter}>
          <button id="reset-rules" title="Restore every control to its default" onClick={handleReset}>
            Reset all
          </button>
          <button id="save-controls" title="Download these controls as JSON" onClick={handleSave}>
            <i className="fa-solid fa-download"></i> Save
          </button>
          <button id="load-controls" title="Load controls from a JSON file" onClick={() => fileInputRef.current?.click()}>
            <i className="fa-solid fa-upload"></i> Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleLoadFile}
          />
        </div>
      </div>
    </div>
  );
};

export default EvolutionControlsModal;
