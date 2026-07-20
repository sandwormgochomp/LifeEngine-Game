// What each cell type does. Shared by the Organism Lab palette tooltips and
// the About panel's legend.
export const CELL_INFO: Record<string, string> = {
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
  shooter: 'Fires at targets the organism sees',
};
