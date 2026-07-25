# Repo Tidy-Up TODO

Better sandbox (make the sim more legible & rewarding to watch, 2026-07-24)
Direction chosen over "game with goals": keep it open-ended, raise the payoff
of observing. Ordered by fun-per-effort; #1 is the anchor and reuses existing
Notifier / FossilRecord / Floaties infrastructure.
- [x] ~~**Self-narrating events (anchor).**~~ — done. `src/Stats/Narrator.ts`
      poll-and-diffs the extant-species set, population, and largest-cell record
      once per data-update window (piggybacking `FossilRecord.updateData`'s
      cadence) and fires `Notifier` toasts: new lifeform (coalesced past one),
      lineage extinct with name + derived age, new largest-organism record, mass
      extinction (≥40% pop drop, guarded above 10). Detection lives in
      `WorldEnvironment.update` on purpose — the Lab preview's mini-sim has its
      own `update()`, so its births/deaths never narrate, and nothing in
      `Species`/`Organism`/`FossilRecord` was touched. `Floaties` turned out to
      be decorative dust with no text API, so world-anchored labels were dropped
      in favour of toasts (revisit under "First-run legibility" hints).
      `tests/narrator.spec.js` covers every event type, the coalescing/threshold
      boundaries, silent re-seed on reset/load, the live `update()`→DOM path, and
      that registry changes without a sample stay silent (the preview-gating proof).
- [x] ~~**Finish the world-event library.**~~ — done. All five events ship and
      the `soon` scaffolding is gone. Ice Age is the bloom with the multiplier
      inverted (0.15× for 1200 ticks), so both now go through one
      `triggerFoodShift`; they are mutually exclusive because an ice age started
      mid-bloom would capture the *spiked* foodProdProb as its baseline and
      restore the world to a permanent glut. Rad Storm needed the genuinely new
      piece: `WorldEvent` gained an optional `step()` run once per tick, and the
      storm carries a band of irradiated columns across the world, owning its
      cells individually so it sweeps over hand-painted zones and leaves them
      standing. One storm at a time — two overlapping fronts would each think
      they owned the overlap. Auto-scheduling is built too:
      `Hyperparams.randomEvents` / `randomEventInterval` in Evolution Controls,
      off by default, and `maybeScheduleRandomEvent` draws no RNG at all while
      off, so `npm run bench` ticks exactly as it did before. The predator is
      deliberately out of the rotation — it introduces a lineage and registers a
      species, which is a decision rather than weather.
      One trap worth remembering: `RadiationSmoke` cached its parsed cells on
      `radiation_map.size`, which a moving front defeats (it adds one column and
      drops another in the same step, so size never changes). Hence
      `env.radiation_version`, bumped by every writer. `tests/world_events.spec.js`
      covers both new events, the mutual exclusion, storm ownership, and the
      scheduler's silence when off; the ownership and version guards were each
      verified to fail when deliberately broken.
- [x] ~~**Overhaul the evolution window.**~~ — done, as two tabs over one set
      of parameters (`concepts/evolution-window-overhauls.md` proposes five
      treatments; two were built). **Console** promotes abundance / lifespan /
      mutation to pixel dials, puts the four world-reshaping toggles in a hazard
      block, and replaces hover tooltips with always-visible consequence lines.
      **Fate Deck** is seven cards played at the world — bundled parameter
      pressures that wind themselves back, on the `active_events` queue the
      weather already used. A third tab, **Manual**, carried the pre-React flat
      list until the Console's FINE TUNING fold was widened to hold every
      parameter without an exact control up top — which is that list, in place,
      so the tab was two names for one surface and went. The fold now also
      carries typed rows for the three dialled parameters (a log-scale dial can
      be aimed but not typed at) and for `useGlobalMutability`, the one control
      the dials could only reach by overwriting the rate in the same gesture.
      The engine's `triggerFoodShift` is now the one-field case of a general
      `triggerParamShift`; bloom/ice-age exclusion falls out of the rule that no
      two live shifts may hold the same field. Two bugs came out of it: a card in
      flight survived a world load (`active_events` is an array, so the save
      round trip never touched it), and the window kept displaying values an
      expired era had already wound back.
      Guardrail held throughout: a card is a pressure, never a result — it
      changes what the world rewards and never targets a species or trait.
      The Great Cull is the one exception and earns it by being blind.
