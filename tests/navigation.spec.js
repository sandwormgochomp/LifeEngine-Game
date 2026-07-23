const { test, expect, openPanel, openEditor, openNewGame, closeModal } = require('./helpers/fixtures');

test.describe('Navigation and UI', () => {
  test('Page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle(/Life Engine/);
    await expect(page.locator('#env-canvas')).toBeVisible();
  });

  test('Toolbar items toggle their panel, modal or dock', async ({ page }) => {
    // Popups
    await openPanel(page, 'save');
    await expect(page.locator('#save-world-btn')).toBeVisible();
    await openPanel(page, 'stats');
    await expect(page.locator('#org-count')).toBeVisible();
    await expect(page.locator('#save-world-btn')).toBeHidden();
    await openPanel(page, 'stats');
    await expect(page.locator('#org-count')).toBeHidden();

    // Modals: opened from the toolbar, dismissed with Escape (the backdrop
    // deliberately covers the toolbar so it can never occlude modal content)
    await openPanel(page, 'rules');
    await expect(page.locator('#tool-rules')).toHaveClass(/toolbarBtnActive/);
    await expect(page.getByTestId('evolution-modal')).toBeVisible();
    await closeModal(page, 'evolution-modal');

    // Dock
    await openEditor(page);
    await expect(page.getByTestId('editor-dock')).toBeVisible();
    await openEditor(page);
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });

  test('Hint bar reflects the mode and live brush size', async ({ page }) => {
    // Unarmed boot: the idle hint offers sampling and pan, nothing else
    await expect(page.getByText(/sample organism .* pan/)).toBeVisible();

    // Paint tools + brush live in the always-on bottom-left palette
    await page.locator('#wall').click();
    await expect(page.getByText(/place wall .* brush Radius: 2/)).toBeVisible();

    await page.locator('#kill').click();
    await expect(page.getByText(/kill organism .* brush Radius: 2/)).toBeVisible();

    // The brush slider feeds both the hint bar and the engine
    await page.locator('#brush-slider').fill('4');
    await expect(page.getByText(/kill organism .* brush Radius: 4/)).toBeVisible();
    expect(await page.evaluate(() => window.engine.env.controller.mode)).toBeDefined();
  });

  test('Hint bar switches to a disabled message while headless', async ({ page }) => {
    // Headless kills every tool (only middle-drag pan survives), and the hint
    // bar says so instead of advertising the armed tool
    await page.locator('#wall').click();
    await page.keyboard.press('h');
    await expect(page.getByText(/tools disabled while rendering is off/)).toBeVisible();

    // Toggling rendering back restores the armed tool's hint
    await page.keyboard.press('h');
    await expect(page.getByText(/place wall/)).toBeVisible();
  });

  test('Escape closes the modal first, then the editor dock', async ({ page }) => {
    await openEditor(page);
    await openNewGame(page);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('newgame-modal')).toBeHidden();
    await expect(page.getByTestId('editor-dock')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });
});
