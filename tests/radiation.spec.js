const { test, expect } = require('@playwright/test');

test.describe('Radiation Tool', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    const maximizeBtn = page.locator('#maximize');
    if (await maximizeBtn.isVisible()) await maximizeBtn.click();
  });

  test('Placing and clearing radiation', async ({ page }) => {
    // Open environment tab
    await page.locator('#world-controls.tabnav-item').click();
    
    // Select the radiation tool
    await page.locator('#radiation-drop').first().click();

    // Click the environment canvas to place radiation
    const envCanvas = page.locator('#env-canvas');
    await envCanvas.click({ button: 'left' });

    // Check that radiation was added
    const radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    // Click to clear all radiation
    await page.locator('#clear-radiation').click();

    // Check that radiation was cleared
    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });

  test('Erasing radiation with right click', async ({ page }) => {
    // Open environment tab
    await page.locator('#world-controls.tabnav-item').click();
    
    // Select the radiation tool
    await page.locator('#radiation-drop').first().click();

    // Click the environment canvas to place radiation
    const envCanvas = page.locator('#env-canvas');
    
    // Place radiation
    await envCanvas.click({ button: 'left' });
    
    // Ensure it was placed
    let radCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(radCount).toBeGreaterThan(0);

    // Erase radiation with right click
    await envCanvas.click({ button: 'right' });

    // Check that radiation was erased
    const newRadCount = await page.evaluate(() => window.engine.env.radiation_map.size);
    expect(newRadCount).toBe(0);
  });
});
