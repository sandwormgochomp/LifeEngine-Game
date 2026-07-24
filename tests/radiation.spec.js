const { test, expect } = require('./helpers/fixtures');

test.describe('Radiation Tool', () => {
  test.beforeEach(async ({ page }) => {
    // Paint tools live in the always-on bottom-left palette, no modal needed
    await page.locator('#radiation-drop').click();
  });

  test('Placing and clearing radiation', async ({ page }) => {
    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });

    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    // Clear Radiation now lives in the always-on palette, no modal needed
    await page.locator('#clear-radiation').click();

    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });

  test('Eraser removes radiation; right-click cancels the tool', async ({ page }) => {
    const envCanvas = page.locator('#env-canvas');
    await envCanvas.click({ position: { x: 300, y: 200 } });

    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    // Right-click no longer erases -- it puts the tool away
    await envCanvas.click({ button: 'right', position: { x: 300, y: 200 } });
    expect(await page.evaluate(() => window.engine.env.radiation_map.size)).toBe(radCount);
    expect(await page.evaluate(() => window.engine.env.controller.mode)).toBe(0);

    // The Eraser tool clears it
    await page.locator('#eraser').click();
    await envCanvas.click({ position: { x: 300, y: 200 } });

    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });
});
