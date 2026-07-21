const { test, expect, openEditor, openWorldControls, loadPreset } = require('./helpers/fixtures');

test.describe('Visual Regression Tests', () => {
  test('Main dashboard layout', async ({ page }) => {
    // Wait for the engine to initialize and then pause it to ensure visual determinism
    await page.evaluate(() => window.engine.stop());

    // Verify page visually matches the snapshot
    await expect(page).toHaveScreenshot('main-dashboard.png', { maxDiffPixelRatio: 0.05 });
  });

  test('World controls modal visual layout', async ({ page }) => {
    await page.evaluate(() => window.engine.stop());

    // Open world controls modal
    await openWorldControls(page);

    // Verify world controls modal visually matches the snapshot
    const modal = page.locator('[data-testid="world-modal"]');
    await expect(modal).toHaveScreenshot('world-controls-modal.png', { maxDiffPixelRatio: 0.02 });
  });

  test('Editor dock visual layout', async ({ page }) => {
    await page.evaluate(() => window.engine.stop());

    // Open the editor dock
    await openEditor(page);

    // Verify the editor dock visually matches the snapshot
    const dock = page.getByTestId('editor-dock');
    await expect(dock).toHaveScreenshot('editor-dock.png');
  });

  test('Editor dock with Fly Catcher preset', async ({ page }) => {
    await page.evaluate(() => window.engine.stop());

    // Open the editor dock
    await openEditor(page);

    // Load the Fly Catcher preset
    await loadPreset(page, 'flycatcher');

    // Verify the editor dock showing the Fly Catcher visually matches the snapshot
    const dock = page.getByTestId('editor-dock');
    await expect(dock).toHaveScreenshot('editor-dock-flycatcher.png');
  });
});
