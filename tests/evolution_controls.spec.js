const { test, expect, openEvolutionFineTuning } = require('./helpers/fixtures');

test.describe('Evolution controls', () => {
  test.beforeEach(async ({ page }) => {
    // The per-parameter rows these tests drive live in the Console's
    // fine-tuning fold, which is where the old Manual tab ended up
    await openEvolutionFineTuning(page);
    await expect(page.getByTestId('evolution-modal')).toBeVisible();
  });

  // The regression that motivated this: the old panel bound sliders to
  // Hyperparams keys no engine code reads, so nothing it did mattered.
  test('Changing a control actually reaches the engine', async ({ page }) => {
    await page.locator('#console-lifespanMultiplier').fill('250');
    await page.locator('#console-lookRange').fill('7');
    // One-touch kill is a hazard, so its checkbox is up on the tab itself
    await page.locator('#console-instaKill').check();

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

  /* The fold is the only place evolved rates can be switched off without the
     MUTATION dial overwriting the stored rate in the same gesture, which is
     the reason it carries the dialled parameters at all. */
  test('Global mutation rate only appears when evolved rates are off', async ({ page }) => {
    // Evolved rates are on by default, so the global field is hidden
    await expect(page.locator('#console-globalMutability')).toBeHidden();

    await page.locator('#console-useGlobalMutability').uncheck();
    await expect(page.locator('#console-globalMutability')).toBeVisible();

    await page.locator('#console-globalMutability').fill('42');
    const rate = await page.evaluate(() => window.engine.env.averageMutability());
    expect(rate).toBe(42);
  });

  test('Reset all restores boot defaults', async ({ page }) => {
    await page.locator('#console-lookRange').fill('3');
    await page.locator('#reset-rules').click();
    await expect(page.locator('#console-lookRange')).toHaveValue('20');
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
