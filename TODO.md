# Repo Tidy-Up TODO

Working branch: `update-interface`. One commit per group.

## Group A — Dead code & repo hygiene

- [x] Move source assets (`worlds/`, `organisms/`, `mods/` JSON) from `dist/assets/` to `public/assets/` so they survive a rebuild
      — Turned out `public/assets/` already held identical copies; the `dist/assets/` JSONs were duplicates and are simply untracked with the rest of `dist/`.
- [x] Fix `.gitignore` (ignore `dist/`, `test-results/`, `playwright-report/`; remove the invalid `./package-lock.json` pattern) and untrack committed build/test artifacts
      — Note: untracking `dist/` is safe for GitHub Pages. `gh-pages -d dist` publishes the local `dist/` folder to the separate `gh-pages` branch; Pages never reads `dist/` from the source branch. It just has to be built before deploying (see `predeploy` below).
- [x] Add `"predeploy": "npm run build"` to `package.json` so `npm run deploy` always publishes a fresh build
- [x] Delete stale test artifacts: `test_output.txt` (UTF-16 log from another machine), `test-failure.png`
- [x] Delete dead jQuery layer: `src/index.js`, `src/Controllers/LoadController.js` (and its wiring in `ControlPanel`/`EditorController`), `webpack.config.js`
- [x] Delete ad-hoc scripts superseded by Playwright: `check_errors.js`, `check_click.js`, `test_factory.js`, `serve.js`
- [x] `package.json`: remove unused deps (`puppeteer`, `npm`, `glob-parent`)

## Group B — Engine/state bug fixes

- [x] Fix Select-mode crash: `EnvironmentController` calls `control_panel.setEditorOrganism()`, which no longer exists — restore it on `ControlPanel` (delegate to `organism_editor.setOrganismToCopyOf`)
- [x] Fix dead stats path: `ControlPanel.update()` gates on `tab_id`/`control_panel_active` that nothing sets, and calls a nonexistent `StatsPanel.update(dt)` — drive chart updates from the React stats panel's visibility instead (`startAutoRender`/`stopAutoRender`)
- [x] Fix engine lifecycle in `App.tsx`: cleanup closes over stale `null` state, so intervals leak on unmount; cancel the pending `setTimeout` too (added `Engine.dispose()` for full teardown)
- [x] Guard null `cur_cell` in `CanvasController.updateMouseLocation` (mousemove throws when pointer is outside the grid on a zoomed/dragged canvas)
- [x] Fix dangling-else in `WorldEnvironment.removeOrganisms` (`auto_reset` branch is attached to the wrong `if`)
- [x] Single owner for pause state: route HUD play/pause through `ControlPanel.setPaused` so `paused` doesn't go stale
- [x] Move `confirm()` out of `WorldEnvironment.reset` into the UI layer (`reset(reset_life)` no longer prompts); replace `alert()` "abstract method" stubs with `throw new Error(...)`
- [x] Remove `ColorScheme`'s direct DOM writes to `.cell-type` buttons (React already colors them) and the dead `#override-controls` read in `WorldEnvironment.loadRaw`
      — Note: loading a world therefore never applies the world's saved hyperparams; if that feature returns, it needs an opt-in in the React UI. Also fixed while in there: `EnvironmentController` zoom/drag now use `this.canvas` instead of `getElementById`, and the wheel-zoom no longer tracks scale in a stale closure (zoom after Reset View used to jump back)

## Group C — React state subscription (remove polling)

- [x] Add change notification to `Engine` (subscribe/unsubscribe, emitted from `necessaryUpdate`, throttled to 100ms; immediate on start/stop)
- [x] Add `useEngineValue` hook (`useSyncExternalStore`) and replace the `forceRender` + `setInterval` polling in `HudTopCenter`, `HudTopRight`, `EditorTab`, `HudTopLeft`
      — Also fixed: Reset View buttons called `engine.env.resetView()`, which doesn't exist (`resetView` is on the controller) — both were silent no-op crashes
- [x] `StatsTab`: derive live details via the hook; fill in the "Number of Species" / "Most Populous Species" placeholders from `FossilRecord`
- [x] `EvolutionControlsTab`: collapse the three mirrored `useState`s + `if` chain into one state object

## Group D — Playwright suite

- [x] Add `webServer` to `playwright.config.js` so `npm test` is self-contained (also: `list` reporter + html `open: 'never'` so runs don't hang serving the report)
- [x] Extract shared `beforeEach` boilerplate (error logging, goto, engine-ready wait) into a fixture; drop the dead `#maximize` guard
- [x] Rewrite specs against the React HUD (`#tool-edit`, `#tool-environment`, …) — current selectors (`.tabnav-item`, `.pause-button`, `#maximize`, `div#editor.tab`) target the deleted jQuery UI
- [x] Drop obsolete tests (minimize/maximize, color presets); replace `getImageData` pixel probing with anatomy-model assertions
- [x] Run the suite green — 21/21 passing

## Group E — Type the React/engine seam

- [x] Add a minimal `EngineAPI` type (`src/types/engine.ts`) and use it instead of `engine: any` in components; add CSS-module declarations so `tsc` passes
- [x] Replace `require()` with `import` in `.tsx` files; drop the `@ts-ignore` on the Engine import
      — `npm run build` (`tsc && vite build`) now passes for the first time on this branch; typing also surfaced that `EditorController` never initialized `mode` (fixed to `Modes.None`)

## Deferred (completed after the original groups)

- [x] Full ESM conversion of the engine (`module.exports` → `export`) and dropping `vite-plugin-commonjs`
      — The two lazy-`require()` cycle workarounds (`Species`→`FossilRecord`, `PoisonCell`→`Neighbors`) became static imports; both cycles only touch the other module inside methods, so ESM live bindings handle them.
- [x] Bundle CanvasJS / Font Awesome / fonts instead of CDN + globals (would decouple `ChartController`)
      — `@canvasjs/charts`, `@fortawesome/fontawesome-free@^6` (matches the icon names written against the 6.1.2 CDN), `@fontsource/press-start-2p`, `@fontsource/vt323`. `index.html` no longer touches any external host. New `tests/stats.spec.js` covers chart rendering.
- [x] In-HUD dialogs for remaining user-facing `alert()`s (e.g. "Cannot remove center cell")
      — `Utils/Notifier` pub/sub + `HudNotifications` toasts; `OrganismEditor` was the only remaining `alert()` caller.
- [x] Pass canvas refs into `Engine`/`Renderer` instead of element ids (removes the `display:none` always-mounted panel hacks in `App.tsx`)
      — `Renderer`/`CanvasController` now bind/rebind canvas elements; `EditorTab`/`StatsTab` attach their canvas/chart container while mounted, so all HUD panels mount and unmount uniformly. Also removed while in there: the dead `OrganismEditor.toggleFullscreen` (no callers, id-based DOM access) and the engine-construction `setTimeout` hack in `App.tsx` (refs are ready when effects run).
