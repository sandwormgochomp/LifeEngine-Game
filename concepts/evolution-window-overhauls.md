# Evolution window — five proposed overhauls

*Written 2026-07-25 against `src/components/EvolutionControlsModal.tsx` on `master`.*

Side-by-side visual mockups of all five: **[evolution-window-options.html](evolution-window-options.html)**
(open it in a browser — same CRT-green pixel styling as the real HUD).

---

## What's wrong with it today

The EVOLUTION button (`HudBottomBar.tsx:21`) opens a 680px modal that is, mechanically, a
settings dialog. It works. It is not fun.

- **It's a wall of 21 controls.** Six groups — Life, Vision, Mutation, Cells, Reproduction
  & limits, World events — rendered as a uniform `label + slider + number` row
  (`EvolutionControlsModal.tsx:160-197`). Every control has identical visual weight, so
  nothing says "this one changes everything" versus "this one is a footnote."
- **The names are the code's names.** *Food production %*, *Extra mover cost*,
  *Add cell %*. These are `foodProdProb`, `extraMoverFoodCost`, `addProb` with a space in
  them. The player has to translate parameter → mechanic → outcome unaided.
- **The consequences are hidden in `title` attributes.** Every explanation is a hover
  tooltip (`.ctrlRow { cursor: help }`). Nothing is legible at a glance, and on touch
  there is no hover at all.
- **You can't see what you did.** `.modalBackdrop` dims and blurs the whole world behind
  it (`Hud.module.css:1282`), so the moment you change mutation rate you are looking at a
  grey rectangle instead of at mutation happening. `setParam` writes through to
  `Hyperparams` and calls `engine.emitChange(true)` *immediately* — the feedback is real
  and instant, and the UI covers it up.
- **Nothing is framed as a decision.** These are the levers that decide whether life
  explodes, stagnates or dies. Presented as a preferences pane, they read like display
  settings.

The through-line for all five overhauls: **stop presenting parameters, start presenting
consequences.**

---

## Overhaul 1 — The Console

*Effort: S · Risk: low · Keeps every existing control*

A pure re-presentation. Same 21 parameters, same writes, but the window stops being a form
and becomes a piece of machinery you operate.

- Three **big dials** at the top for the parameters that actually decide the run's
  character — `globalMutability`, `foodProdProb`, `lifespanMultiplier` — drawn as chunky
  pixel gauges with a needle, a lit arc, and a hand-lettered danger zone at the extremes.
- The other 18 stay as rows but get **weight**: the four that reshape a world (`instaKill`,
  `maxOrganisms`, `moversCanProduce`, `randomEvents`) sit in a bordered **HAZARD** block
  with a warning stripe; the rest collapse under a `▸ FINE TUNING` fold.
- Every row gains an always-visible **consequence sub-line** in dim green — the tooltip
  text, rewritten in outcome terms and shown, not hovered. *"Add cell % — how often a
  newborn grows a limb its parent didn't have."*
- Turning a dial **ticks**, the needle overshoots and settles, the arc flares.

```
┌ EVOLUTION CONTROLS ────────────────────────────────────── X ┐
│                                                              │
│      ╭─────╮          ╭─────╮          ╭─────╮               │
│      │  ╲  │          │   ╱ │          │  │  │               │
│      ╰──●──╯          ╰──●──╯          ╰──●──╯               │
│      MUTATION         ABUNDANCE        LIFESPAN              │
│        5.0              5.0             100                  │
│   copies drift     producers feed    ticks per cell          │
│                                                              │
│ ╔═ HAZARD ══════════════════════════════════════════════╗    │
│ ║ ▚ One touch kill        [X]  killers end a body at a  ║    │
│ ║ ▚                            single touch             ║    │
│ ║ ▚ Random world events   [ ]  cataclysms on a timer    ║    │
│ ╚═══════════════════════════════════════════════════════╝    │
│                                                              │
│ ▸ FINE TUNING (16)                                           │
│                                                              │
│ [RESET ALL]  [SAVE]  [LOAD]                                  │
└──────────────────────────────────────────────────────────────┘
```

