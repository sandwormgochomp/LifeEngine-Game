const { test, expect, openEditor, pauseEngine } = require('./helpers/fixtures');

const mode = (page) => page.evaluate(() => window.engine.env.controller.mode);

test.describe('Hotkeys and global controls', () => {
  test('Tool hotkeys switch the world mode', async ({ page }) => {
    await page.keyboard.press('d');
    expect(await mode(page)).toBe(2); // WallDrop
    await page.keyboard.press('f');
    expect(await mode(page)).toBe(1); // FoodDrop
    await page.keyboard.press('g');
    expect(await mode(page)).toBe(3); // ClickKill
    await page.keyboard.press('s');
    expect(await mode(page)).toBe(7); // Drag
    await page.keyboard.press('z');
    expect(await mode(page)).toBe(4); // Select
  });

  test('Space toggles play/pause and X toggles the lab', async ({ page }) => {
    expect(await page.evaluate(() => window.engine.running)).toBe(true);
    await page.keyboard.press(' ');
    expect(await page.evaluate(() => window.engine.running)).toBe(false);
    await page.keyboard.press(' ');
    expect(await page.evaluate(() => window.engine.running)).toBe(true);

    await page.keyboard.press('x');
    await expect(page.getByTestId('editor-dock')).toBeVisible();
    await page.keyboard.press('x');
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });

  test('B clears walls', async ({ page }) => {
    await pauseEngine(page);
    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(before).toBeGreaterThan(0);

    await page.keyboard.press('b');
    const after = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length);
    expect(after).toBe(0);
  });

  test('Hotkeys do not fire while typing in a field', async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
    const before = await mode(page);

    // 'd', 'f' and 'g' are all tool hotkeys but must be plain text here
    await page.locator('#species-name').fill('');
    await page.locator('#species-name').type('dfg');

    await expect(page.locator('#species-name')).toHaveValue('dfg');
    expect(await mode(page)).toBe(before);
  });

  test('H toggles headless rendering', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.getByTestId('headless-notice')).toBeVisible();
    await expect(page.locator('#headless-toggle')).toHaveClass(/playbackBtnActive/);

    await page.keyboard.press('h');
    await expect(page.getByTestId('headless-notice')).toBeHidden();
  });

  test('About panel lists cell types and hotkeys', async ({ page }) => {
    await page.locator('#tool-about').click();
    await expect(page.getByText('Eats adjacent food')).toBeVisible();
    await expect(page.getByText('play / pause')).toBeVisible();
  });
});
