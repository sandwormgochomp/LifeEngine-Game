# Important TODO

- [x] Move random walls, clear walls, clear radiation as tools in the new tool ui
- [x] Move "seed random life" as a tool in the tool ui except now it paints random life within the brush

- [x] Instead of "Restart" it's now "New Game" - which only exists on the button in the top-left. A new game has the following optioins from World Controls
  - [x] Petri dish world option
  - [x] Clear walls on reset
  - [x] Cell size
  - [x] Life (a checkbox to start with life)
  - [x] Reset on extinction
  - [x] Pause on extinction
- [x] Remove World Controls / "Environment" once basically everything is moved elsewhere
- [x] "Rules" is now "Evolution" and has a DNA iicon
  - [x] Instead of inputs use sliders
- [x] Select is a tool (the first one) instead of being in the center hud group


# Repo Tidy-Up TODO

Working branch: `update-interface`

Organism Lab
- [ ] Move name input to top-center
- [ ] For each cell type, have a hover live preview that demonstrates how it excels (killer cell killing, armor cell protecting, poison cell poisoning, etc)
- [x] Update the life forms modal so that it live-updates as life forms die and are created

---

# Interface review: counter-intuitive behaviour

Findings from a read of the HUD, dock, modals and the two canvas controllers.
Groups are ordered so each one is a single coherent sitting — the items inside a
group touch the same files and share a decision, so splitting them means making
the same call twice.

## Group 1 — The hint bar tells the truth

All four items are `renderClickHint` in `src/components/HudBottomBar.tsx:54` plus
the mode plumbing behind it. Fix them together or the bar stays inconsistent.

- [ ] **The idle-mode hint is wrong.** The `default:` branch
      (`HudBottomBar.tsx:106`) advertises "left: select organism · right: erase".
      In `Modes.None` the controller does neither: `performModeAction`
      (`src/Controllers/EnvironmentController.js:135`) guards on
      `mode != Modes.None`, so left and right click are no-ops and only
      middle-drag works. Either implement click-to-select in `None` or make the
      hint say "nothing armed — pick a tool".
- [ ] **The world boots with Food armed.** `EnvironmentController` sets
      `this.mode = Modes.FoodDrop` in its constructor (line 25), so a first-time
      user's very first click paints food. Nothing in the bottom toolbar lights
      up to say so — `ENVIRONMENT` is lit by `worldOpen`, not by the active mode
      (`HudBottomBar.tsx:125`). Either start in `None` or reflect the armed
      world tool in the toolbar.
- [ ] **Headless silently eats every tool.** `performModeAction` returns early
      when `WorldConfig.headless` unless the mode is `Drag`
      (`EnvironmentController.js:130`), but the hint bar still reads "place
      food". The `RENDERING OFF` notice should say tools are disabled, or the
      hint bar should switch to a disabled state.
- [ ] **Drag mode hides middle-click pan.** Its hint (`HudBottomBar.tsx:100`)
      lists only left-drag and wheel, while every other mode advertises middle
      pan. Middle pan works in Drag too — the `else if (this.middle_click)`
      branch is mode-independent.

## Group 2 — One concept, one name

Pure naming pass, no behaviour change. Cheap, and it makes the rest of the audit
easier to reason about.

- [ ] **`GEN:` is not a generation count.** `HudTopCenter.tsx:13` binds it to
      `env.total_ticks`, which is incremented once per simulation tick
      (`WorldEnvironment.js:138`). Rename to `TICKS`, or surface an actual
      generation figure.
- [ ] **`LIFEFORMS` and `Species` are the same number.** Both call
      `FossilRecord.numExtantSpecies()` — `HudTopCenter.tsx:15` and
      `StatsTab.tsx:40` — under two different labels. Pick one word.
