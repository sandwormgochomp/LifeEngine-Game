# Tools Window — Pixel-Art Overhaul

A visual specification for rebuilding the tools window in the style of
`concepts/tool_window_crt_console.jpg`, so that it matches the 32×32 icon set in
`concepts/crt_console_assets/`.

This is a **style spec, not an implementation plan**. Everything below is
measured or sampled from the reference image; nothing is invented to fill gaps.
Where the reference genuinely does not answer a question, that is called out as
an open question rather than guessed at.

---

## 0. The decision this forces first

The reference is **slate blue and cyan-white**, with saturated full-colour icons
sitting on it. The rest of the HUD is green phosphor. There is no way to adopt
this style for the tools window and leave that tension unresolved — the window
will read as a different generation of hardware from everything around it.

Three ways out, in order of how well they serve the icons:

| | Chrome | Icons | Consequence |
|---|---|---|---|
| **A. Adopt (recommended)** | slate blue | full colour | Tools window matches the icons exactly. Every other HUD surface now looks like an older machine until it follows. |
| **B. Split** | green phosphor | full colour | Nothing else changes, but the icons become the only chromatic thing on a monochrome panel — loud, and the slate bevels that give the reference its depth are unavailable. |
| **C. Re-hue** | green phosphor | green phosphor | Perfectly consistent, and throws away the reason for the exercise. The icons stop being distinguishable by colour. |

**A** is the recommendation: the icons were drawn in this palette and they are
the payload. But it is a HUD-wide commitment dressed as a single-window change,
and that should be an explicit decision rather than a side effect.

---

## 1. Style DNA

### 1.1 Palette

The reference is a 200×200 pixel-art canvas upscaled 5.12× and saved as a JPEG.
`scripts/slice-crt-frame.py` recovers that canvas (per-cell median, which
rejects the ringing), reads each frame's border strips off it as modal
row/column colours, and merges everything within 9 units into one palette. What
comes back is **18 values**. Run `--probe` to print them with their sources.

| Hex | Where |
|---|---|
| `#000000` | Every outline. The case's is 2px, everything else's is 1–2px |
| `#090c1a` | Screen ground |
| `#0f1827` | Idle tab, outer right edge |
| `#102032` | Idle tab, the 1px shadow row where it meets the panel |
| `#273a57` | Bezel shadow, well shadow, idle tab face, screen's top rail, **and both dithers' dark partner** |
| `#425a7a` | Case right face, plate right/bottom bevel, divider rule |
| `#4a6483` | Idle tab left bevel |
| `#536e92` | Bezel face — the dominant colour — and the well, and the active tab face |
| `#5e7a9c` | Active tab side bevel |
| `#6687a9` | Idle tab top and right bevel |
| `#7194b8` | Case bottom, inner highlight |
| `#7c9dbf` | Case left face, screen side rails, plate inner face, well light bevel |
| `#86abc7` | Active tab top, innermost |
| `#9ec0da` | Case top face, plate left bevel |
| `#b3d4e7` | Active tab top bevel |
| `#c8e5ef` | Screen bottom rail, plate top bevel |
| `#d1f2fa` | Case inner highlight, top/left/right |
| `#f0fefe` | Active tab specular, and label text |

The bezel, the well and the active tab's face are **one value**. The active tab
does not read as lifted because it is lighter than the bezel — it is the same as
the bezel. It reads as lifted because the idle tabs are two steps darker and
carry a shadow row along their bottom that the active one does not.

### 1.2 Light model

The reference uses **two**, and which one applies depends on whether the form is
a rim or a face.

**Plates and recesses take the obvious one.** Light edge top and left, dark edge
bottom and right; recesses invert it. The tool plate is `#9ec0da`/`#c8e5ef` on
its left and top, `#425a7a`/`#273a57` on its right and bottom. The icon well and
the screen are the same rule inverted.

**The case and the tabs do not.** They put a bright chamfer on the *inner* edge
of all four sides at once, and carry the light direction in the rim's face
instead:

```
case rim, 6px, outside → in:   black  black  face   face   face   highlight
  top                                 #9ec0da × 3          #d1f2fa
  left                                #7c9dbf × 3          #d1f2fa
  right                               #425a7a × 3          #d1f2fa
  bottom                              #273a57 × 3          #7194b8
```

