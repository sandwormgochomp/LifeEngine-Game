import React, { useState } from 'react';
import styles from './styles/Hud.module.css';
import local from './styles/EvolutionConsole.module.css';
import PixelDial, { linearScale, logScale } from './PixelDial';
import PixelSlider from './PixelSlider';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import { GROUPS } from './evolutionParams';
import type { Field, ParamAccess, ParamKey } from './evolutionParams';

export interface EvolutionConsoleProps extends ParamAccess {
  /** For live readouts a parameter can't give — e.g. the world's evolved mutability */
  engine: Engine | null;
}

/* The Console tab — concepts/evolution-window-overhauls.md, overhaul 1.

   Same parameters, same writes, no new mechanics: the window stops being a
   form and becomes a piece of machinery. Three dials for the settings that
   decide a run's character, a hazard block for the toggles that reshape a
   world rather than tune it, and everything else folded away.

   The consequence lines below are the point of the exercise. Every one of them
   used to be a `title` tooltip on a `cursor: help` row, which meant invisible
   at a glance and entirely absent on touch. They live here, in the tab that
   shows them, rather than in evolutionParams.ts: that table is the shared
   schema and the Manual tab reads it too, so an outcome-phrased sentence
   belongs to this presentation, not to the parameter. The tooltips stay on as
   well — the long mechanical explanation is still worth having on hover. */
const CONSEQUENCE: Partial<Record<ParamKey, string>> = {
  foodProdProb: 'how fast producers turn bare space into food',
  lifespanMultiplier: 'ticks a body earns per cell — high enough, nothing turns over',
  globalMutability: 'how far a copy drifts from its parent',
  instaKill: 'killers end a whole body at a single touch',
  randomEvents: 'meteors, blooms, ice ages — on a timer you do not control',
  randomEventInterval: 'ticks between cataclysms; 1800 is about half a minute at full speed',
  maxOrganisms: 'a hard ceiling on how much life the dish will hold',
  moversCanProduce: 'lets a mover feed itself, so plants stop being the only food',
  foodDropProb: 'free food out of nowhere — a safety net that removes the reason to farm',
  rotationEnabled: 'newborns face any direction, so a body plan has to work every way round',
  lookRange: 'how far an eye sees before the world is a blur',
  seeThroughSelf: 'eyes stop being blinded by their own body',
  addProb: 'how often a newborn grows a limb its parent never had',
  changeProb: 'how often a cell is born as something other than what it copied',
  removeProb: 'how often a newborn comes up short a cell',
  healerFoodCost: 'the price of repair — expensive healing makes armour cheaper than medicine',
  explosionRadius: 'how much of the neighbourhood an explosive cell takes with it',
  wallDurability: 'killer hits a wall survives; an explosion lands ten at once',
  extraMoverFoodCost: 'a surcharge on breeding while mobile, taxing movers in favour of plants',
  foodBlocksReproduction: 'offspring cannot be born into food; when off they eat their way out',
};

/* Everything the console gives its own treatment. The fold is derived by
   subtracting this set from GROUPS rather than by listing the remainder, so a
   parameter added to evolutionParams.ts turns up in the fold on its own
   instead of quietly vanishing from this tab. */
const PROMOTED = new Set<ParamKey>([
  'foodProdProb', 'lifespanMultiplier', 'globalMutability', 'useGlobalMutability',
  'instaKill', 'randomEvents', 'randomEventInterval', 'maxOrganisms', 'moversCanProduce',
]);

const HAZARD_KEYS: ParamKey[] = ['instaKill', 'randomEvents', 'maxOrganisms', 'moversCanProduce'];

const fieldOf = (key: ParamKey): Field =>
  GROUPS.flatMap(g => g.fields).find(f => f.key === key) as Field;

