const { test, expect, pauseEngine } = require('./helpers/fixtures');

// The bottom-left tool palette is grouped into Terrain / Life / Events tabs.
// Only the active tab's tools render, so switching tabs swaps the tool set.
test.describe('Tool palette tabs', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Tabs swap the visible tool group', async ({ page }) => {
    // Boots on Terrain: its tools are up, the other tabs' are not rendered
    await expect(page.locator('#wall')).toBeVisible();
    await expect(page.locator('#tool-select')).toBeHidden();
    await expect(page.locator('#event-meteor')).toBeHidden();

    await page.locator('#tool-tab-life').click();
    await expect(page.locator('#tool-select')).toBeVisible();
    await expect(page.locator('#wall')).toBeHidden();

    await page.locator('#tool-tab-events').click();
    await expect(page.locator('#event-meteor')).toBeVisible();
    await expect(page.locator('#event-bloom')).toBeVisible();
    await expect(page.locator('#tool-select')).toBeHidden();
  });

  test('Scaffolded events are present but disabled', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await expect(page.locator('#event-bloom')).toBeEnabled();
    for (const id of ['#event-iceage', '#event-radstorm', '#event-predator']) {
      await expect(page.locator(id)).toBeDisabled();
    }
  });

  test('An armed tool marks its tab while you browse another', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await page.locator('#event-meteor').click();
    await expect(page.locator('#event-meteor')).toHaveClass(/toolPaletteBtnActive/);

    // Look away to the Terrain tab: the Events tab keeps a marker so the armed
    // tool stays discoverable
    await page.locator('#tool-tab-terrain').click();
    await expect(page.locator('#event-meteor')).toBeHidden();
    await expect(page.locator('#tool-tab-events')).toHaveClass(/toolPaletteTabArmed/);
    await expect(page.locator('#tool-tab-terrain')).not.toHaveClass(/toolPaletteTabArmed/);
  });
});

test.describe('World events', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Meteor falls, then kills organisms in the blast and scatters food', async ({ page }) => {
    const target = await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      const cs = env.grid_map.cell_size;
      return { x: org.c * cs + cs / 2, y: org.r * cs + cs / 2 };
    });
    const foodBefore = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-meteor').click();
    await expect(page.locator('#event-meteor')).toHaveClass(/toolPaletteBtnActive/);
    await page.locator('#env-canvas').click({ position: target });

    // The click launches an animated strike rather than resolving instantly
    expect(await page.evaluate(() => window.engine.env.active_meteors.length)).toBe(1);

    // The blast lands when the fireball does (~0.5s, render-loop driven, so
    // the paused sim doesn't hold it up): the organism under the impact dies
    await expect.poll(() => page.evaluate(() => window.engine.env.organisms[0].living)).toBe(false);
    // ...and its body (plus scatter) left food behind
    const food = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    expect(food).toBeGreaterThan(foodBefore);
  });

  test('Bloom spikes food production, then restores it when the window ends', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();

    const spiked = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      blooms: window.engine.env.active_events.filter(e => e.kind === 'bloom').length,
    }));
    expect(spiked.prob).toBe(base * 3);
    expect(spiked.blooms).toBe(1);

    // Wind the clock to the event's end and tick the scheduler: it restores.
    const restored = await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events.find(e => e.kind === 'bloom').ends_at;
      env.tickWorldEvents();
      return { prob: window.hyperparams.foodProdProb, events: env.active_events.length };
    });
    expect(restored.prob).toBe(base);
    expect(restored.events).toBe(0);
  });

  test('Re-triggering a bloom extends it without stacking the multiplier', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    await page.locator('#event-bloom').click();

    const state = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      blooms: window.engine.env.active_events.filter(e => e.kind === 'bloom').length,
    }));
    // Still one bloom, still a single 3x spike — not 9x
    expect(state.prob).toBe(base * 3);
    expect(state.blooms).toBe(1);
  });

  test('Resetting the world winds back an active bloom', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    expect(await page.evaluate(() => window.hyperparams.foodProdProb)).toBe(base * 3);

    const after = await page.evaluate(() => {
      window.engine.env.reset(true);
      return { prob: window.hyperparams.foodProdProb, events: window.engine.env.active_events.length };
    });
    expect(after.prob).toBe(base);
    expect(after.events).toBe(0);
  });
});