So the light is still upper-left — it is just expressed as a value ramp around
the ring rather than as which edge gets the highlight. Reproducing this with
`box-shadow` insets is what the earlier mockup got wrong, and it is most of why
sliced assets are worth the files.

**Corners are not square.** The case chamfers all four at exactly 45° for 5px —
its outline steps 1px per row, measured identically at each corner. The plate
chamfers 2px, the screen and the tabs 1px.

### 1.3 The dither — there are two of them

Both are a 2×2 checkerboard against `#273a57`, and both are anchored to the
*bottom* of what they shade rather than to its middle.

**Icon wells.** Flat `#536e92` down to the last 6 of 22 interior rows, then 50%
checker. Roughly the bottom quarter, not the bottom third.

**The bezel itself.** The larger of the two, and the one the earlier spec missed
entirely: the whole panel body ramps into dither over its bottom 52 rows —
12.5% (one checkered row in four), then 25% (every other row), then 50% (every
row) from 40 rows up. It is why the reference's lower corners look weathered
and its upper ones look clean, and it is the detail that most makes the panel
read as drawn rather than generated.

### 1.4 Sliced assets

`concepts/crt_console_assets/frame/`, all regenerated by
`python3 scripts/slice-crt-frame.py`. Each frame is a minimal 9-slice atlas —
four corners, a 2px sample of each edge for `border-image` to tile, and a fill
square — so the whole set is 3 KB.

| File | Size | `border-image-slice` | Notes |
|---|---|---|---|
| `case.png` | 14×14 | `6` | 45° chamfer, corners transparent |
| `screen.png` | 10×9 | `3 4 4` | 1px of black along the top, 2px elsewhere |
| `plate.png` | 9×9 | `4 3 3 4` | Right/bottom stop 1px short; that pixel is the well's |
| `plate-pressed.png` | 9×9 | `3 4 4 3` | `plate.png` rotated 180° |
| `well.png` | 4×4 | `1` | |
| `well-pressed.png` | 4×4 | `1` | |
| `tab.png` | 9×7 | `4 4 1 3` | |
| `tab-active.png` | 8×7 | `4 3 1 3` | No bottom edge — the face runs into the panel |
| `well-dither.png` | 2×2 | — | Tile, bottom-anchored, 6 of 22 rows |
| `bezel-dither.png` | 2×52 | — | The ramp, bottom-anchored, `repeat-x` |
| `reference_200.png` | 200×200 | — | The recovered canvas, checkerboard removed |

A `-green` copy of each exists for §0's phosphor option: sliced art cannot be
recoloured by a CSS variable, so the toggle swaps the whole set. Those greens
are this project's phosphor ramp remapped by luminance — **nothing green was
sampled from the reference**, which is slate only.

Two things are still not sliced. The brush tube is glass with 3px rounded caps,
the one place the square-corner rule genuinely breaks, and the screws and LEDs
are 4px sprites rather than frames.

### 1.5 Geometry, in art pixels (`u`)

Measured off the recovered canvas. `u` is one art pixel; see §3 for what `u`
becomes.

```
window          172 × 174 u   (x 14..185, y 12..185)
  case rim        6u  — 2u black, 3u face, 1u inner highlight; 5u 45° chamfer
  tab row        16u tall (y 12..27); tabs 42–46u wide, sharing their outlines
  window buttons two ~14 × 13u squares, top right
  bezel band     14u from the case's top rail down to the screen
  screen        144 × 130u, set in 14u from the window's left and right edges
  title row      10u
  button          34 × 31u, on a 42 × 41u pitch (8u gutter, 10u row gap)
  well            27 × 24u inside it — the plate is only its 3u bevel
  label row       5u of glyph in the 10u row gap, centred under each button
  divider         1u rule, full width of the screen
  brush zone     25u
  bottom bezel    8u, then the 6u rim
```

The important ratio: **the icon fills roughly 20u of a 24u well** — about 80%,
leaving a 2–3u margin all round. That margin is what stops the icons from
looking crammed, and it is the number to preserve when rescaling.

---

## 2. Component specs

### 2.1 Window frame

