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

  test('Hovering a cell type shows a live behaviour preview', async ({ page }) => {
    await openEditor(page);
    const preview = page.getByTestId('cell-preview');

    // No preview until a palette cell is hovered
    await expect(preview).toHaveCount(0);

    // Hovering the killer shows its preview: a live-simulation canvas plus the
    // cell's name and description from CELL_INFO.
    await page.locator('.cell-type#killer').hover();
    await expect(preview).toBeVisible();
    await expect(preview.locator('canvas')).toBeVisible();
    await expect(preview).toContainText('killer');
    await expect(preview).toContainText(/harms/i);

    // The PreviewEnvironment actually runs: the canvas paints organism cells
    // over the empty backdrop, so many pixels differ from the top-left corner
    // (which sits in empty space).
    const painted = await preview.locator('canvas').evaluate(cv => {
      const ctx = cv.getContext('2d');
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      const br = data[0], bg = data[1], bb = data[2];
      let differing = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== br || data[i + 1] !== bg || data[i + 2] !== bb) differing++;
      }
      return differing;
    });
    expect(painted).toBeGreaterThan(200);

    // Moving to another cell swaps in that cell's preview
    await page.locator('.cell-type#poison').hover();
    await expect(preview).toContainText('poison');
    await expect(preview).toContainText(/poisons/i);

    // Leaving the palette dismisses the preview
    await page.getByTestId('editor-dock').getByText('ORGANISM LAB').hover();
    await expect(preview).toHaveCount(0);
  });
});
