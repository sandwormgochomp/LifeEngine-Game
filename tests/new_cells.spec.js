const { test, expect } = require('@playwright/test');

test.describe('New Cell Types Functionality', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    const maximizeBtn = page.locator('#maximize');
    if (await maximizeBtn.isVisible()) await maximizeBtn.click();
    
    // Switch to editor tab
    await page.locator('#editor.tabnav-item').click();
    
    // Enter Edit mode
    await page.locator('#edit.edit-mode-btn').click();
  });

  const cellTypes = [
    { id: 'armor', name: 'Armor' },
    { id: 'chameleon', name: 'Chameleon' },
    { id: 'explosive', name: 'Explosive' },
    { id: 'healer', name: 'Healer' },
    { id: 'killer', name: 'Killer' },
    { id: 'poison', name: 'Poison' },
    { id: 'shooter', name: 'Shooter' },
    { id: 'parasite', name: 'Parasite' },
    { id: 'pheromone', name: 'Pheromone' }
  ];

  for (const cellType of cellTypes) {
    test(`Placing a ${cellType.name} cell on the editor canvas works`, async ({ page }) => {
      const cellCount = page.locator('#edit-organism-details .cell-count');
      await expect(cellCount).toHaveText(/Cell count: 1/);

      // Select the cell type
      await page.locator(`.cell-type#${cellType.id}`).click();

      // Click on the editor canvas adjacent to the center cell (10px right)
      // The canvas is 310x310 in editor mode, so center is 155, 155. We click 165, 155.
      const editorCanvas = page.locator('#editor-canvas');
      await editorCanvas.click({ position: { x: 165, y: 155 } });
      
      // Wait for the UI to update
      await expect(cellCount).toHaveText(/Cell count: 2/);
      
      // Verify the correct cell type is in the organism's anatomy
      const anatomyHasCell = await page.evaluate((typeId) => {
        const cells = window.engine.organism_editor.organism.anatomy.cells;
        // The first cell is usually the mouth, the second is the newly added one
        const newCell = cells[1];
        return newCell && newCell.state && newCell.state.name && newCell.state.name.toLowerCase() === typeId.toLowerCase();
      }, cellType.id);
      
      expect(anatomyHasCell).toBe(true);
    });
  }
});
