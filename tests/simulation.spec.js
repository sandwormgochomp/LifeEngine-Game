const { test, expect, openPanel, pauseEngine } = require('./helpers/fixtures');

test.describe('Simulation Controls', () => {
  test('Play/Pause buttons toggle simulation state', async ({ page }) => {
    // The simulation starts running
    expect(await page.evaluate(() => window.engine.running)).toBe(true);

    await page.getByTitle('Pause').click();
    expect(await page.evaluate(() => window.engine.running)).toBe(false);

    await page.getByTitle('Play').click();
    expect(await page.evaluate(() => window.engine.running)).toBe(true);
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

  test('Drop Organism populates the environment', async ({ page }) => {
    await pauseEngine(page);
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await openPanel(page, 'environment');
    await page.locator('#drop-org').click();

    // Click an empty area away from the HUD panel (bottom center) and the origin organism
    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });

    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBe(before + 1);
  });
});