- [ ] **The other three evolution-window treatments.**
      `concepts/evolution-window-overhauls.md` — **Live Petri** (dock it instead
      of covering the world with a backdrop; the feedback loop already exists and
      the modal is the only thing hiding it) is the cheapest and probably the
      best of the remainder. **Four Forces** (21 params → four named macro dials)
      and **Test Chamber** (fork the world, fast-forward 2000 ticks, forecast
      before committing — needs a Web Worker) are the bigger bets.
- [ ] **No sign a control is currently held by an era.** Editing a field a live
      Fate Deck card holds now takes it off that era rather than letting the
      era's expiry throw the edit away, and says so in a toast
      (`WorldEnvironment.releaseParamClaim`) — but until you touch it, nothing
      on the Console marks the value as borrowed rather than yours.
- [ ] **Predator bestiary: what the trials showed.** Six species in
      `src/Organism/Predators.ts`, each tuned against a 2400-tick trial in
      several grown worlds. Three lessons, if more are added: a functional cell
      walled in by its own body never fires (an enclosed killer or parasite is
      pure upkeep); every predator needs a rank of mouths on its perimeter or it
      starves beside its own kills; and only `has_shooter` matters, so extra
      shooter cells buy nothing. Outcomes stay world-dependent by design — a
      pack dropped into a food-starved world dies, and so does that world.
- [x] ~~**First-run legibility, not a tutorial.**~~ — done. The very first
      visit (localStorage flag, `?firstrun=off` to opt out — the fixtures and
      bench do) fires three one-line labels anchored to real organisms through
      `overlayCamera()`, telling the origin world's own story: the founder
      ("click it to look inside"), the producer food economy, and the first
      species to branch off it. Nothing blocks and nothing must be clicked.
      Hints stop the moment `env.organisms` is reassigned — the one signal that
      the world they were narrating was reset or replaced.
      **A curated demo world was tried here first and pulled.** The first visit
      used to `loadRaw()` a bundled world (ArthursWorld, picked by auditioning
      all 20) over the origin world, so a new player never saw the petri dish
      the simulation is about — and it applied that world's saved `controls`
      over the user's Hyperparams silently, where the Worlds picker gates the
      same call behind a checkbox. The hints turned out not to need it: on a
      one-organism world the "new species" beat *is* the first branch off the
      founder, which reads better than it did on a crowded world.
      Three things the sparse world forced. The producer hint can re-anchor on
      the founder (which is itself a producer) when nothing else is on screen
      yet, rather than being dropped — `REPEAT_AFTER` in `FirstRunHints.tsx`.
      A hint whose anchor *dies* now moves to another organism making the same
      point instead of vanishing with it: organisms here are short-lived by
      design, and at 8x the old behaviour cut hints down to an unreadable flash
      (measured at 2–57ms against a 900ms fast-pace `HINT_MS`). That is what
      `ActiveHint.kind` and the shared `anchorFor()` exist for.
      And the third hint's patience is budgeted in **sim ticks**, not
      wall-clock: pausing to click the founder is exactly what the first hint
      asks for, and it must not spend the third one's budget. 3000 ticks, from
      measurement — `scripts/measure-origin-world.js` (which replaced the
      audition harness) put the first non-founder species between 54 and 1103
      ticks across 15 runs, median ~330.
      `tests/first_run.spec.js` covers the origin world surviving the first
      visit, the flag, the opt-out, hints not returning on a later visit, hint
      anchoring in-viewport, reset-kills-hints, a hint outliving its anchor,
      and all three beats firing in order (`?hintpace=fast` compresses the
      wall-clock timings 10x to fit the 15s test budget; the tick budget is
      bought with `setSpeedIndex` instead). The outlives-its-anchor test was
      checked against a deliberately broken re-anchor and fails on it.
