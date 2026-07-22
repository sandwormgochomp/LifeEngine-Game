const { test, expect, openWorldControls, closeModal, pauseEngine } = require('./helpers/fixtures');

test.describe('World controls', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openWorldControls(page);
  });

  test('Clear walls empties the world of walls', async ({ page }) => {
    // The petri dish seeds the world with invincible walls
    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(before).toBeGreaterThan(0);

    // Clear Walls moved to the always-on palette; dismiss the modal covering it
    await closeModal(page, 'world-modal');
    await page.locator('#clear-walls').click();

    const after = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(after).toBe(0);
  });

  test('Pause on extinction halts the sim when everything dies', async ({ page }) => {
    await page.locator('#auto-pause').check();

    // Kill everything and let the sim tick so removeOrganisms sees extinction
    await page.evaluate(() => {
      window.engine.start();
      window.engine.env.organisms.forEach(o => o.die());
    });

    await expect.poll(() => page.evaluate(() => window.engine.running)).toBe(false);
  });

  test('Reset on extinction restarts and counts', async ({ page }) => {
    await page.locator('#auto-pause').uncheck();
    await page.locator('#auto-reset').check();
    await expect(page.locator('#reset-count')).toContainText('Auto reset count: 0');

    await page.evaluate(() => {
      window.engine.start();
      window.engine.env.organisms.forEach(o => o.die());
    });

    await expect.poll(() => page.evaluate(() => window.engine.env.reset_count)).toBeGreaterThan(0);
    await expect(page.locator('#reset-count')).not.toContainText('Auto reset count: 0');
  });

  test('Brush size slider drives the engine brush', async ({ page }) => {
    // Brush + paint tools moved to the always-on palette; the modal only covers
    // the canvas here, so dismiss it before painting
    await closeModal(page, 'world-modal');
    await page.locator('#brush-slider').fill('0');
    await page.locator('#food').click();

    // Sim is paused, so a brush of 0 changes exactly the clicked cell (5px cells)
    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    await page.locator('#env-canvas').click({ position: { x: 500, y: 400 } });

    const after = await page.evaluate(() => ({
      total: window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length,
      clicked: window.engine.env.grid_map.cellAt(100, 80).state.name,
    }));
    expect(after.clicked).toBe('food');
    expect(after.total - before).toBe(1);
  });

  test('Seed Life paints random organisms into the world', async ({ page }) => {
    // Seed Life is a brush tool in the palette now; a wide brush scatters a few
    // random organisms per click. Dismiss the modal so the canvas is clickable.
    await closeModal(page, 'world-modal');
    await page.locator('#brush-slider').fill('15');
    await page.locator('#seed-life').click();

    const before = await page.evaluate(() => window.engine.env.organisms.length);

    // A few clicks over open space reliably spawns life (each cell spawns
    // sparsely, so one click alone can draw a blank)
    const canvas = page.locator('#env-canvas');
    for (let i = 0; i < 4; i++)
      await canvas.click({ position: { x: 300, y: 200 } });

    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBeGreaterThan(before);
  });

  test('Resizing the grid rebuilds the world and keeps the dish', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#cell-size').fill('10');
    await page.locator('#resize').click();

    const state = await page.evaluate(() => ({
      cellSize: window.engine.env.grid_map.cell_size,
      corner: window.engine.env.grid_map.cellAt(0, 0).state.name,
    }));
    expect(state.cellSize).toBe(10);
    expect(state.corner).toBe('invincible_wall');
  });
});