**Why it's more fun:** a dial you turn feels like an act; a slider in a list feels like a
setting. And the danger zones tell you where the interesting values are — right now
nothing on screen suggests that mutation 50 is a different *kind* of world from mutation 5.

**Touches:** `EvolutionControlsModal.tsx` (add a `feature`/`hazard`/`fine` tier to the
`Field` type), a new `PixelDial.tsx` beside `PixelSlider.tsx`, `Hud.module.css`.

---

## Overhaul 2 — Live Petri (no backdrop)

*Effort: S–M · Risk: low · The highest fun-per-line change in the set*

Stop covering the world. The evolution controls become a **side dock**, not a modal: the
sim keeps running at full speed beside them and every change lands in front of your eyes.

- Kill `.modalBackdrop` for this window. Dock right, ~300px, world stays live and
  interactive; you can still click organisms and drag the camera while tuning.
- The header carries a **live vitals strip** — POP, SPECIES, largest body — so a slider
  move has a number that moves with it.
- Each change fires a floating **CHANGE TICKER** line over the world:
  `⟩ MUTATION 5 → 22 · expect chaos in ~200 ticks`. It's the Narrator's voice applied to
  your own actions, so your edits join the same story stream as meteors and blooms.
- A **REVERT** button undoes the last change (and a ⟲ history strip undoes further back) —
  cheap to add once every edit is already a discrete `setParam` call, and it makes big
  destructive changes safe to try, which is the actual unlock.

```
┌───────────────────────────────┬─ EVOLUTION ─────── X ┐
│                               │ POP 812  SPP 14  ▲   │
│      (the world, LIVE,        ├──────────────────────┤
│       still ticking, still    │ MUTATION      ▓▓▓░░  │
│       clickable)              │ ABUNDANCE     ▓▓▓▓░  │
│                               │ LIFESPAN      ▓▓░░░  │
│   ⟩ MUTATION 5 → 22           │ ...                  │
│     expect chaos ~200 ticks   ├──────────────────────┤
│                               │ ⟲ ⟲ ⟲    [REVERT]    │
└───────────────────────────────┴──────────────────────┘
```

**Why it's more fun:** it converts the window from *configuration* into *play*. Instead of
"set values, close, watch," it's "hold the mutation dial and watch the population wobble."
The feedback loop already exists in the engine — `setParam` → `Hyperparams` →
`emitChange(true)` — the modal is the only thing hiding it.

**Touches:** `App.tsx:384` (render as dock, drop the backdrop), `Hud.module.css`, a small
undo stack in `EvolutionControlsModal.tsx`, `Notifier`/Narrator for the ticker.

---

## Overhaul 3 — The Four Forces

*Effort: M · Risk: medium (needs curve tuning) · Biggest change to how it reads*

Collapse 21 parameters into **four macro forces**, each a single big slider that drives a
curve across several underlying `Hyperparams` fields. Raw controls stay, one fold down, for
anyone who wants them.

| Force | Drives | Reads as |
|---|---|---|
| **ABUNDANCE** | `foodProdProb`, `foodDropProb`, `extraMoverFoodCost` | famine ←→ feast |
| **VIOLENCE** | `instaKill`, `explosionRadius`, `wallDurability`, `healerFoodCost` | peaceful ←→ brutal |
| **MUTABILITY** | `globalMutability`, `addProb`, `changeProb`, `removeProb` | stable ←→ unstable |
| **MORTALITY** | `lifespanMultiplier`, `maxOrganisms` | eternal ←→ fleeting |

- Each force is a wide slider with **named zones** rather than a number: FAMINE · LEAN ·
  FED · FEAST. You choose a world, not a value.
- Above them, a **world portrait** — a one-line generated description of the world those
  four positions produce: *"A lean, brutal, fast-turning world. Expect small armoured
  movers and short dynasties."* It updates as you drag.
