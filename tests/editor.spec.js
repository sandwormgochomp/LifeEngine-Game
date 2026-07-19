const { test, expect } = require('@playwright/test');

test.describe('Editor Functionality', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    const maximizeBtn = page.locator('#maximize');
    if (await maximizeBtn.isVisible()) await maximizeBtn.click();
    
    // Switch to editor tab
    await page.locator('#editor.tabnav-item').click();
  });

  test('Selecting a cell type highlights it', async ({ page }) => {
    // First we must enter Edit mode to see the cell selections
    await page.locator('#edit.edit-mode-btn').click();

    const commonCellBtn = page.locator('.cell-type#common');
    await commonCellBtn.click();
    
    // Check that the border color is yellow
    await expect(commonCellBtn).toHaveCSS('border-color', 'rgb(255, 255, 0)');
    
    // Clicking again should deselect
    await commonCellBtn.click();
    await expect(commonCellBtn).not.toHaveCSS('border-color', 'rgb(255, 255, 0)');
  });

  test('Placing a cell on the editor canvas updates organism size', async ({ page }) => {
    // Initial cell count should be 1
    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    // Select Common Cell
    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#common').click();

    const editorCanvas = page.locator('#editor-canvas');
    await editorCanvas.click({ position: { x: 165, y: 155 } });
    
    // Wait for the UI to update
    await expect(cellCount).toHaveText(/Cell count: 2/);
  });



  test('Clearing the organism allows placing a new cell', async ({ page }) => {
    // Confirm dialog (playwright auto-accepts by default, or we might need to handle it)
    page.once('dialog', dialog => dialog.accept());

    const clearBtn = page.locator('#clear-editor');
    await clearBtn.click();

    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#producer').click();
    const editorCanvas = page.locator('#editor-canvas');
    await editorCanvas.click({ position: { x: 165, y: 155 } });
    await expect(cellCount).toHaveText(/Cell count: 2/);
  });

  test('Selecting a color preset updates the color picker', async ({ page }) => {
    const blackPreset = page.locator('.color-preset[data-color="#000000"]');
    if (await blackPreset.count() > 0) {
      await blackPreset.click();
      const colorPicker = page.locator('#cell-color-picker');
      await expect(colorPicker).toHaveValue('#000000');
    }
  });
  test('Placing 5 common cells on the canvas works correctly', async ({ page }) => {
    // Initial cell count should be 1
    const cellCount = page.locator('#edit-organism-details .cell-count');
    await expect(cellCount).toHaveText(/Cell count: 1/);

    // Select Edit Mode and Common Cell
    await page.locator('#edit.edit-mode-btn').click();
    await page.locator('.cell-type#common').click();

    const editorCanvas = page.locator('#editor-canvas');
    for (let i = 1; i <= 5; i++) {
      await editorCanvas.click({ position: { x: 155 + (i * 10), y: 155 } });
    }
    
    // Wait for the UI to update to show 6 cells (1 original + 5 new)
    await expect(cellCount).toHaveText(/Cell count: 6/);

    // Validate that the cells exist and are visible for the user in the locations they were placed
    // We move the mouse away to remove any hover highlights before checking
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    const visibilityChecks = await page.evaluate(() => {
      const editor = window.engine.organism_editor;
      const canvas = editor.renderer.canvas;
      const ctx = editor.renderer.ctx;
      
      const results = [];
      for (let i = 0; i <= 5; i++) {
        const cell = editor.organism.anatomy.cells.find(c => c.loc_col === i && c.loc_row === 0);
        if (!cell) {
          results.push({ col: i, visible: false, reason: 'not in anatomy' });
          continue;
        }
        
        const gridCell = editor.organism.getRealCell(cell);
        
        const pixelX = gridCell.x + Math.floor(editor.renderer.cell_size / 2);
        const pixelY = gridCell.y + Math.floor(editor.renderer.cell_size / 2);
        
        const pixelData = ctx.getImageData(pixelX, pixelY, 1, 1).data;
        
        // Background (empty) is black [0,0,0,255]. Common cell should be gray (not black).
        const isBlack = (pixelData[0] === 0 && pixelData[1] === 0 && pixelData[2] === 0);
        results.push({ col: i, visible: !isBlack, color: `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})` });
      }
      return results;
    });

    for (const check of visibilityChecks) {
      expect(check.visible).toBe(true);
    }
  });
});
