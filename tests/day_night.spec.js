const { test, expect, pauseEngine } = require('./helpers/fixtures');

const toggle = page => page.locator('#day-night-toggle');
const env = page => page.locator('#env');
const worldCanvas = page => page.locator('#env-canvas');

test.describe('Day/Night', () => {
  // The HUD's top-right cluster overlaps the top-center stats bar at 1280px,
  // covering this button; widen so the click lands.
  test.use({ viewport: { width: 1600, height: 900 } });

  // Regression: the toggle used to push styles from the engine and notify the
  // HUD through a method that didn't exist. While the sim ran, the frame loop
  // masked it; paused, the HUD's is_night never refreshed, so every click asked
  // for night again and the world stayed dark.
  test('toggles both ways while the simulation is paused', async ({ page }) => {
    await pauseEngine(page);
    await expect(toggle(page)).toContainText('DAY');

    await toggle(page).click();
    await expect(toggle(page)).toContainText('NIGHT');
    await expect(worldCanvas(page)).toHaveCSS('filter', /brightness/);

    await toggle(page).click();
    await expect(toggle(page)).toContainText('DAY');
    await expect(worldCanvas(page)).toHaveCSS('filter', 'none');
  });

  test('every canvas layer dims and undims together', async ({ page }) => {
    await pauseEngine(page);
    const layers = ['#env-canvas', '#env-deco-canvas', '#env-glow-canvas'];

    await toggle(page).click();
    for (const sel of layers) {
      await expect(page.locator(sel)).toHaveCSS('filter', /brightness/);
    }

    await toggle(page).click();
    for (const sel of layers) {
      await expect(page.locator(sel)).toHaveCSS('filter', 'none');
    }
  });

  // reset() used to clear is_night and the canvas filters by hand, but left the
  // container black and the glow layer dimmed.
  test('reset from night fully restores the day view', async ({ page }) => {
    await pauseEngine(page);
    await toggle(page).click();
    await expect(toggle(page)).toContainText('NIGHT');

    await page.evaluate(() => window.engine.env.reset(true));

    await expect(toggle(page)).toContainText('DAY');
    await expect(env(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('#env-glow-canvas')).toHaveCSS('filter', 'none');
  });
});
