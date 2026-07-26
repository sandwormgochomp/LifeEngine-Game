import React, { useEffect, useState } from 'react';
import styles from './styles/BrainModal.module.css';
import type Engine from '../Engine';
import CellStates from '../Organism/Cell/CellStates';
import type { CellName } from '../Organism/Cell/CellStates';
import type Anatomy from '../Organism/Anatomy';
import { WALL_BRAIN_CELLS } from '../Organism/Cell/BodyCells/BrainCell';
import Notifier from '../Utils/Notifier';
import PixelSlider from './PixelSlider';

interface BrainModalProps {
  engine: Engine | null;
  onClose: () => void;
}

// Cell types an eye can observe and therefore react to
/* What an organism can be given a reaction to. Both wall types are here: the
   terrain palette paints two of them (Wall and Glass), an eye reports whichever
   one its ray lands on, and Brain.decide looks the weight up by state name --
   so the simulation has always been able to tell them apart. Only this list
   could not, which left the Glass tool painting something no creature could be
   taught to avoid. */
const OBSERVABLE: CellName[] = ['food', 'wall', 'invincible_wall', ...CellStates.living.map(c => c.name)];

/* Row labels, for the observables whose state name is not what the player
   calls them. `invincible_wall` is "glass" on the tool that paints it and in
   the dish rim it builds, and a row spelling out the internal name would read
   as a third kind of wall rather than the one they just used. The slider id
   and `data-cell` stay the state name -- that is the key into the decision
   map, and what the tests address. */
const OBSERVABLE_LABEL: Partial<Record<CellName, string>> = {
  invincible_wall: 'glass',
};

/* `met` asks the anatomy whether the action can do anything at all, and `lack`
   is what the option says when it cannot. A predicate rather than the flag name
   this used to hold: building a wall needs a *count* of brain cells
   (WALL_BRAIN_CELLS), not a boolean, and the badge should say how many. Reading
   the field inside the predicate keeps the property the flag name had -- a
   badge for something Anatomy does not carry still fails to compile. */
interface BrainActionOption {
  value: string;
  label: string;
  met?: (anatomy: Anatomy) => boolean;
  lack?: string;
}

const ACTIONS: BrainActionOption[] = [
  { value: '', label: 'no action' },
  { value: 'explode', label: 'explode', met: a => a.has_explosive, lack: 'needs cell' },
  { value: 'heal', label: 'heal', met: a => a.has_healer, lack: 'needs cell' },
  { value: 'shoot', label: 'shoot', met: a => a.has_shooter, lack: 'needs cell' },
  { value: 'hibernate', label: 'hibernate' },
  {
    value: 'build',
    label: 'build wall',
    met: a => a.brain_cells >= WALL_BRAIN_CELLS,
    lack: `needs ${WALL_BRAIN_CELLS} brain`,
  },
];

const CONDITIONS = ['Health', 'Food', 'Always'];
const OPERATORS = ['<', '>', '='];

// Every CellName is a key of the registry holding a CellState, so this lookup
// cannot land on the registry's `all`/`living`/method members.
const cellColor = (name: CellName) => CellStates[name]?.color || '#888';