6u, and none of it is a `border`. Outermost 2u pure black, then 3u of face, then
1u of highlight on the *inner* edge — see §1.2, this is the ring that does not
follow the obvious light rule. The face carries the light instead: `#9ec0da`
across the top, `#7c9dbf` down the left, `#425a7a` down the right, `#273a57`
along the bottom, whose highlight also drops to `#7194b8`. All four corners
chamfer 45° for 5u.

The black is doing the work of separating the panel from the world canvas
behind it; the ring is doing the work of making it a physical object. Ship it as
`case.png` (§1.4) rather than rebuilding it out of insets.

### 2.2 Tab row

Tabs sit **above** the bezel and overlap it, so the active tab's bottom edge is
open into the panel body — the tab and the panel are one continuous surface.
Inactive tabs keep their bottom edge closed.

- Inactive: `#2f4260` face, `#6486a9` top bevel, sunk.
- Active: `#536f94` face, `#83a9c4` top bevel, 2u taller, bottom edge removed.
- The reference has no hover state. Proposed: interpolate one step toward the
  active face (`#3d5576`), nothing else.

### 2.3 Panel title

The reference reads `BIOTIC TOOLS`, centred, white, in the screen area above the
grid. The real window has three tabs, so the equivalent is the active tab's name
— `TERRAIN`, `LIFE`, `EVENTS`. That is redundant with the tab row itself and is
the one element of the reference I would **drop**, reclaiming 10u of height.

### 2.4 Tool button

Three concentric parts, outside in:

1. **Plate** — `#7d9cbc` face, `#cbeaf4` top-left bevel, near-black
   bottom-right bevel. 1u each.
2. **Inset ring** — 2u, stepping down from plate to well.
3. **Well** — `#536e92`, dithered in its lower quarter (§1.3), holding the icon
   centred with a 3u margin.

**States.** The reference only shows one, so the rest are proposed by extending
its own logic rather than by importing a different idiom:

| State | Treatment |
|---|---|
| Rest | As above. |
| Hover | Plate face up one step to `#8fadc9`; bevels unchanged. |
| **Armed** | Invert the bevel — dark on top-left, light on bottom-right — so the plate reads as *pressed in*, and shift the icon 1u down and right. This is the physical-button logic the reference's whole light model implies, and it needs no new colour. |
| Disabled | Plate to `#506c91` (flush with the bezel), icon at 50% toward the bezel colour. |

Armed-by-press is worth stressing: it distinguishes "this brush is loaded" from
"this thing is hovered" using depth rather than brightness, which is the one
channel a full-colour icon set cannot fight with.

### 2.5 Labels

White `#f5feff`, all-caps, centred beneath each button, 8u row. No glow. The
reference truncates (`STRUCT.` for Structure), which is a real constraint at
this width — see §4.

### 2.6 Divider

A single 1u `#4a5d7e` rule across the screen. One value, no bevel, no dashes.

### 2.7 Brush control

The reference's most decorative element: a horizontal **glass tube of green
fluid** with a tick scale, a knurled metal ferrule, and a lit amber bulb as the
thumb. Sampled — glass rim `#a1f469`, fluid `#079f33`, bulb core `#fffdbe`, bulb
rim `#bf5911`.

Read literally this is a slider whose fill is the fluid and whose thumb is the
bulb, with the bulb's glow scaling with value. It is charming and it is the
riskiest thing in the reference: it introduces a fifth hue family (amber) for a
control that carries one number, and a glowing bulb next to a row of full-colour
icons competes with them for attention.

**Proposed:** keep the glass tube and the fluid fill, keep the tick scale, drop
the amber bulb for a slate ferrule thumb in the same four chrome values as
everything else. Revisit the bulb once the icons are in place and it can be
judged against them rather than against the mockup's invented tool set.

### 2.8 Screws and LEDs

The reference puts 4u screws in the bezel corners and a green/red LED pair at
the top right (repeated bottom right). Pure decoration — but it is the
decoration that sells "hardware", and it costs 4 sprites.

If the LEDs are to mean anything rather than be ornament, the obvious binding is
green = simulation running, red = paused. Worth doing or worth cutting; a fake
status light on a real simulator is the one detail here that would read as
sloppy rather than charming.

