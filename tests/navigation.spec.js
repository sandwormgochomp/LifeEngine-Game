const { test, expect, openPanel, openEditor } = require('./helpers/fixtures');

test.describe('Navigation and UI', () => {
  test('Page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle(/Life Engine/);
    await expect(page.locator('#env-canvas')).toBeVisible();
  });

  test('Toolbar popups toggle; opening the editor dock closes the popup', async ({ page }) => {
    await openPanel(page, 'environment');
    await expect(page.locator('#reset-env')).toBeVisible();

    // Switching to another popup swaps the content
    await openPanel(page, 'save');
    await expect(page.locator('#save-world-btn')).toBeVisible();
    await expect(page.locator('#reset-env')).toBeHidden();

    // Opening the editor dock closes the popup
    await openEditor(page);
    await expect(page.getByTestId('editor-dock')).toBeVisible();
    await expect(page.locator('#save-world-btn')).toBeHidden();

    // A popup can sit alongside the open dock
    await openPanel(page, 'environment');
    await expect(page.locator('#reset-env')).toBeVisible();
    await expect(page.getByTestId('editor-dock')).toBeVisible();

    // Clicking the active tool again closes it
    await openPanel(page, 'environment');
    await expect(page.locator('#reset-env')).toBeHidden();
    await openEditor(page);
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });

  test('Hint bar shows the mode actions and brush size', async ({ page }) => {
    await openPanel(page, 'environment');
    await page.locator('#wall').click();
    await expect(page.getByText(/place wall .* brush 5×5/)).toBeVisible();

    await page.locator('#kill').click();
    await expect(page.getByText(/kill organism .* brush 5×5/)).toBeVisible();
  });

  test('Escape closes the popup first, then the editor dock', async ({ page }) => {
    await openEditor(page);
    await openPanel(page, 'environment');

    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-env')).toBeHidden();
    await expect(page.getByTestId('editor-dock')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });
});