- `▸ RAW PARAMETERS (21)` opens the current list unchanged, and moving anything there
  marks its force **CUSTOM** rather than silently lying about the mapping.

```
┌ EVOLUTION CONTROLS ─────────────────────────────── X ┐
│ "A lean, brutal, fast-turning world.                 │
│  Expect small armoured movers and short dynasties."  │
│                                                      │
│ ABUNDANCE   famine ──●──────────────── feast   LEAN  │
│ VIOLENCE    calm  ─────────────●────── brutal  HARSH │
│ MUTABILITY  stable ──────●──────────── volatile  MID │
│ MORTALITY   eternal ────────────●───── fleeting FAST │
│                                                      │
│ ▸ RAW PARAMETERS (21)                                │
└──────────────────────────────────────────────────────┘
```

**Why it's more fun:** four decisions with names and consequences beat 21 decisions with
neither. It also gives the window a **skill ceiling** — you learn that lean + brutal breeds
armour, and go looking for that world deliberately.

**Risk:** the force→params curves are a design problem, not a coding one, and a bad curve
makes the sliders feel mushy. Mitigate by tuning each curve against the existing world
presets in `WorldsModal` before committing.

**Touches:** new `src/Evolution/Forces.ts` (curve definitions + world-portrait text),
`EvolutionControlsModal.tsx`, `Hyperparameters.ts` (batch apply).

---

## Overhaul 4 — The Fate Deck

*Effort: M · Risk: medium (a real design pivot) · The most game-like*

Reframe the window as **cards you play at the world** instead of settings you adjust. Each
card is a named, illustrated bundle of parameter changes with a stated cost and a stated
consequence — the thing the current modal has no vocabulary for.

- A hand of ~12 cards in the game's pixel art: *THE LONG WINTER* (lifespan ×3, food prod
  ÷2), *HAIR TRIGGER* (mutation ×5 for 2000 ticks), *THE PREDATOR'S GIFT* (instaKill on,
  explosion radius +2), *FERTILE CRESCENT*, *THE GREAT CULL* (maxOrganisms halved once).
- Playing one is a **moment**: card flies to the centre, flips, the world flashes, the
  Narrator announces it, and the change is timestamped into the run's history.
