const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Radiation Tool', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'environment');
    await page.locator('#radiation-drop').click();
  });

  test('Placing and clearing radiation', async ({ page }) => {
    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });

    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    await page.locator('#clear-radiation').click();

    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });

  test('Erasing radiation with right click', async ({ page }) => {
    const envCanvas = page.locator('#env-canvas');
    await envCanvas.click({ position: { x: 300, y: 200 } });

    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    // Erase with right click over the same brush area
    await envCanvas.click({ button: 'right', position: { x: 300, y: 200 } });

    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });
});
