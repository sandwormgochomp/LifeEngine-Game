const { test, expect, pauseEngine } = require('./helpers/fixtures');

test.describe('Perf panel', () => {
  test('Hidden by default with instrumentation disabled', async ({ page }) => {
    await expect(page.getByTestId('perf-panel')).toHaveCount(0);
    expect(await page.evaluate(() => window.perf.enabled)).toBe(false);
  });

  test('P toggles the panel, which enables the probes and collects samples', async ({ page }) => {
    await page.keyboard.press('p');
    await expect(page.getByTestId('perf-panel')).toBeVisible();
    expect(await page.evaluate(() => window.perf.enabled)).toBe(true);

    // The sim is running, so the whole-tick bucket fills within a few frames.
    await expect.poll(
      () => page.evaluate(() => window.perf.snapshot().tick?.avg ?? 0),
      { timeout: 5000 }
    ).toBeGreaterThan(0);

    // Escape closes the panel, which turns the probes back off.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('perf-panel')).toHaveCount(0);
    expect(await page.evaluate(() => window.perf.enabled)).toBe(false);
  });

  test('Clicking the fps readout opens the panel', async ({ page }) => {
    await page.locator('#fps-actual').click();
    await expect(page.getByTestId('perf-panel')).toBeVisible();
    await page.locator('#fps-actual').click();
    await expect(page.getByTestId('perf-panel')).toHaveCount(0);
  });

  test('Measured tick rate is live while running and zero when paused', async ({ page }) => {
    await expect.poll(
      () => page.evaluate(() => window.engine.actual_tps),
      { timeout: 5000 }
    ).toBeGreaterThan(0);

    await pauseEngine(page);
    expect(await page.evaluate(() => window.engine.actual_tps)).toBe(0);
  });
});
