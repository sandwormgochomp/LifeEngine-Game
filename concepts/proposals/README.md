# Evolution overhaul — proposal set

A menu of design proposals for the sim's evolutionary core, its legibility, and
its drama. Written 2026-07-24 against the code on `feat/self-narrating-events`.

Until now `concepts/` held only UI mockup images (speed controls, HUD dithering,
sliders). These are the first design docs; they sit alongside those mockups, not
replacing them.

Each proposal ships with a pixel-art concept illustration (`NN-*.svg`, drawn in
the game's own cell palette on the petri-dish background) embedded at the top of
its doc — open any `.md` to see it, or the `.svg` on its own.

## Why now

The sim's selection is genuinely open-ended — nothing is optimised for a task,
which is the whole point (`README.md`, "true natural selection"). But three
things blunt the payoff of watching it:

1. **Selection has weak teeth.** Reproduction costs a flat `cells.length` of food
   (`Organism.ts:256`), producers make food for free nearby, and lifespan just
   scales with size (`Organism.ts:260`). With food effectively unlimited, the
   dominant strategy collapses to *large producer blobs* on most worlds — the
   classic Life Engine attractor. Little pressure means little visible change.
2. **The world is one flat niche.** Apart from a global day/night flip every 60s
   (`WorldEnvironment.ts:318`) and a purely decorative petri-dish rim
   (`WorldEnvironment.ts:685`, rendering only), the interior is spatially
   homogeneous. No gradients means no niches means no speciation you can point at.
3. **The story is invisible.** Ancestry is *recorded* — `Species.ancestor`
   (`Species.ts:46`) and the `FossilRecord` — but never shown as a tree, and the
   HUD spends its pixels on duplicated raw counters (`GEN`/`TICKS`,
   `LIFEFORMS`/`Species` — see `TODO.md` interface review) instead of "what is
   happening right now."

The `TODO.md` direction is already the right one: *"keep it open-ended, raise the
payoff of observing."* These proposals extend that from narration into the
mechanics themselves.

## The set

Grouped by the three aims. Each doc is self-contained: Problem → Current code →
Proposal → Why it's exciting → Effort → Risks.

### Overhaul evolution — give selection teeth
- **[01 — Metabolic economy](01-metabolic-economy.md)** *(anchor, highest leverage)*
  Per-cell upkeep so size is a real trade-off, not a free win. Turns "blob wins"
  into an actual optimisation landscape. Small, self-contained, big behavioural change.
- **[02 — Biomes & gradients](02-biomes-and-gradients.md)**
  Spatial resource/hazard fields so different regions reward different body plans
  → allopatric speciation you can see on the map.
- **[03 — Recombination](03-recombination.md)**
  Optional gene-mixing when compatible lineages breed adjacent. Lets good traits
  from two lines combine instead of waiting for both to arise in one.
- **[04 — Structured mutation](04-structured-mutation.md)**
  Add duplication and symmetry to the three flat point-mutations so complex,
  reachable body plans (segmented, radial) actually evolve.

### Cull information — make the state legible
- **[05 — HUD information diet](05-hud-information-diet.md)**
  Kill the duplicated/misleading readouts, demote raw counters, and spend the
  reclaimed space on one legible ecology line. Closes much of the `TODO.md` review.
- **[06 — Ecology at a glance](06-ecology-at-a-glance.md)**
  A living phylogenetic tree (ancestry already exists) plus a dominant-lineage
  stacked band, replacing wall-of-numbers stat panels.

### Make it exciting — punctuate the equilibrium
- **[07 — World events](07-world-events.md)**
  Cataclysms, blooms, and invasive predators — scheduled or player-triggered —
  that break stasis and create the arms races worth watching. Ties into the
  Narrator and the planned follow-a-lineage camera.

## Recommended path

Start with **01 (metabolic economy)** — it is the smallest change that most
directly fixes "nothing interesting happens," and every other proposal is more
fun once size has a cost. Then **05/06** so the player can *read* the result.
Then pick **02 or 07** depending on taste: 02 for slow, structural richness;
07 for immediate spectacle. **03/04** are the deep-cut genetics bets — highest
ceiling, most engine risk — do them once the loop above is proven.

None of these require abandoning the pure-selection premise. They change *what
the environment rewards* and *what the player can see* — not *what is selected
for*.