- **Timed cards** revert themselves — the whole idea of a temporary evolutionary pressure
  is currently unexpressible and is exactly what makes for a story ("we survived the Hair
  Trigger era").
- Ties directly into proposal **07 — World events**: cards and cataclysms become one
  system, one visual language, one narration channel.
- Raw sliders remain behind a `⚙ MANUAL` tab for players who want them.

```
┌ THE FATE DECK ──────────────────────────────────── X ┐
│  ╔══════════╗  ╔══════════╗  ╔══════════╗            │
│  ║ ❄        ║  ║ ⚡       ║  ║ ☠        ║            │
│  ║  [art]   ║  ║  [art]   ║  ║  [art]   ║            │
│  ║          ║  ║          ║  ║          ║            │
│  ║ THE LONG ║  ║   HAIR   ║  ║   THE    ║            │
│  ║  WINTER  ║  ║  TRIGGER ║  ║  GREAT   ║            │
│  ║          ║  ║          ║  ║   CULL   ║            │
│  ║ life ×3  ║  ║ mut ×5   ║  ║ pop ÷2   ║            │
│  ║ food ÷2  ║  ║ 2000 tk  ║  ║ once     ║            │
│  ╚══════════╝  ╚══════════╝  ╚══════════╝            │
│  survivors get   everything    room to                │
│  bigger          changes fast  breathe                │
│                                          [⚙ MANUAL]   │
└──────────────────────────────────────────────────────┘
```

**Why it's more fun:** it gives the player *authorship of events*, not authorship of
settings. "I played the Long Winter and the movers went extinct" is a story. "I set
lifespanMultiplier to 300" is not.

**Risk:** it can drift toward a god-game if cards get too surgical. Keep every card a
*pressure*, never a *result* — cards change what the world rewards, they never place or
remove specific organisms. That preserves the pure-selection premise the README stakes out.

**Touches:** new `src/Evolution/FateCards.ts` (+ card art), `EvolutionControlsModal.tsx`
replaced by `FateDeckModal.tsx`, Narrator hook, revert timers in `Engine`.

---

## Overhaul 5 — The Test Chamber

*Effort: L · Risk: medium-high (needs a headless fork) · Highest ceiling*

The one that answers the question the player actually has: **what will this do?**

- Two thumbnails at the top of the window: **NOW** and **IF**. `NOW` is a live minimap of
  the real world; `IF` is a forked copy running the pending parameters at high speed.
- Drag a slider and the fork **restarts and fast-forwards 2000 ticks in a second or two**,
  showing you a plausible future — with its verdict beneath: *POP 812 → ~1400 · SPECIES 14
  → ~6 · "fewer, larger lineages."*
- **[COMMIT]** applies the change to the real world. **[DISCARD]** throws the fork away.
  Nothing touches the live sim until you say so — the opposite of today's write-through.
- Forecasts are honest about noise: run the fork 3× at different seeds and show the spread
  (`~1400 ±300`), so it reads as a forecast rather than a promise.

```
┌ EVOLUTION CONTROLS ─────────────────────────────── X ┐
│  ┌── NOW ──────────┐   ┌── IF ───────────┐           │
│  │ · ·  ▪▪   ·     │   │  ▪▪▪▪   ▪▪▪     │  t+2000   │
│  │  ▪▪   · ▪  ·    │ → │  ▪▪▪▪▪  ▪▪▪▪    │  ▓▓▓▓░ ff │
│  │ ·   ▪▪    ·  ·  │   │   ▪▪▪▪▪▪▪▪      │           │
│  └─────────────────┘   └─────────────────┘           │
│  POP 812 → ~1400 ±300   SPECIES 14 → ~6 ±2           │
│  "fewer, larger lineages"                            │
│                                                      │
│  MUTATION    ▓▓▓░░  22  (pending)                    │
│  ABUNDANCE   ▓▓▓▓░  40                               │
│  ...                                                 │
│                              [DISCARD]  [COMMIT]     │
└──────────────────────────────────────────────────────┘
```

**Why it's more fun:** it turns tuning into **experimentation** — hypothesis, forecast,
commit. It also teaches the sim: after a dozen forecasts you have an intuition for what
abundance does, which is the single best thing this window could give a player.

**Risk / cost:** needs the engine to run a detached world off the main render loop. There's
groundwork already — `PreviewEnvironment.ts` exists, and `bench/bench.js` runs the sim
headless — but "fast-forward 2000 ticks without stuttering the live world" is a Web Worker
job, and that's the real cost of this one.

**Touches:** new worker + `src/Environments/ForecastEnvironment.ts`, `EvolutionControlsModal.tsx`,
`Hyperparameters.ts` (pending-vs-applied split).

---

## Recommendation

They compose, and the ordering below is roughly cheapest-first with no wasted work:

1. **2 — Live Petri** first. It is nearly free (delete a backdrop, add a dock and an undo
   stack) and it fixes the single worst thing about the window: you cannot see the effect
   of the thing you are changing. Every other proposal is better once the world is visible
   behind it.
2. **1 — The Console** next, as the visual layer for whatever the window ends up
   containing. Consequence sub-lines and a hazard tier are worth having under any of 3/4/5.
3. Then pick the identity:
   - **3 — Four Forces** if the window should stay a *tuning* surface but become legible.
   - **4 — Fate Deck** if it should become a *play* surface. Best synergy with the existing
     world-events work.
   - **5 — Test Chamber** if it should become a *laboratory*. Highest ceiling, highest cost;
     worth doing after 3 so the forecast has four meaningful axes to forecast over.

My pick for maximum excitement per unit of work: **2 + 1 now, then 4**, with 3's macro
forces sitting behind the deck's `⚙ MANUAL` tab as the advanced surface.
