const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Navigation and UI', () => {
  test('Page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle(/Life Engine/);
    await expect(page.locator('#env-canvas')).toBeVisible();
  });

  test('Toolbar buttons open and close their panels', async ({ page }) => {
    // Open the environment panel
    await openPanel(page, 'environment');
    await expect(page.locator('#reset-env')).toBeVisible();

    // Switch to the editor panel
    await openPanel(page, 'edit');
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await expect(page.locator('#reset-env')).toBeHidden();

    // Clicking the active tool again closes the panel
    await openPanel(page, 'edit');
    await expect(page.locator('#editor-canvas')).toBeHidden();
  });

  test('Escape key closes the active panel', async ({ page }) => {
    await openPanel(page, 'environment');
    await expect(page.locator('#reset-env')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-env')).toBeHidden();
  });
});
