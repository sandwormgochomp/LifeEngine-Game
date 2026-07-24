# Repo Tidy-Up TODO

Organism Lab
- [ ] Move name input to top-center
- [ ] For each cell type, have a hover live preview that demonstrates how it excels (killer cell killing, armor cell protecting, poison cell poisoning, etc)

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
      (`EvolutionControlsModal.tsx:70`). The field stays fully editable and
      gives no hint that a global override is winning.
- [ ] **Healer cost exists twice with unstated precedence.** Per-organism
      `healer_food_cost` (`EditorDock.tsx:414`) and global `healerFoodCost`
      (`EvolutionControlsModal.tsx:80`) share a label across two windows.
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
