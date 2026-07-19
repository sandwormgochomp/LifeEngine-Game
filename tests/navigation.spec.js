const { test, expect } = require('@playwright/test');

test.describe('Navigation and UI', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    // Check if it's minimized and click maximize if needed
    const maximizeBtn = page.locator('#maximize');
    if (await maximizeBtn.isVisible()) {
      await maximizeBtn.click();
    }
  });

  test('Page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle(/Life Engine/);
    const canvas = page.locator('#env-canvas');
    await expect(canvas).toBeVisible();
  });

  test('Tab switching works correctly', async ({ page }) => {
    // Default is Editor because we want users to start there?
    // Wait, initially #editor might not be the default, but we can click them.
    
    // Switch to World Controls
    await page.locator('#world-controls.tabnav-item').click();
    await expect(page.locator('div#world-controls.tab')).toBeVisible();
    await expect(page.locator('div#editor.tab')).toBeHidden();

    // Switch back to Editor
    await page.locator('#editor.tabnav-item').click();
    await expect(page.locator('div#editor.tab')).toBeVisible();
    await expect(page.locator('div#world-controls.tab')).toBeHidden();
  });

  test('Minimize and maximize panel works', async ({ page }) => {
    const minimizeBtn = page.locator('#minimize');
    await minimizeBtn.click();
    await expect(page.locator('.tabnav-item').first()).toBeHidden();
    
    const maximizeBtn = page.locator('#maximize');
    await maximizeBtn.click();
    await expect(page.locator('.tabnav-item').first()).toBeVisible();
  });
});