- [ ] **Toolbar labels don't match the windows they open.** `RULES` opens
      "EVOLUTION CONTROLS", `ENVIRONMENT` opens "WORLD CONTROLS", `EDIT` opens
      "ORGANISM LAB" (`HudBottomBar.tsx:18-26` vs each modal's `panelTitle`).
      Nothing links the button you pressed to the title you land on.
- [ ] **The gear icon is misleading.** `fa-gear` on `ENVIRONMENT` reads as
      application settings; it opens food/wall/radiation painting tools. A globe
      or brush would match the contents — and the modal already uses
      `fa-earth-americas` in its own header.

## Group 3 — Duplicated controls that disagree

Each of these is the same action reachable from two places, and the two places
behave differently. Worth resolving as one pass so the winner is consistent.

- [ ] **Two Restarts, two outcomes.** `HudTopLeft.handleRestart`
      (`HudTopLeft.tsx:26`) calls `env.reset(true)` and stops. `WorldControls`
      Restart (`WorldControlsModal.tsx:72`) calls the same thing and *then*
      rebuilds the petri dish. `reset()` doesn't rebuild it
      (`WorldEnvironment.js:338`), so with `clear_walls_on_reset` on, the
      top-left button silently destroys the dish and the modal button doesn't.
      Their confirm prompts also describe different things ("reset the world
      environment" vs "restart with a single origin organism").
- [ ] **One floppy icon, two behaviours.** The top-left floppy
      (`HudTopLeft.tsx:71`) immediately downloads a world JSON with no dialog;
      the toolbar `SAVE` (`HudBottomBar.tsx:20`) opens a Save/Load panel. Same
      glyph, and the silent-download one is the one that looks like a toolbar
      button.
- [ ] **Select is armed from two places** — toolbar `SELECT`
      (`App.tsx:217`) and the lab's "Select from world" (`EditorDock.tsx:244`).
      They agree today, but they're separate code paths that both flip
      `env.controller.mode`; fold them into one handler.

## Group 4 — Affordances that don't match behaviour

Top-right HUD and the stats bar. Small, self-contained, all in two files.

- [ ] **The magnifying glass resets zoom.** `HudTopRight.tsx:75` — a magnifier
      universally reads as *zoom in*. Zoom also has no `+`/`−` at all while
      Speed right next to it does, so the two adjacent readouts offer opposite
      affordances.
- [ ] **Clicking the speed number is a hidden "+".** `HudTopRight.tsx:53`
      duplicates the `+` button. It's undiscoverable, and at max speed it
      silently does nothing while the real `+` button correctly disables itself.
- [ ] **Play and Pause are two buttons for one state**, while Space toggles
      (`App.tsx:126`). Before the engine loads neither is lit
      (`HudTopLeft.tsx:55`), so the world looks stateless on first paint.
- [ ] **`LIFEFORMS` is a button dressed as a readout.** `.statButton`
      (`Hud.module.css:1443`) strips background, border and padding, leaving it
      pixel-identical to the inert `GEN`/`POP` beside it; only a hover text-glow
      distinguishes it.

## Group 5 — Modal and tool flow

These share one decision: whether arming a world tool should dismiss the modal.
Answer it once and all three follow.

- [ ] **Arming a world tool leaves the modal in the way.** `setMode` in
      `WorldControlsModal.tsx:47` doesn't close the modal, and the modal sits on
      a full-screen dimmed backdrop (`Hud.module.css:989`). To actually paint,
      you arm the tool, then click the backdrop to dismiss — and that dismissing
      click doesn't paint. Close on tool selection, or make the modal
      non-blocking.
- [ ] **Escape follows a fixed list, not the visual stack.** The chain in
      `App.tsx:69` always drains modals before the armed world tool. Arm Food
      from World Controls, press Esc, and the modal closes while the tool stays
      armed — the opposite of the "back out one layer" comment above it.
- [ ] **Picking a colour changes your tool.** `handleColorChange`
      (`EditorDock.tsx:137`) sets `mode = Modes.Paint` as a side effect, so
      touching the swatch while drawing silently swaps the active tool.

## Group 6 — Destructive actions and a consistent confirm policy

One decision — what deserves a confirm — applied everywhere.

- [ ] **The confirm policy is backwards.** `Restart`, `Resize`, `Clear Life` and
      `Seed World` all prompt, but the lab's `Clear` and `Random`
      (`EditorDock.tsx:376-381`) wipe the organism outright, and
      `handleOpenInLab` (`App.tsx:161`) overwrites unsaved lab work the moment
      you click a preset or lifeform card. The unconfirmed ones are the ones
      that lose work you can't regenerate.
- [ ] **"Seed World" undersells what it does.** The prompt says "Clear the world
      and seed it with this organism?" (`EditorDock.tsx:166`); `env.reset(false)`
      also clears food and radiation, and walls too when
      `clear_walls_on_reset` is set.

## Group 7 — Settings that silently don't apply

All three are the same failure: a control whose effect depends on state living
in a different window, with no cross-reference.

- [ ] **The lab's "Mutation rate" can be inert.** `EditorDock.tsx:417` edits
      `organism.mutability`, which the engine ignores whenever
      "Use evolved mutation rate" is off in Evolution Controls
      (`EvolutionControlsModal.tsx:56`). The field stays fully editable and
      gives no hint that a global override is winning.
- [ ] **Healer cost exists twice.** Per-organism `healer_food_cost`
      (`EditorDock.tsx:423`) and global `healerFoodCost`
      (`EvolutionControlsModal.tsx:66`) share a label across two windows with no
      stated precedence.
- [ ] **Brush size is filed under the wrong tool.** The slider lives only in
      World Controls (`WorldControlsModal.tsx:128`), but `brush_size` also sets
      the pick radius for Select (`findNearOrganism`) and Kill
      (`killNearOrganisms`). At small values Select needs a near-pixel-perfect
      click and nothing explains why.

## Group 8 — Hotkeys

- [ ] **Hotkeys are only discoverable in ABOUT.** The `HOTKEYS` table
      (`AboutTab.tsx:6`) is the sole listing; no toolbar tooltip mentions a key
      even though `X` and `Z` map directly to toolbar buttons
      (`HudBottomBar.tsx:18-26`). World Controls does this right — its tooltips
      carry "Hotkey: F" etc.
- [ ] **The letters fight their mnemonics.** `D` drops walls but reads as
      "drag"; `S` is drag but reads as "save"; `A` resets the view. See
      `App.tsx:130-134`.
- [ ] **`Z` is overloaded around the lab.** Bare `Z` toggles Select globally
      (`App.tsx:142`) while `Ctrl+Z` is the lab's undo
      (`EditorDock.tsx:186`). With the dock open and a slider or button focused,
      a missed modifier arms a world tool instead of undoing.
</content>