const BrainModal: React.FC<BrainModalProps> = ({ engine, onClose }) => {
  const editor = engine?.organism_editor;
  const brain = editor?.organism?.brain;
  const anatomy = editor?.organism?.anatomy;

  const [activeState, setActiveState] = useState(0);
  // The brain is mutated in place rather than replaced, so nothing React can
  // diff changes. Re-render on every engine change: that covers our own edits
  // and an organism being loaded underneath us (whose brain object we would
  // otherwise keep editing after it was orphaned).
  const [, setVersion] = useState(0);
  useEffect(() => engine?.subscribe(() => setVersion(v => v + 1)), [engine]);

  if (!brain) return null;

  // Every edit is one undo step on the editor's existing history
  const edit = (fn: () => void) => {
    editor!.beginStroke();
    fn();
    editor!.commitStroke();
    setVersion(v => v + 1);
    engine?.emitChange(true);
  };

  const states = brain.states || [];
  const index = Math.min(activeState, states.length - 1);
  const state = states[index];

  const addState = () => edit(() => {
    brain.states.push({
      name: `State ${brain.states.length + 1}`,
      decisions: brain.createDefaultDecisions(),
      actions: {},
      transitions: [],
    });
    setActiveState(brain.states.length - 1);
  });

  const deleteState = () => {
    if (states.length <= 1) {
      Notifier.notify('A brain needs at least one state');
      return;
    }
    edit(() => {
      brain.states.splice(index, 1);
      // Drop transitions pointing at the removed state and reindex the rest
      for (const s of brain.states) {
        s.transitions = (s.transitions || [])
          .filter(t => t.target !== index)
          .map(t => ({ ...t, target: t.target > index ? t.target - 1 : t.target }));
      }
      if (brain.active_state_index >= brain.states.length) brain.active_state_index = 0;
      setActiveState(Math.max(0, index - 1));
    });
  };

  const usable = anatomy?.is_mover && anatomy?.has_eyes;

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="brain-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-brain" style={{ marginRight: '8px' }}></i>
            BRAIN
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.brainBody}>
          {!usable && (
            <p className={styles.ctrlNote} id="brain-warning">
              This organism needs both a mover and an eye cell for its brain to run.
            </p>
          )}

          <div className={styles.brainStateTabs}>
            {states.map((s, i) => (
              <button
                key={i}
                className={`brain-state-tab ${styles.brainStateTab} ${i === index ? styles.active : ''}`}
                onClick={() => setActiveState(i)}
                title="Switch to this state"
              >
                {s.name}
              </button>
            ))}
            <button id="add-brain-state" className={styles.ctrlBtn} onClick={addState} title="Add another behaviour state">
              + State
            </button>
          </div>

          <div className={styles.ctrlRow}>
            <input
              id="brain-state-name"
              className={styles.dockNameInput}
              value={state.name}
              title="Name of this state"
              onChange={e => edit(() => { state.name = e.target.value; })}
            />
            <button id="delete-brain-state" className={styles.ctrlBtn} onClick={deleteState} title="Delete this state">
              Delete
            </button>
          </div>

          <h4 className={styles.brainHeading}>Transitions — when to leave this state</h4>
          {(state.transitions || []).length === 0 && (
            <p className={styles.ctrlNote}>No transitions: the organism stays in this state.</p>
          )}
          {(state.transitions || []).map((t, ti) => (
            <div key={ti} className={`brain-transition ${styles.brainTransition}`}>
              <span>When</span>
              <select
                className={styles.brainSelect}
                value={t.condition_type}
                onChange={e => edit(() => { t.condition_type = e.target.value; })}
                title="What to test"
              >
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {t.condition_type !== 'Always' && (
                <>
                  <select
                    className={styles.brainSelect}
                    value={t.operator}
                    onChange={e => edit(() => { t.operator = e.target.value; })}
                    title="Comparison"
                  >
                    {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input
                    type="number"
                    className={styles.ctrlNumber}
                    style={{ width: '58px' }}
                    value={t.value}
                    min={0}
                    max={100}
                    onChange={e => edit(() => { t.value = parseFloat(e.target.value) || 0; })}
                    title="Percentage threshold"
                  />
                  <span>%</span>
                </>
              )}
              <span>go to</span>
              <select
                className={styles.brainSelect}
                value={t.target}
                onChange={e => edit(() => { t.target = parseInt(e.target.value); })}
                title="State to switch to"
              >
                {states.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
              </select>
              <button
                className={styles.brainRemove}
                title="Remove this transition"
                onClick={() => edit(() => { state.transitions.splice(ti, 1); })}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          ))}
          <button
            id="add-brain-transition"
            className={styles.ctrlBtn}
            title="Add a rule for leaving this state"
            onClick={() => edit(() => {
              if (!state.transitions) state.transitions = [];
              state.transitions.push({ condition_type: 'Health', operator: '<', value: 50, target: 0 });
            })}
          >
            + Transition
          </button>

          <h4 className={styles.brainHeading}>Priorities — what to do in this state</h4>
          <p className={styles.ctrlNote}>
            Negative values flee the cell type, positive values chase it.
          </p>
          {OBSERVABLE.map(name => (
            <div key={name} className={`brain-row ${styles.brainRow}`} data-cell={name}>
              <span className={styles.brainSwatch} style={{ backgroundColor: cellColor(name) }}></span>
              <span className={styles.brainCellName}>{OBSERVABLE_LABEL[name] ?? name}</span>
              <PixelSlider
                className={styles.brainSlider}
                id={`weight-${name}`}
                min={-10}
                max={10}
                step={1}
                value={state.decisions?.[name] ?? 0}
                onChange={e => edit(() => { state.decisions[name] = parseInt(e.target.value); })}
                title={`How strongly to react to ${name}`}
              />
              <span className={styles.brainWeight}>{state.decisions?.[name] ?? 0}</span>
              <select
                className={styles.brainSelect}
                id={`action-${name}`}
                value={state.actions?.[name] ?? ''}
                onChange={e => edit(() => {
                  if (!state.actions) state.actions = {};
                  if (e.target.value) state.actions[name] = e.target.value;
                  else delete state.actions[name];
                })}
                title={`Action to take when this organism sees ${name}`}
              >
                {ACTIONS.map(a => (
                  <option key={a.value} value={a.value}>
                    {a.met && !(anatomy && a.met(anatomy)) ? `${a.label} (${a.lack})` : a.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrainModal;
