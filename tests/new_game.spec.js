const { test, expect, pauseEngine } = require('./helpers/fixtures');

// The bottom-toolbar "New Game" button opens a setup dialog; nothing changes until
// Start is pressed, and Start applies every option at once.
test.describe('New Game dialog', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#new-game').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor();
  });

  test('Start reseeds a single origin organism into a fresh dish', async ({ page }) => {
    // Kill the current world so the reseed is unambiguous
    await page.evaluate(() => window.engine.env.organisms.forEach(o => o.die()));

    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    const state = await page.evaluate(() => ({
      organisms: window.engine.env.organisms.length,
      corner: window.engine.env.grid_map.cellAt(0, 0).state.name,
    }));
    expect(state.organisms).toBe(1);
    expect(state.corner).toBe('invincible_wall'); // petri dish rebuilt
  });

  test('Start with life off leaves an empty world', async ({ page }) => {
    await page.locator('#newgame-life').uncheck();
    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    const organisms = await page.evaluate(() => window.engine.env.organisms.length);
    expect(organisms).toBe(0);
  });

  test('Petri dish off starts the world without walls', async ({ page }) => {
    await page.locator('#newgame-petri').uncheck();
    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    const walls = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(walls).toBe(0);
  });

  test('Cell size applies to the new grid', async ({ page }) => {
    await page.locator('#newgame-cell-size').fill('10');
    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    const cellSize = await page.evaluate(() => window.engine.env.grid_map.cell_size);
    expect(cellSize).toBe(10);
  });

  test('Escape closes the dialog without touching the world', async ({ page }) => {
    const before = await page.evaluate(() => window.engine.env.organisms.length);
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });
    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBe(before);
  });

  test('Pause on extinction halts the sim when everything dies', async ({ page }) => {
    await page.locator('#newgame-auto-pause').check();
    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    // Kill everything and let the sim tick so removeOrganisms sees extinction
    await page.evaluate(() => {
      window.engine.start();
      window.engine.env.organisms.forEach(o => o.die());
    });

    await expect.poll(() => page.evaluate(() => window.engine.running)).toBe(false);
  });

  test('Reset on extinction restarts and counts', async ({ page }) => {
    await page.locator('#newgame-auto-pause').uncheck();
    await page.locator('#newgame-auto-reset').check();
    await page.locator('#newgame-start').click();
    await page.locator('[data-testid="newgame-modal"]').waitFor({ state: 'hidden' });

    const before = await page.evaluate(() => window.engine.env.reset_count);
    await page.evaluate(() => {
      window.engine.start();
      window.engine.env.organisms.forEach(o => o.die());
    });

    await expect.poll(() => page.evaluate(() => window.engine.env.reset_count)).toBeGreaterThan(before);
  });
});
