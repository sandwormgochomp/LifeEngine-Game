const { test, expect, pauseEngine } = require('./helpers/fixtures');

// The world paint tools and one-shot terrain actions live in the always-on
// bottom-left palette. These used to sit behind the World Controls modal, which
// has since been folded into the palette (tools) and New Game (world setup).
test.describe('World tools palette', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Clear Walls empties the world of walls', async ({ page }) => {
    // The petri dish seeds the world with invincible walls
    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(before).toBeGreaterThan(0);

    await page.locator('#clear-walls').click();

    const after = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(after).toBe(0);
  });

  test('Clear Life removes every organism but keeps the walls', async ({ page }) => {
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBeGreaterThan(0);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-life').click();

    const state = await page.evaluate(() => ({
      organisms: window.engine.env.organisms.length,
      walls: window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length,
    }));
    expect(state.organisms).toBe(0);
    expect(state.walls).toBeGreaterThan(0); // dish survives
  });

  test('Brush size slider drives the engine brush', async ({ page }) => {
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
    // A wide brush scatters a few random organisms per click.
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
});
