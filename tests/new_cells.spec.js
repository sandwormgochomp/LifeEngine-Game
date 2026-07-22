const { test, expect, openEditor, pauseEngine, clickEditorCell, expectCellCount, localCellState } = require('./helpers/fixtures');

// Every placeable cell type; one page load for the whole sweep.
const cellTypes = [
  'mouth', 'producer', 'mover', 'killer', 'armor', 'eye', 'healer',
  'explosive', 'poison', 'pheromone', 'common', 'parasite', 'chameleon', 'shooter',
];

test.describe('Cell type palette', () => {
  test('Each cell type can be drawn onto the organism', async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);

    for (const type of cellTypes) {
      await page.locator(`.cell-type#${type}`).click();
      await clickEditorCell(page, 1, 0);
      expect(await localCellState(page, 1, 0), `placing ${type}`).toBe(type);
      await expectCellCount(page, 2);

      // Right-click erase resets the slot for the next type
      await clickEditorCell(page, 1, 0, 'right');
      await expectCellCount(page, 1);
    }
  });

  test('Palette buttons show readable names and tooltips', async ({ page }) => {
    await openEditor(page);
    for (const type of ['mouth', 'parasite', 'chameleon']) {
      const btn = page.locator(`.cell-type#${type}`);
      await expect(btn).toContainText(type);
      await expect(btn).toHaveAttribute('title', /.+/);
    }
  });
});