- [x] ~~**Follow-a-lineage.**~~ — done. The sample click (Select tool or unarmed
      left-click) now persists focus: `env.followOrganism` hands the live world
      organism to `env.lineage` (`src/Stats/LineageTracker.ts`, owned
      per-environment, not a singleton). Tracking is by organism reference, not
      species — a mutated child founds a new species but stays in the line,
      which is the point of following one. Birth/death reach the tracker via
      optional `OrganismEnv.onOrganismBorn/onOrganismDied` hooks that only
      WorldEnvironment implements — the Narrator's preview-gating argument
      applied at the env seam instead of the sampling cadence, because a birth
      hook needs the parent and only `reproduce()` still knows it. The line is
      tinted cyan by the decoration pass (`drawHighlightedSprite` grew the
      colour param), `LineageCard.tsx` keeps the tally top-right (steps left of
      the perf panel; stays up frozen after extinction until dismissed), and
      toasts narrate births/deaths under coalescing keys throttled to one per
      30 ticks — founder death and line-end always announce. Cleared silently
      on reset/load: tracking is live references and cannot round-trip a save.
      `tests/lineage.spec.js` covers the click→card path, descendant capture,
      extinction, dismissal, silent reset, and the exact toast/throttle
      sequence. Found while testing: the two editor-dock snapshots in
      `tests/visual.spec.js` already fail on this branch before these changes
      (font-rendering drift against the committed goldens), so they are not a
      regression gate for this work.
- [ ] **Close trust papercuts** (see also the interface-review section below):
      GEN→TICKS, collapse duplicated LIFEFORMS/Species labels, fix the
      magnifier that resets zoom, add +/− zoom controls.
- [ ] **Tighten action→reaction.** Make food/radiation/wall drops show their
      consequence — briefly glow affected cells, reveal what a radiation burst
      actually mutated. Powerful systems that currently feel disconnected.

Organism Lab
- [ ] Move name input to top-center
- [ ] For each cell type, have a hover live preview that demonstrates how it excels (killer cell killing, armor cell protecting, poison cell poisoning, etc)

Preview environment — singleton workarounds (2026-07-24)
The hover previews run a real mini-sim (`PreviewEnvironment`) beside the real
world. Hyperparams is now injected cleanly (per-organism `hyperparams`, defaults
via `makeDefaultHyperparams`). Three other module singletons the preview can't
own are still worked around by mutation / sentinels / a semantic lie instead of
being injected or stubbed the same way. Same root cause; fix them together.
- [ ] **`Perf.enabled` global toggle.** `PreviewEnvironment.runIsolated` flips
      the shared `Perf.enabled` off around a synchronous tick and restores it in
      a `finally`, so preview work doesn't pollute the world's perf-panel
      buckets. Same swap-a-global anti-pattern we removed for Hyperparams: it
      only stays safe while the tick body is synchronous. Inject/stub a Perf
      sink instead (or make the preview's `Organism.update` path not probe Perf).
- [ ] **`species.population = 1e9` sentinel.** `PreviewEnvironment.spawn` parks
      population at a billion purely so `Species.decreasePop()` never reaches
      `<= 0` and calls `FossilRecord.fossilize()` (which would `console.warn`
      about an unregistered species). Suppresses a side effect with a magic
      number and depends on the exact `population <= 0` check in `Species.ts`.
- [ ] **`canAddOrganism() { return false }` as a reproduction kill-switch.**
      Its real meaning is "the world is full"; the preview returns false to mean
      "never reproduce" — which also happens to close the only path to
      `FossilRecord.addSpecies`. The method is made to lie about world state to
      suppress a whole code path as a side effect.
      Root: `FossilRecord` / `Species` population / `Perf` are module singletons
      the preview world can't own. The consistent fix is to inject them (or hand
      `PreviewEnvironment` a no-op stub of each), matching the Hyperparams work,
      rather than trick the globals.

Performance (bundled-world evaluation, 2026-07-23)
- [x] ~~Producer-path early-out~~ — done, and it does not move the needle.
      Recorded here because the *diagnosis* was wrong in a way worth not
      repeating: `org_cells` does dominate shrubland's tick (11.7ms of
      21.5ms), but producers are only 1.7ms of it. Mouth cells are 5ms —
      18.5k of them, each scanning 4 neighbours every tick. Micro-optimising
      around that (indexed loops for the neighbour scans, inlined `cellAt`
      bounds test, call-site null guards) measured **zero** aggregate gain
      over 5 trials × 120 ticks and was reverted; V8 was already handling it.
