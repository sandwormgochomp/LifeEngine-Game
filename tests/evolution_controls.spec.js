const { test, expect } = require('./helpers/fixtures');

test.describe('Evolution controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('#tool-rules').click();
    await expect(page.getByTestId('evolution-modal')).toBeVisible();
  });

  // The regression that motivated this: the old panel bound sliders to
  // Hyperparams keys no engine code reads, so nothing it did mattered.
  test('Changing a control actually reaches the engine', async ({ page }) => {
    await page.locator('#lifespanMultiplier').fill('250');
    await page.locator('#lookRange').fill('7');
    await page.locator('#instaKill').check();

    const applied = await page.evaluate(() => {
      const org = window.engine.env.organisms[0];
      return {
        // lifespan is read per-organism from the shared Hyperparams object
        lifespan: org.lifespan(),
        cells: org.anatomy.cells.length,
      };
    });
    // lifespan() === cells * lifespanMultiplier
    expect(applied.lifespan).toBe(applied.cells * 250);
  });

  test('Global mutation rate only appears when evolved rates are off', async ({ page }) => {
    // Evolved rates are on by default, so the global field is hidden
    await expect(page.locator('#globalMutability')).toBeHidden();

    await page.locator('#useGlobalMutability').uncheck();
    await expect(page.locator('#globalMutability')).toBeVisible();

    await page.locator('#globalMutability').fill('42');
    const rate = await page.evaluate(() => window.engine.env.averageMutability());
    expect(rate).toBe(42);
  });

  test('Reset all restores boot defaults', async ({ page }) => {
    await page.locator('#lookRange').fill('3');
    await page.locator('#reset-rules').click();
    await expect(page.locator('#lookRange')).toHaveValue('20');
  });

  test('Controls can be saved to JSON', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-controls').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('evolution_controls.json');
  });

  test('Escape closes the modal', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('evolution-modal')).toBeHidden();
  });
});
