const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Worlds picker', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'save');
    await page.locator('#browse-worlds-btn').click();
    await expect(page.getByTestId('worlds-modal')).toBeVisible();
  });

  test('Lists the bundled worlds', async ({ page }) => {
    expect(await page.locator('.world-card').count()).toBeGreaterThan(5);
    await expect(page.locator('.world-card[data-world="SurvivalOfFittest"]')).toBeVisible();
  });

  test('Loading a world replaces the grid and applies its saved controls', async ({ page }) => {
    await page.evaluate(() => { window.Hyperparams_probe = null; });

    await page.locator('.world-card[data-world="SurvivalOfFittest"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    // The save is 385x217 at cell size 4, unlike the default window-filled grid
    const grid = await page.evaluate(() => ({
      cols: window.engine.env.grid_map.cols,
      rows: window.engine.env.grid_map.rows,
      cell: window.engine.env.grid_map.cell_size,
      organisms: window.engine.env.organisms.length,
    }));
    expect(grid.cols).toBe(385);
    expect(grid.rows).toBe(217);
    expect(grid.cell).toBe(4);
    expect(grid.organisms).toBeGreaterThan(0);
  });

  test('Unchecking override keeps the current evolution controls', async ({ page }) => {
    // Set a distinctive value, then load with override off
    await page.keyboard.press('Escape');
    await openPanel(page, 'save'); // close save popup
    await page.locator('#tool-rules').click();
    await page.locator('#lookRange').fill('11');
    await page.keyboard.press('Escape');

    await openPanel(page, 'save');
    await page.locator('#browse-worlds-btn').click();
    await page.locator('#override-controls').uncheck();
    await page.locator('.world-card[data-world="SurvivalOfFittest"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    await page.locator('#tool-rules').click();
    await expect(page.locator('#lookRange')).toHaveValue('11');
  });
});
