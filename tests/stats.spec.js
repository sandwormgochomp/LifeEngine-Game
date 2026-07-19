const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Stats Panel', () => {
  test('Opening the stats panel renders a CanvasJS chart', async ({ page }) => {
    await openPanel(page, 'stats');
    await expect(page.locator('#org-count')).toBeVisible();
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();
  });

  test('Chart re-renders after closing and reopening the panel', async ({ page }) => {
    await openPanel(page, 'stats');
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();

    await openPanel(page, 'stats'); // close
    await expect(page.locator('#chartContainer')).toBeHidden();

    await openPanel(page, 'stats'); // reopen into a fresh container
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();
  });

  test('Switching chart type re-renders the chart', async ({ page }) => {
    await openPanel(page, 'stats');
    await page.locator('#chart-option').selectOption('2');
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();
    await expect(page.locator('#chart-note')).toContainText(/small populations/i);
  });
});
