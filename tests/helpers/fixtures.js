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

// Open a HUD popup panel from the bottom toolbar (print|rules|environment|stats).
// The editor is a dock, not a popup — use openEditor for it.
async function openPanel(page, panelName) {
  await page.locator(`#tool-${panelName}`).click();
}

// Toggle the editor dock from the toolbar
async function openEditor(page) {
  await page.locator('#tool-edit').click();
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

module.exports = { test, expect: base.expect, openPanel, openEditor, pauseEngine, editorCellPosition, clickEditorCell, localCellState };
