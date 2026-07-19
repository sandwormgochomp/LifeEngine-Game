const { test, expect, openPanel } = require('./helpers/fixtures');

test.describe('Stats Panel', () => {
  test('Opening the stats panel renders a CanvasJS chart', async ({ page }) => {
    await openPanel(page, 'stats');
    await expect(page.locator('#org-count')).toBeVisible();
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();
  });

  test('Switching chart type re-renders the chart', async ({ page }) => {
    await openPanel(page, 'stats');
    await page.locator('#chart-option').selectOption('2');
    await expect(page.locator('#chartContainer canvas').first()).toBeVisible();
    await expect(page.locator('#chart-note')).toContainText(/small populations/i);
  });
});
