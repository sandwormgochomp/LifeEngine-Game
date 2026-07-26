import type { LivingCellName } from '../Organism/Cell/CellStates';
import { WALL_BRAIN_CELLS } from '../Organism/Cell/BodyCells/BrainCell';
import { SHOT_COST } from '../Organism/Cell/BodyCells/ShooterCell';

// What each cell type does. Shared by the Organism Lab palette tooltips and
// the About panel's legend.
/* Keyed by living cell-state name: both consumers (the Organism Lab palette
   and the About legend) walk CellStates.living, and every living cell type has
   an entry, so the map is total rather than Partial. Typing the keys means an
   entry for a cell type that does not exist fails to compile. */
export const CELL_INFO: Record<LivingCellName, string> = {
  mouth: 'Eats adjacent food',
  producer: 'Grows food in nearby empty cells',
  mover: 'Lets the organism move and turn',
  killer: 'Harms organisms it touches',
  armor: 'Blocks killer cells',
  eye: 'Sees ahead to steer movers. Click a placed eye to rotate it',
  healer: 'Repairs damage by spending stored food',
  explosive: 'Explodes on death, harming everything nearby',
  poison: 'Poisons organisms that touch it',
  pheromone: 'Emits a signal other organisms can sense',
  common: 'Plain structural cell',
  parasite: 'Steals food from adjacent organisms',
  chameleon: 'Invisible to eyes',
  shooter: `Fires at other species in line of sight, ${SHOT_COST} food a shot`,
  // Quoted from the constant rather than written out, so the palette can never
  // advertise a threshold the simulation does not enforce.
  brain: `Does nothing alone; ${WALL_BRAIN_CELLS} in one body let it build walls`,
};
