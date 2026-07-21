const { test, expect, openEditor, openWorldControls } = require('./helpers/fixtures');

test.describe('Visual Regression Tests', () => {
  test('Main dashboard layout', async ({ page }) => {
    // Wait for the engine to initialize and then pause it to ensure visual determinism
    await page.evaluate(() => window.engine.stop());

    // Verify page visually matches the snapshot
    await expect(page).toHaveScreenshot('main-dashboard.png');
  });

  test('World controls modal visual layout', async ({ page }) => {
    await page.evaluate(() => window.engine.stop());

    // Open world controls modal
    await openWorldControls(page);

    // Verify world controls modal visually matches the snapshot
    const modal = page.locator('[data-testid="world-modal"]');
    await expect(modal).toHaveScreenshot('world-controls-modal.png');
  });

  test('Editor dock visual layout', async ({ page }) => {
    await page.evaluate(() => window.engine.stop());

    // Open the editor dock
    await openEditor(page);

    // Verify the editor dock visually matches the snapshot
    const dock = page.getByTestId('editor-dock');
    await expect(dock).toHaveScreenshot('editor-dock.png');
  });
});
