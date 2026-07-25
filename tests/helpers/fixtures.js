const base = require('@playwright/test');

// Shared page setup: log browser errors, load the app, wait for the engine.
const test = base.test.extend({
  page: async ({ page }, use) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
    });
    // ?floaties=static pins the decorative dust layer (seeded + frozen) so
    // zero-tolerance visual snapshots don't flake on drifting motes.
    // ?firstrun=off keeps the blank origin world: test contexts are always
    // fresh, so without it every test would open on the first-run demo world.
    await page.goto('/?floaties=static&firstrun=off');
    await page.waitForSelector('div[data-engine-ready="true"]');
    await use(page);
  },
});

// Toggle a toolbar item by name (save|stats open popups; rules opens the
// evolution modal; edit opens the dock). Named openPanel for historical reasons.
async function openPanel(page, panelName) {
  await page.locator(`#tool-${panelName}`).click();
}

// Toggle the editor dock from the toolbar
async function openEditor(page) {
  await page.locator('#tool-edit').click();
}

// Open the New Game setup dialog from the bottom-toolbar button and wait for it
async function openNewGame(page) {
  await page.locator('#new-game').click();
  await page.locator('[data-testid="newgame-modal"]').waitFor();
}

// Open the evolution window on its Manual tab, where the one-row-per-parameter
// controls live. The window opens on the Console tab, which only carries the
// handful of parameters it promotes to dials.
async function openEvolutionManual(page) {
  await page.locator('#tool-rules').click();
  await page.locator('#evo-tab-manual').click();
}

// Dismiss the open modal. The modal backdrop covers the toolbar, so a modal
// is closed with Escape (or its X / a backdrop click), never by clicking a
// toolbar button through it.
async function closeModal(page, testId) {
  await page.keyboard.press('Escape');
  if (testId) await page.locator(`[data-testid="${testId}"]`).waitFor({ state: 'hidden' });
}

// Open the presets picker from the dock header and load one by its file key
async function loadPreset(page, presetValue) {
  await page.locator('#open-presets').click();
  await page.locator(`.preset-card[data-preset="${presetValue}"]`).click();
}

// Pause the simulation for deterministic assertions on world state
async function pauseEngine(page) {
  await page.evaluate(() => window.engine.stop());
}

// Canvas-relative position of the editor grid cell at the given offset from
// the organism's center cell (the canvas is sized exactly to the grid).
async function editorCellPosition(page, dc, dr) {
  return await page.evaluate(([dc, dr]) => {
    const editor = window.engine.organism_editor;
    const [cc, cr] = editor.grid_map.getCenter();
    const cs = editor.grid_map.cell_size;
    return { x: (cc + dc) * cs + cs / 2, y: (cr + dr) * cs + cs / 2 };
  }, [dc, dr]);
}

// Click the editor cell at (dc, dr) relative to the organism's center cell
async function clickEditorCell(page, dc, dr, button = 'left') {
  const position = await editorCellPosition(page, dc, dr);
  await page.locator('#editor-canvas').click({ position, button });
}

// Assert the editor organism's cell count, polled from engine state (the
// dock no longer displays a cell count label)
async function expectCellCount(page, count) {
  await base.expect.poll(() =>
    page.evaluate(() => window.engine.organism_editor.organism.anatomy.cells.length)
  ).toBe(count);
}

// Names of the anatomy cell at (dc, dr), or null if empty
async function localCellState(page, dc, dr) {
  return await page.evaluate(([dc, dr]) => {
    const cell = window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr);
    return cell?.state?.name ?? null;
  }, [dc, dr]);
}

module.exports = { test, expect: base.expect, openPanel, openEditor, openNewGame, openEvolutionManual, closeModal, loadPreset, pauseEngine, editorCellPosition, clickEditorCell, expectCellCount, localCellState };
