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

      // The eraser tool resets the slot; the loop re-arms the next cell type
      await page.locator('#eraser-tool').click();
      await clickEditorCell(page, 1, 0);
      await expectCellCount(page, 1);
    }
  });

  // The buttons are swatch-only so the whole palette fits without scrolling;
  // the name is carried by the accessible name and by the hover popover below,
  // not by visible text.
  test('Palette buttons are named and carry a tooltip', async ({ page }) => {
    await openEditor(page);
    for (const type of ['mouth', 'parasite', 'chameleon']) {
      const btn = page.locator(`.cell-type#${type}`);
      await expect(btn).toHaveAttribute('aria-label', type);
      await expect(btn).toHaveAttribute('title', /.+/);
      await expect(btn.locator('canvas')).toBeVisible();
    }
  });

  test('The whole palette fits the rail without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor(page);
    const overflow = await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid=editor-dock]').firstElementChild.lastElementChild;
      return scroll.scrollHeight - scroll.clientHeight;
    });
    expect(overflow).toBe(0);
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