const EvolutionConsole: React.FC<EvolutionConsoleProps> = ({ engine, params, setParam }) => {
  const [fineOpen, setFineOpen] = useState(false);

  /* THE MUTATION DIAL.

     globalMutability is inert by default. useGlobalMutability starts false,
     which means every organism carries its own evolved mutability and nothing
     in the engine reads the global number at all — a dial bound straight to it
     would be a dial that does nothing, which is precisely the regression
     tests/evolution_controls.spec.js exists to catch.

     So the dial has two honest states. With evolved rates on it is a *gauge*:
     the needle follows env.averageMutability(), the world's own live average
     drift, and says EVOLVED. Touching it is a decision, not an adjustment — it
     flips useGlobalMutability on, which is the moment the number starts
     meaning something, and the dial says MANUAL with a way back. At no point
     does it show a value it is not connected to. */
  const evolvedRates = !params.useGlobalMutability;
  const liveMutability = useEngineValue(engine, e => Math.round(e.env.averageMutability() * 100) / 100, 0);
  const mutability = evolvedRates ? liveMutability : params.globalMutability;

  const setMutability = (value: number) => {
    setParam('globalMutability', value);
    if (evolvedRates) setParam('useGlobalMutability', true);
  };

  const consequence = (key: ParamKey) =>
    CONSEQUENCE[key] ? <p className={local.consequence}>{CONSEQUENCE[key]}</p> : null;

  const renderRow = (field: Field, idPrefix = 'console-') => {
    if (field.kind === 'bool') {
      const checked = field.invert ? !params[field.key] : !!params[field.key];
      return (
        <div key={field.key} className={local.field}>
          <label className={styles.ctrlRow} title={field.title}>
            <span className={styles.ctrlLabel}>{field.label}</span>
            <input
              type="checkbox"
              id={`${idPrefix}${field.key}`}
              checked={checked}
              onChange={e => setParam(field.key, field.invert ? !e.target.checked : e.target.checked)}
            />
          </label>
          {consequence(field.key)}
        </div>
      );
    }
    return (
      <div key={field.key} className={local.field}>
        <label className={styles.ctrlRow} title={field.title}>
          <span className={styles.ctrlLabel}>{field.label}</span>
          <PixelSlider
            id={`${idPrefix}${field.key}`}
            value={params[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={e => {
              const value = parseFloat(e.target.value);
              if (!Number.isNaN(value)) setParam(field.key, value);
            }}
          />
          <span className={styles.ctrlValue}>
            {field.key === 'maxOrganisms' && params.maxOrganisms < 0 ? '∞' : params[field.key]}
          </span>
        </label>
        {consequence(field.key)}
      </div>
    );
  };

  const fineGroups = GROUPS
    .map(group => ({ title: group.title, fields: group.fields.filter(f => !PROMOTED.has(f.key)) }))
    .filter(group => group.fields.length > 0);
  const fineCount = fineGroups.reduce((n, g) => n + g.fields.length, 0);

  return (
    <div className={local.console} data-testid="evolution-console">
      <div className={local.dials}>
        <PixelDial
          id="dial-abundance"
          label="ABUNDANCE"
          title={fieldOf('foodProdProb').title}
          value={params.foodProdProb}
          min={0}
          max={100}
          step={0.5}
          /* Linear: the whole range is legible on a 260-degree arc at half a
             point per press, and unlike lifespan the interesting values are
             spread across it rather than bunched at the bottom. */
          dangerFrom={0.6}
          format={v => v.toFixed(1)}
          hint={CONSEQUENCE.foodProdProb}
          onChange={v => setParam('foodProdProb', v)}
        />
        <PixelDial
          id="dial-lifespan"
          label="LIFESPAN"
          title={fieldOf('lifespanMultiplier').title}
          value={params.lifespanMultiplier}
          min={1}
          max={10000}
          step={1}
          /* Log, not linear. The parameter runs 1..10000 but everything worth
             reaching sits under 500, which on a linear arc is the first five
             degrees of travel — a dial you could not aim. Geometric spacing
             gives each decade a quarter of the sweep, so the default 100 lands
             mid-face and the low end is where the fine control is. */
          scale={logScale(1, 10000)}
          dangerFrom={0.75}
          hint={CONSEQUENCE.lifespanMultiplier}
          onChange={v => setParam('lifespanMultiplier', v)}
        />
        <PixelDial
          id="dial-mutation"
          label="MUTATION"
          title={fieldOf('globalMutability').title}
          value={mutability}
          min={0}
          max={100}
          step={1}
          scale={linearScale(0, 100)}
          dangerFrom={0.5}
          badge={evolvedRates ? 'EVOLVED' : 'MANUAL'}
          badgeAlert={!evolvedRates}
          hint={
            evolvedRates
              ? 'the world’s own average drift — turn it to take the wheel'
              : CONSEQUENCE.globalMutability
          }
          onChange={setMutability}
        >
          {!evolvedRates && (
            <button
              id="console-return-evolved"
              className={local.revert}
              title="Hand mutation rates back to the organisms; the global number goes inert again"
              onClick={() => setParam('useGlobalMutability', false)}
            >
              ↺ RETURN TO EVOLVED
            </button>
          )}
        </PixelDial>
      </div>

      {/* Not tuning — these four decide what kind of world it is. The stripe
          and the red border are the only thing on the tab that says so. */}
      <section className={local.hazard} data-testid="console-hazard">
        <div className={local.hazardTitle}>⚠ HAZARD</div>
        {HAZARD_KEYS.map(key => (
          <React.Fragment key={key}>
            {renderRow(fieldOf(key))}
            {/* The schedule is meaningless until the scheduler is on, so it
                appears attached to the toggle that turns it on rather than
                sitting greyed out beside it. */}
            {key === 'randomEvents' && params.randomEvents && renderRow(fieldOf('randomEventInterval'))}
          </React.Fragment>
        ))}
      </section>

      <button
        id="console-fine-toggle"
        className={local.foldToggle}
        aria-expanded={fineOpen}
        onClick={() => setFineOpen(open => !open)}
      >
        {fineOpen ? '▾' : '▸'} FINE TUNING ({fineCount})
      </button>

      {fineOpen && (
        <div className={local.fine} data-testid="console-fine-tuning">
          {fineGroups.map(group => (
            <section key={group.title} className={styles.ctrlGroup}>
              <h4>{group.title}</h4>
              {group.fields.map(field => renderRow(field))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default EvolutionConsole;
