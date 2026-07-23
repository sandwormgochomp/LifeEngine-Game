# Repo Tidy-Up TODO

Organism Lab
- [ ] Move name input to top-center
- [ ] For each cell type, have a hover live preview that demonstrates how it excels (killer cell killing, armor cell protecting, poison cell poisoning, etc)

---

# Interface review: counter-intuitive behaviour

Findings from a read of the HUD, dock, modals and the two canvas controllers.
Re-verified against the current code on 2026-07-22 — items resolved by the
HUD refactor (tool palette, speed ladder, New Game flow) have been removed.
Groups are ordered so each one is a single coherent sitting — the items inside a
group touch the same files and share a decision, so splitting them means making
the same call twice.

## Group 1 — The hint bar tells the truth

All four items are `renderClickHint` in `src/components/HudBottomBar.tsx:51` plus
the mode plumbing behind it. Fix them together or the bar stays inconsistent.

- [ ] **The idle-mode hint is wrong.** The `default:` branch
      (`HudBottomBar.tsx:108`) advertises "sample organism · erase · pan".
      In `Modes.None` the controller does neither: `performModeAction`
      (`src/Controllers/EnvironmentController.ts:243`) guards on
      `mode != Modes.None`, so left and right click are no-ops and only
      middle-drag works. Either implement click-to-sample in `None` or make the
      hint say "nothing armed — pick a tool".
- [ ] **The world boots with Food armed.** `EnvironmentController` sets
      `this.mode = Modes.FoodDrop` in its constructor
      (`EnvironmentController.ts:122`), so a first-time user's very first click
      paints food. The tool palette does highlight the armed tool now
      (`HudToolPalette.tsx:91`), so this is visible — decide whether starting
      armed is actually intended, or start in `None`.
- [ ] **Headless silently eats every tool.** `performModeAction` returns early
      when `WorldConfig.headless` unless the mode is `Drag`
      (`EnvironmentController.ts:238`), but the hint bar still reads "place
      food". The `RENDERING OFF` overlay (`App.tsx:318`) should say tools are
      disabled, or the hint bar should switch to a disabled state.
- [ ] **Drag mode hides middle-click pan.** Its hint (`HudBottomBar.tsx:102`)
      lists only left-drag and wheel, while every other mode advertises middle
      pan. Middle pan works in Drag too — the `else if (this.middle_click)`
      branch (`EnvironmentController.ts:339`) is mode-independent.

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
      "drag"; `S` is drag but reads as "save"; `A` resets the view. See
      `App.tsx:170-172`.
- [ ] **`Z` is overloaded around the lab.** Bare `Z` toggles Sample globally
      (`App.tsx:183` — internally still `Modes.Select`) while `Ctrl+Z` is the
      lab's undo (`EditorDock.tsx:193`). With the dock open and a slider or
      button focused, a missed modifier arms a world tool instead of undoing.