- [x] ~~Food-adjacency counter~~ — done. `Cell.food_adj` counts orthogonally
      adjacent food, maintained solely by `GridMap`, so a mouth rules out its
      whole neighbourhood with one read instead of four lookups (99%+ of the
      time on every world measured). Interleaved A/B, median of 5×120 ticks:
      `org_cells` 2.45→1.96 µs/org-tick at shrubland (−20%) and 2.19→1.36 at
      Epic (−38%); whole tick −13% and −14%. `tests/food_adjacency.spec.js`
      guards the invariant and was verified to fail when the maintenance is
      deliberately broken.
- [x] ~~Typed-array grid / slimmer cells~~ — done, and it delivered on all
      three counts. `GridMap` is now parallel arrays indexed `col*rows + row`
      (a `Uint8Array` of `CellStates.all` indices, plus food_adj, durability,
      stale, and two JS arrays for the owner references) instead of a
      `Cell[][]`. `GridCell` is a `(map, index)` view built on demand for the
      cold paths; the sim reads scalar accessors and allocates nothing.
      Anything that remembers cells now remembers indices — the renderer's
      dirty/highlight sets, `env.walls`, the cursor overlay, `cur_idx`.
      Interleaved A/B, median of 5×120 ticks at shrubland:
      `org_cells` 1.62→1.04 µs/org-tick (−36%), whole tick −19%, world load
      362→284ms (−22%), heap 160→92MB (−43%). At HighDefSweepers, the world
      that motivated this: load 551→176ms (−68%), heap 159→36MB (−77%).
      Full-grid repaint −10%; the dirty-cell pass is unchanged.
      Two notes for whoever measures here next: `npm run bench`'s lattice has
      no producers and responds weakly, and its drift medians go stale when
      the machine is loaded, so interleave A/B builds rather than trusting the
      reported delta. And `grid_map.grid` still exists as a cached
      materialization of the old `Cell[][]` — the specs read it, nothing in
      the engine does, and touching it from engine code allocates the per-cell
      objects this work removed.
- [ ] **`food_adjacency.spec.js`'s fallback test is seed-dependent.** "Falls
      back to the full scan when the edible set is not the four neighbours"
      hunts the randomly-generated origin world for a mouth with `food_adj === 0`
      and a clear diagonal, and bails with `no mouth with a clear diagonal` when
      the seed hands it none — seen failing once in a full run on 2026-07-25 and
      passing on the next. It should build the arrangement it needs rather than
      look for it; every other test in the file is deterministic.

---

# Interface review: counter-intuitive behaviour

Findings from a read of the HUD, dock, modals and the two canvas controllers.
Re-verified against the current code on 2026-07-22 — items resolved by the
HUD refactor (tool palette, speed ladder, New Game flow) have been removed.
Groups are ordered so each one is a single coherent sitting — the items inside a
group touch the same files and share a decision, so splitting them means making
the same call twice.

## Group 2 — One concept, one name

Pure naming pass, no behaviour change. Cheap, and it makes the rest of the audit
easier to reason about.

- [ ] **`GEN:` is not a generation count.** `HudTopCenter.tsx:13` binds it to
      `env.total_ticks`, which is incremented once per simulation tick
      (`WorldEnvironment.ts:347`). Rename to `TICKS`, or surface an actual
      generation figure.
- [ ] **`LIFEFORMS` and `Species` are the same number.** Both call
      `FossilRecord.numExtantSpecies()` — `HudTopCenter.tsx:15` and
      `Tabs/StatsTab.tsx:41` — under two different labels. Pick one word.

## Group 3 — Affordances that don't match behaviour

Top HUD readouts and controls. Small, self-contained.

- [ ] **The magnifying glass resets zoom.** `HudTopRight.tsx:40` — a magnifier
      universally reads as *zoom in*, and zoom still has no `+`/`−` controls at
      all (wheel only).
