import Hyperparams from '../Hyperparameters';
import type { HyperparamsData, HyperparamsSingleton } from '../Hyperparameters';

/* The Hyperparams fields the evolution window can edit, split by the input that
   edits them. Deriving the two key sets from HyperparamsData means a number
   field pointing at a boolean parameter (or at a parameter that no longer
   exists) fails to compile. The neighbour-list fields belong to neither set and
   so are not editable here, which matches what GROUPS lists.

   These live outside the modal because every tab of the window shares them: the
   Console promotes a handful of keys to dials and renders the rest of GROUPS
   wholesale in its fold, and the Fate Deck writes through the same setParam. */
export type NumParamKey = { [K in keyof HyperparamsData]: HyperparamsData[K] extends number ? K : never }[keyof HyperparamsData];
export type BoolParamKey = { [K in keyof HyperparamsData]: HyperparamsData[K] extends boolean ? K : never }[keyof HyperparamsData];
export type ParamKey = NumParamKey | BoolParamKey;

export interface NumField {
  kind: 'num';
  key: NumParamKey;
  label: string;
  title: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface BoolField {
  kind: 'bool';
  key: BoolParamKey;
  label: string;
  title: string;
  /** Checkbox reads/writes the negation of the stored value */
  invert?: boolean;
}

export type Field = NumField | BoolField;

/** Local mirror of the editable slice of Hyperparams, field types included */
export type ParamMirror = Pick<HyperparamsData, ParamKey>;

/* What every tab is handed: the mirror, and the one way to write through it.
   Indexed off the singleton rather than HyperparamsData because that is the
   declared type of the assignment target inside setParam; for a ParamKey the
   two agree. */
export interface ParamAccess {
  params: ParamMirror;
  setParam: <K extends ParamKey>(key: K, value: HyperparamsSingleton[K]) => void;
}

// Every parameter here is one the engine actually reads. Tooltips are carried
// over from the pre-React control panel.
export const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'Life',
    fields: [
      /* 0..100 by halves, the same scale the Console's ABUNDANCE dial runs on.
         It was min 0.001 step 1, which meant every value the slider could
         produce ended in .001 -- a rate of 7 was unreachable from the row. */
      { kind: 'num', key: 'foodProdProb', label: 'Food production %', title: 'The probability that a producer cell will produce food each tick.', min: 0, max: 100, step: 0.5 },
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
  {
    title: 'World events',
    fields: [
      { kind: 'bool', key: 'randomEvents', label: 'Random world events', title: 'When on, the world periodically throws one of the Events tab’s cataclysms at itself: a meteor, a bloom, an ice age or a radiation storm. Off by default — the schedule is random, so leaving it off is what keeps a run repeatable.' },
      { kind: 'num', key: 'randomEventInterval', label: 'Event interval (ticks)', title: 'Ticks between auto-scheduled events. 1800 is about half a minute at full speed.', min: 60, max: 12000, step: 60 },
    ],
  },
];

export const ALL_KEYS: ParamKey[] = GROUPS.flatMap(g => g.fields.map(f => f.key));

/* A snapshot of the live singleton in mirror shape. fromEntries loses the
   key/value pairing, so the result is asserted back into the shape it was
   built from. */
export function snapshotParams(): ParamMirror {
  return Object.fromEntries(ALL_KEYS.map(k => [k, Hyperparams[k]])) as ParamMirror;
}
