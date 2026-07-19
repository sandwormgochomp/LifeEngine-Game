const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('New Cell Types Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'edit');
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

      await page.locator(`.cell-type#${cellType.id}`).click();

      // Click one cell to the right of the organism's center cell
      await page.locator('#editor-canvas').click({ position: { x: 165, y: 155 } });

      await expect(cellCount).toHaveText(/Cell count: 2/);

      const newCellState = await page.evaluate(() => {
        const cell = window.engine.organism_editor.organism.anatomy.getLocalCell(1, 0);
        return cell?.state?.name ?? null;
      });
      expect(newCellState).toBe(cellType.id);
    });
  }
});
