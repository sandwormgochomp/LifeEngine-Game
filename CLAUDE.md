# LifeEngine — working notes

## Component CSS

**One component, one module.** A `.tsx` imports at most one module from
`src/components/styles/` that is not in `kit/`, and it shares that file's
basename. Anything used by more than one component goes in
`src/components/styles/kit/` and is pulled in with `composes` — never by
importing another component's module.

The kit today: `Surface` (modal/panel chrome), `Picker` (choose-one card grids),
`Control` (labelled setting rows), `Bar` (top-corner readout strips), `Border`
(the four-offset pixel frame). `tokens.css` holds the palette; `global.css` holds
the page reset, the canvas stack, and the two places the app renders HTML it does
not own (native range inputs, uPlot's legend).

This layout replaced a single 2498-line `Hud.module.css` imported by 24
components, of which only ~10% of classes had more than one caller. It grew that
way because appending to the shared file was always the easiest move, so the
rule above is enforced rather than suggested:

```
python3 scripts/check-css.py
```

**The trap.** The bundler emits kit CSS *after* the component modules. So a
component class sitting on the same element as a composed kit class, redeclaring
one of its properties, has equal specificity and loses on source order —
silently. Splitting the old file caused seven such regressions (a modal narrowed
by 140px, another lost its amber border) and every test stayed green, because the
visual snapshots allow a 5% pixel diff.

Fix each site by doubling the component's selector (`.thing.thing`), which wins
regardless of emission order. `check-css.py` finds them. This applies to custom
properties too — `PredatorModal` repaints the shared border by overriding
`--edge`, and needs the same doubling. Import order does **not** fix this;
importing the kits first in `index.tsx` was tried and Rollup ignores it.

**Verifying a CSS change.** The snapshots are too loose to catch cascade bugs.
Diff computed styles for every element against another revision:

```
scripts/css-style-diff.sh [ref]     # defaults to HEAD
```

It expects one difference: `.gameHintBar` gained a fully transparent inset
shadow when it moved onto `kit/Border` (alpha 0, so nothing renders). Anything
else is a real change.

## Tests

`npm test` runs Playwright. `tests/style-dump.spec.js` skips unless `DUMP_OUT`
is set — it is the capture half of `css-style-diff.sh`, not an assertion.
