const { test, expect } = require('@playwright/test');

test.describe('Simulation Controls', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
    await page.goto('/');
    await page.waitForFunction(() => window.engine !== undefined);
    const maximizeBtn = page.locator('#maximize');
    if (await maximizeBtn.isVisible()) await maximizeBtn.click();
  });

  test('Play/Pause button toggles simulation state', async ({ page }) => {
    const pauseBtn = page.locator('.pause-button').first();
    const icon = pauseBtn.locator('i');

    // Initially it might be paused or playing depending on default state
    // In Life Engine, it starts paused by default
    await expect(icon).toHaveClass(/fa-play/);

    // Click play
    await pauseBtn.click();
    await expect(icon).toHaveClass(/fa-pause/);

    // Click pause again
    await pauseBtn.click();
    await expect(icon).toHaveClass(/fa-play/);
  });

  test('Clear environment button clears all organisms', async ({ page }) => {
    // Drop a random organism first
    await page.locator('#world-controls.tabnav-item').click();
    await page.locator('#reset-env').click();
    
    // Check organism count in the simulation (could use evaluate or stats panel)
    const orgCount = await page.evaluate(() => window.engine.env.organisms.length);
    expect(orgCount).toBeGreaterThan(0);

    // Click clear
    await page.locator('#clear-env').click();

    // Check count is 0
    const newOrgCount = await page.evaluate(() => window.engine.env.organisms.length);
    expect(newOrgCount).toBe(0);
  });

  test('Drop Organism populates the environment', async ({ page }) => {
    // Go to editor
    await page.locator('#editor.tabnav-item').click();
    
    // Click Drop Organism button
    await page.locator('#drop-org').click();

    // Click the environment canvas
    const envCanvas = page.locator('#env-canvas');
    const box = await envCanvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    // Check that an organism was added to the environment
    const orgCount = await page.evaluate(() => window.engine.env.organisms.length);
    expect(orgCount).toBe(1);
  });
});
