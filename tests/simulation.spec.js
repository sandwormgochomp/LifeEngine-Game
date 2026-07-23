const { test, expect, openPanel, openNewGame } = require('./helpers/fixtures');

test.describe('Simulation Controls', () => {
  test('Each speed button sets its rate, and shows as the active one', async ({ page }) => {
    // The simulation starts at Play, 0.5x
    expect(await page.evaluate(() => window.engine.fps)).toBe(30);
    await expect(page.locator('#speed-1')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#speed-2').click(); // Fast, 4x
    expect(await page.evaluate(() => window.engine.fps)).toBe(240);
    await expect(page.locator('#speed-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#speed-1')).toHaveAttribute('aria-pressed', 'false');

    await page.locator('#speed-3').click(); // Faster, 8x
    expect(await page.evaluate(() => window.engine.fps)).toBe(480);

    await page.locator('#speed-0').click(); // Pause
    expect(await page.evaluate(() => window.engine.running)).toBe(false);
    expect(await page.evaluate(() => window.engine.fps)).toBe(0);
    await expect(page.locator('#speed-0')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Space resumes at the speed that was running, not the default', async ({ page }) => {
    await page.locator('#speed-3').click(); // Faster
    expect(await page.evaluate(() => window.engine.fps)).toBe(480);

    await page.keyboard.press(' ');
    expect(await page.evaluate(() => window.engine.running)).toBe(false);

    await page.keyboard.press(' ');
    expect(await page.evaluate(() => window.engine.fps)).toBe(480);
    await expect(page.locator('#speed-3')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Clear Life empties the world; New Game reseeds one', async ({ page }) => {
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBeGreaterThan(0);

    // Clear Life is a one-shot palette action, sibling of Clear Walls/Radiation
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-life').click();
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBe(0);

    // New Game with life on reseeds a single origin organism
    await openNewGame(page);
    await page.locator('#newgame-start').click();
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBe(1);
  });

  test('World is a circular petri dish by default and survives a reset', async ({ page }) => {
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
