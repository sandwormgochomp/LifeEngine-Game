const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Editor Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'edit');
  });

  test('Selecting a cell type highlights it', async ({ page }) => {
    await page.locator('#edit.edit-mode-btn').click();

    const commonCellBtn = page.locator('.cell-type#common');
    await commonCellBtn.click();
    await expect(commonCellBtn).toHaveCSS('border-color', 'rgb(255, 255, 0)');

    // Clicking again deselects
    await commonCellBtn.click();
    await expect(commonCellBtn).not.toHaveCSS('border-color', 'rgb(255, 255, 0)');
  });

  test('Placing a cell on the editor canvas updates organism size', async ({ page }) => {
    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#common').click();

    // Editor canvas is 310x310 with the organism centered at (155, 155);
    // click one cell (10px) to the right of the center cell
    await page.locator('#editor-canvas').click({ position: { x: 165, y: 155 } });

    await expect(cellCount).toHaveText(/Cell count: 2/);
  });

  test('Clearing the organism allows placing a new cell', async ({ page }) => {
    const cellCount = page.locator('#edit-organism-details .cell-count');

    await page.locator('#clear-editor').click();
    await expect(cellCount).toHaveText(/Cell count: 1/);

    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#producer').click();
    await page.locator('#editor-canvas').click({ position: { x: 165, y: 155 } });
    await expect(cellCount).toHaveText(/Cell count: 2/);
  });

  test('Removing the center cell shows a HUD notification instead of an alert', async ({ page }) => {
    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    await page.locator('#edit.edit-mode-btn').click();

    // Right-click the center cell (155, 155): removal is refused with a toast
    await page.locator('#editor-canvas').click({ button: 'right', position: { x: 155, y: 155 } });

    await expect(page.getByTestId('hud-notifications')).toContainText('Cannot remove center cell');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    // Toast auto-dismisses
    await expect(page.getByTestId('hud-notifications')).toBeHidden({ timeout: 5000 });
  });

  test('Editor keeps working after closing and reopening the panel', async ({ page }) => {
    const cellCount = page.locator('#edit-organism-details .cell-count');

    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#common').click();
    await page.locator('#editor-canvas').click({ position: { x: 165, y: 155 } });
    await expect(cellCount).toHaveText(/Cell count: 2/);

    // Close and reopen: the panel unmounts, and a fresh canvas is bound
    await openPanel(page, 'edit');
    await expect(page.locator('#editor-canvas')).toBeHidden();
    await openPanel(page, 'edit');
    await expect(cellCount).toHaveText(/Cell count: 2/);

    // Edit mode and cell type selection live on the engine controller and
    // survive the remount, so editing works immediately on the rebound canvas
    await expect(page.locator('.cell-type#common')).toHaveCSS('border-color', 'rgb(255, 255, 0)');
    await page.locator('#editor-canvas').click({ position: { x: 145, y: 155 } });
    await expect(cellCount).toHaveText(/Cell count: 3/);
  });

  test('Placing 5 common cells in a row works correctly', async ({ page }) => {
    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#common').click();

    const editorCanvas = page.locator('#editor-canvas');
    for (let i = 1; i <= 5; i++) {
      await editorCanvas.click({ position: { x: 155 + (i * 10), y: 155 } });
    }

    await expect(cellCount).toHaveText(/Cell count: 6/);

    // Every placed cell should exist in the organism's anatomy at the expected location
    const placedCells = await page.evaluate(() => {
      const anatomy = window.engine.organism_editor.organism.anatomy;
      const results = [];
      for (let i = 0; i <= 5; i++) {
        const cell = anatomy.getLocalCell(i, 0);
        results.push({ col: i, present: cell != null, state: cell?.state?.name });
      }
      return results;
    });

    for (const cell of placedCells) {
      expect(cell.present, `cell at loc_col ${cell.col} missing`).toBe(true);
    }
    expect(placedCells[0].state).toBe('mouth');
    for (const cell of placedCells.slice(1)) {
      expect(cell.state).toBe('common');
    }
  });
});