### 2.9 Action rows

**The reference does not contain this element at all.** It has six uniform
buttons and nothing else, whereas the real window carries one-shot actions
(Random Walls, Clear Walls, Clear Radiation, Clear Life, Bloom, Ice Age, Rad
Storm, Predator) as a text list.

Proposed, extending the reference's material logic: actions are **engraved into
the bezel rather than raised out of it** — no plate, no bevel, `#4f698d` text on
the bezel with the 32×32 icon at half scale to its left, going white on hover.
A raised plate would say "this is a mode you can arm", which is exactly what
these are not. The one action that *does* arm a mode (Predator) gets the full
raised plate, and that difference then carries real meaning.

---

## 3. Scale

The reference is 168u wide and fits 6 buttons plus a slider. The icons are
**32×32 real pixels**, and §1.5's ratio wants a 3u margin around a 32px icon.
So the module is re-derived from the icon rather than copied from the mockup:

```
icon             32 px
well             40 px   (icon + 4 margin)
button           48 px   (well + 2 inset ring + 1 bevel, each side, rounded)
3-column grid   156 px   (3 × 48 + 2 × 6 gutter)
screen          176 px   (grid + 10 side margin)
window         ~200 px   (screen + 10 bezel + 2 frame, each side)
```

Two consequences to accept up front:

- **The window gets wider.** Roughly 200px against the reference's 168u. Any
  attempt to keep the icons at 32px *and* the window at 168px means a 1u well
  margin, and the icons will look crammed.
- **Only integer scaling.** Every value here is whole pixels, `image-rendering:
  pixelated`, no half-pixel bevels. A 1.5× anything destroys the style faster
  than a wrong colour would.

If a narrower window matters more than icon size, the alternative is rendering
the icons at 16px — but that means going back to the 16×16 set, which is a
different decision than this document is proposing.

---

## 4. Where the real tool set does not fit the reference

The mockup shows a tidy 3×2 grid of six equal buttons. The actual window does
not have that shape, and the gap is worth naming before anyone tries to build
it:

1. **Uneven tabs.** Terrain has 5 tools, Life has 3, Events has 1. A 3-wide grid
   leaves Terrain with a 2-cell orphan row and Events with a single button in a
   3-wide field. The reference offers no pattern for this.
2. **Tools plus actions.** Terrain has 5 tools *and* 3 actions; Events has 1
   tool and 4 actions. The reference has no action concept at all (§2.9).
3. **Long labels.** `STRUCT.` in the mockup is Structure truncated to fit a 34u
   button. `Clear Radiation` and `Random Walls` will not fit a 48px cell at any
   readable pixel size — which is part of why actions want to be a left-aligned
   list rather than a grid.
4. **Three of the mockup's six icons are fictional.** WATER, GENE and PLANT
   correspond to no tool in the interface. The reference's grid is showing an
   invented tool set, so its *layout* cannot be copied — only its *materials*.

---

## 5. Open questions

- **§0's hue decision** — the only genuinely blocking one.
- Does the amber bulb survive (§2.7)?
- Do the LEDs get bound to real state or cut (§2.8)?
- Does the panel title go (§2.3)?
- What is the pattern for a tab with an orphan row (§4.1) — stretch the last
  button across the remainder, centre it, or drop to a 2-wide grid?

---

## 6. Correction to the existing proposal

`concepts/tool_window_concepts_proposal.md` describes this direction as
"Concept 1: Bio-Scanner Command Console" and this document is the detailed spec
for it. Its final section, **"📦 Extracted CRT Console Assets"**, is inaccurate:
it lists sliced assets (`button_food.png`, `icon_food.png` at 112×105,
`tab_terrain.png`, `slider_brush.png`) that do not exist and never did. The
slicing that *has* since been done is §1.4's, and it produced nothing with
those names or dimensions — it produced 9-slice border atlases of 4 to 14
pixels a side, because that is all a border needs.

What `concepts/crt_console_assets/` actually contains is **20 hand-retraced
32×32 icons** — 17 of them mapping to real tools, plus `water.png`, `gene.png`
and `plant.png` from the mockup's invented set — and `frame/`, the sliced
chrome. That section should be replaced with the real inventory.