- [ ] **`LIFEFORMS` is a button dressed as a readout.** `.statButton`
      (`Hud.module.css:1615`) strips background, border and padding, leaving it
      pixel-identical to the inert `GEN`/`POP` beside it; only a hover text-glow
      distinguishes it. A CSS comment says the double-duty is deliberate —
      decide whether that stands, then close this either way.
- [ ] **The speed ladder briefly lights Pause on first paint.** Before the
      engine mounts, the `speedIndex` fallback is 0 while `DEFAULT_SPEED_INDEX`
      is 1 (`Engine.ts:53`, `HudTopLeft.tsx:34`), so Pause shows as the active
      rung for a moment even though the world starts running.
- [ ] **The perf panel still covers the editor dock's close button.** Same bug
      the lineage card had: `.perfPanel` (`PerfPanel.module.css:7`) and
      `.dockWrap` (`Hud.module.css:858`) both pin to `right: 12px` near the top,
      and the dock has the *lower* z-index (98 vs 100), so the readout draws over
      its header and the ✕. The lineage card was fixed by moving it into the
      top-left column, which left the perf panel as the last squatter on that
      anchor. Cheapest fix is raising the dock above the panel; the better one is
      shifting the panel left by the dock's width (64px rail + 6px gap + 348px
      body) while the dock is open, since hiding a live timing readout behind the
      dock is its own bug.

## Group 4 — Modal and tool flow

- [ ] **Escape follows a fixed list, not the visual stack.** The chain in
      `src/components/App.tsx:106-133` always drains modals in a hardcoded
      order before the armed world tool — not the order the windows are
      actually stacked on screen.
- [ ] **Picking a colour changes your tool.** `handleColorChange`
      (`EditorDock.tsx:140`) sets `mode = Modes.Paint` as a side effect, so
      touching the swatch while drawing silently swaps the active tool.

## Group 5 — Destructive actions

- [ ] **"Seed World" undersells what it does.** The prompt says "Clear the world
      and seed it with this organism?" (`EditorDock.tsx:173`); `env.reset(false)`
      (`WorldEnvironment.ts:675`) also clears food, radiation and the fossil
      record, and walls too when `clear_walls_on_reset` is set.

## Group 6 — Settings that silently don't apply

Both are the same failure: a control whose effect depends on state living in a
different window, with no cross-reference.

- [ ] **The lab's "Mutation rate" can be inert.** `EditorDock.tsx:407` edits
      `organism.mutability`, which the engine ignores whenever
      "Use evolved mutation rate" is off in Evolution Controls
      (`evolutionParams.ts`, the `useGlobalMutability` field). The field stays
      fully editable and gives no hint that a global override is winning.
      The evolution window's Console dial now states this where it applies
      (EVOLVED vs MANUAL); the lab still doesn't.
- [ ] **Healer cost exists twice with unstated precedence.** Per-organism
      `healer_food_cost` (`EditorDock.tsx:414`) and global `healerFoodCost`
      (`evolutionParams.ts`, the Cells group) share a label across two windows.
      Actual behaviour: the global value is only the default at spawn
      (`Organism.ts:184`); runtime always uses the per-organism value
      (`HealerCell.ts:14`). Say so in both tooltips.

## Group 7 — Hotkeys

- [ ] **Hotkeys are only discoverable in ABOUT.** The `HOTKEYS` table
      (`Tabs/AboutTab.tsx:6`) is the sole listing for the bottom toolbar; its
      buttons carry no hotkey in their tooltips even though `X` toggles LAB
      (`HudBottomBar.tsx:16-23`, `App.tsx:186`). The tool palette does this
      right — its tooltips carry "Hotkey: Z" etc.
- [ ] **The letters fight their mnemonics.** `D` drops walls but reads as
      "drag"; `A` resets the view. See `App.tsx:170-171`.
- [ ] **`Z` is overloaded around the lab.** Bare `Z` toggles Sample globally
      (`App.tsx:183` — internally still `Modes.Select`) while `Ctrl+Z` is the
      lab's undo (`EditorDock.tsx:193`). With the dock open and a slider or
      button focused, a missed modifier arms a world tool instead of undoing.
