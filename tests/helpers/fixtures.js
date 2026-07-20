const base = require('@playwright/test');

// Shared page setup: log browser errors, load the app, wait for the engine.
const test = base.test.extend({
  page: async ({ page }, use) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
    });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    await use(page);
  },
});

// Toggle a toolbar item by name (save|stats open popups; environment|rules open
// modals; edit opens the dock). Named openPanel for historical reasons.
async function openPanel(page, panelName) {
  await page.locator(`#tool-${panelName}`).click();
}

// Toggle the editor dock from the toolbar
async function openEditor(page) {
  await page.locator('#tool-edit').click();
}

// Open the world controls modal and wait for it
async function openWorldControls(page) {
  await page.locator('#tool-environment').click();
  await page.locator('[data-testid="world-modal"]').waitFor();
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
  await page.evaluate(() => window.engine.controlpanel.setPaused(true));
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

// Names of the anatomy cell at (dc, dr), or null if empty
async function localCellState(page, dc, dr) {
  return await page.evaluate(([dc, dr]) => {
    const cell = window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr);
    return cell?.state?.name ?? null;
  }, [dc, dr]);
}

module.exports = { test, expect: base.expect, openPanel, openEditor, openWorldControls, closeModal, loadPreset, pauseEngine, editorCellPosition, clickEditorCell, localCellState };
