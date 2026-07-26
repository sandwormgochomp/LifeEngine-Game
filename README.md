# The Life Engine

[**Play here!**](https://sandwormgochomp.github.io/LifeEngine-Game/)

The Life Engine is a cellular automaton designed to simulate the long-term processes of biological evolution. Organisms eat, reproduce, mutate, and adapt. Unlike genetic algorithms, nothing is selected for a given task — true natural selection runs its course. Organisms that survive, successfully produce offspring, and out-compete their neighbors naturally propagate throughout the environment.

This is a fork of [The Life Engine](https://github.com/MaxRobinsonTheGreat/LifeEngine) by MaxRobinsonTheGreat, rebuilt on React + TypeScript + Vite and extended with new cell types, world mechanics, and tooling.

For feature requests use the Discussions tab; for bug reports use the Issues tab.

# Setup

Requires [Node.js and npm](https://nodejs.org/en/download/).

```sh
git clone https://github.com/sandwormgochomp/LifeEngine-Game.git
cd LifeEngine-Game
npm install
npm run dev
```

The dev server starts at `http://localhost:3000` with hot reload.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check with `tsc` and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Playwright test suite (first time: `npx playwright install`) |
| `npm run bench` | Run the tracked benchmark harness with drift reporting |
| `npm run deploy` | Build and publish `dist/` to the `gh-pages` branch |

# How the Game Works

## The Environment

The world is a grid of cells. At every tick each cell has a type. Independent cells exist on their own in the grid:

- **Empty** — inert background.
- **Food** — nourishment for organisms.
- **Wall** — blocks movement and reproduction.

The environment is populated by organisms — structures built from the living cell types below.

## Cell Types

Each color does one job:

- **Mouth** — eats adjacent food.
- **Producer** — grows food in nearby empty cells.
- **Mover** — lets the organism move and turn.
- **Killer** — harms organisms it touches.
- **Armor** — blocks killer cells.
- **Eye** — sees ahead to steer movers (click a placed eye to rotate it).
- **Healer** — repairs damage by spending stored food.
- **Explosive** — explodes on death, harming everything nearby.
- **Poison** — poisons organisms that touch it.
- **Pheromone** — emits a signal other organisms can sense.
- **Common** — plain structural cell.
- **Parasite** — steals food from adjacent organisms.
- **Chameleon** — invisible to eyes.
- **Shooter** — fires at targets in line of sight, 2 food a shot and 5 damage a hit. Each shooter cell aims on its own along the four cardinal directions, out to the look range (halved at night, like an eye's), and holds fire on its own species and on anything hidden by a chameleon. A `shoot` brain action fires one as well, along the organism's heading.
- **Brain** — does nothing on its own. Ten of them in one body let it build walls (the `build wall` brain action, 5 food per wall). The only cell whose effect is a quantity rather than a behaviour: one is pure upkeep, so wall-building is something a lineage has to commit to rather than stumble into.

## Organisms

Organisms are structures of cells that eat food, reproduce, and die. When an organism dies, every grid cell its body occupied turns to food. Lifespan is the organism's cell count multiplied by the `Lifespan Multiplier` hyperparameter; an organism survives that many ticks unless killed first. When touched by a killer cell an organism takes damage, and dies once it has taken as much damage as it has cells (or immediately, if `One touch kill` is on).

## Reproduction

Once an organism has eaten as much food as it has cells, it attempts to reproduce. The offspring is a clone of the parent, possibly mutated. A birth location is chosen far enough away in a random direction that the child can't intersect its parent, plus a little random variance. Reproduction fails if the offspring would overlap non-empty cells — and the food spent is wasted.

## Mutation

Offspring can mutate in three ways: change a random cell to a random type, lose a random cell, or add a cell adjacent to an existing one. Losing cells can leave gaps or disconnected cells — that's a feature, not a bug. Mutations can also alter an organism's movement patterns and brain behaviors.

## Movement and Rotation

Organisms with a mover cell move freely about the grid (one mover is enough; extras do nothing). By default an organism picks a random direction and moves one cell per tick for a number of ticks called its move range, which can mutate over time. Organisms rotate around a central pivot cell — a cell mutation can retype but never remove. Offspring rotate randomly at birth (toggleable in the simulation controls).

## Eyes and Brains

Any organism can evolve eyes, and an organism with both eyes and movers gets a brain. An eye looks in the direction of its slit and sees the first non-empty cell within range. The brain maps what is seen to an action — ignore, chase, or retreat. For instance, chase food, retreat from killer cells. These behaviors mutate over time, so hunting and fleeing strategies evolve on their own.

## Shaping the World

You interact with the world directly: drop food, walls, or radiation, kill organisms, generate perlin-noise wall mazes, and tune hyperparameters and evolution controls while the simulation runs. The world also supports a day/night cycle. Use the **Organism Lab** to build your own organism cell-by-cell and deploy it into the world, or sample an existing organism to inspect and edit it.

### Hotkeys

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `A` | reset view |
| `S` | drag view |
| `F` | drop food |
| `D` | drop wall |
| `R` | drop radiation |
| `G` | click to kill |
| `B` | clear all walls |
| `H` | toggle rendering |
| `Z` | sample organism |
| `X` | open the lab |
| `C` | deploy organism |
| `Esc` | back out / close |
