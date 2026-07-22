const { test, expect, openWorldControls } = require('./helpers/fixtures');

test.describe('Radiation Tool', () => {
  test.beforeEach(async ({ page }) => {
    // Paint tools live in the always-on bottom-left palette, no modal needed
    await page.locator('#radiation-drop').click();
  });

  test('Placing and clearing radiation', async ({ page }) => {
    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });

    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    await openWorldControls(page);
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
