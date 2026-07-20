const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Simulation Controls', () => {
  test('Play/Pause buttons toggle simulation state', async ({ page }) => {
    // The simulation starts running
    expect(await page.evaluate(() => window.engine.running)).toBe(true);

    await page.getByTitle('Pause').click();
    expect(await page.evaluate(() => window.engine.running)).toBe(false);

    await page.getByTitle('Play').click();
    expect(await page.evaluate(() => window.engine.running)).toBe(true);
  });

  test('Speed controls step the engine fps', async ({ page }) => {
    await expect(page.locator('span[title="Click to cycle speed"]')).toHaveText('1x');

    await page.getByTitle('Increase Speed').click();
    await expect(page.locator('span[title="Click to cycle speed"]')).toHaveText('2x');
    expect(await page.evaluate(() => window.engine.fps)).toBe(120);

    await page.getByTitle('Decrease Speed').click();
    await page.getByTitle('Decrease Speed').click();
    await expect(page.locator('span[title="Click to cycle speed"]')).toHaveText('0.5x');
    expect(await page.evaluate(() => window.engine.fps)).toBe(30);
  });

  test('Clear environment button clears all organisms', async ({ page }) => {
    const orgCount = await page.evaluate(() => window.engine.env.organisms.length);
    expect(orgCount).toBeGreaterThan(0);

    await openPanel(page, 'environment');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset-env').click();

    const newOrgCount = await page.evaluate(() => window.engine.env.organisms.length);
    expect(newOrgCount).toBe(0);
  });

  test('World is a circular petri dish by default, and it can be toggled off', async ({ page }) => {
    const states = await page.evaluate(() => {
      const env = window.engine.env;
      const center = env.grid_map.getCenter();
      return {
        corner: env.grid_map.cellAt(0, 0).state.name,
        inside: env.grid_map.cellAt(center[0] + 5, center[1]).state.name,
      };
    });
    expect(states.corner).toBe('invincible_wall');
    expect(states.inside).not.toBe('invincible_wall');

    // The dish must survive a world reset (fillGrid preserves invincible walls)
    await page.evaluate(() => window.engine.env.reset(true));
    const cornerAfterReset = await page.evaluate(() => window.engine.env.grid_map.cellAt(0, 0).state.name);
    expect(cornerAfterReset).toBe('invincible_wall');

    await openPanel(page, 'environment');
    await page.locator('#petri-dish-toggle').uncheck();
    const corner = await page.evaluate(() => window.engine.env.grid_map.cellAt(0, 0).state.name);
    expect(corner).toBe('empty');
  });

  test('Save panel downloads a world snapshot', async ({ page }) => {
    await openPanel(page, 'save');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-world-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^life_engine_world_\d+\.json$/);
    await expect(page.getByTestId('hud-notifications')).toContainText('World saved successfully');
  });
});
