const { test, expect, openEditor, loadPreset, pauseEngine, clickEditorCell } = require('./helpers/fixtures');

const org = (page, field) => page.evaluate(f => window.engine.organism_editor.organism[f], field);

test.describe('Organism details', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
  });

  test('Move range and mutation rate write to the organism and are undoable', async ({ page }) => {
    await page.locator('#move-range').fill('9');
    expect(await org(page, 'move_range')).toBe(9);

    await page.locator('#mutation-rate').fill('17');
    expect(await org(page, 'mutability')).toBe(17);

    // Sliders don't swallow the undo shortcut the way text inputs do
    await page.keyboard.press('Control+z');
    expect(await org(page, 'mutability')).toBe(5);
  });

  test('Cell-specific traits only appear when the organism has that cell', async ({ page }) => {
    await expect(page.locator('#healer-cost')).toBeHidden();
    await expect(page.locator('#poison-duration')).toBeHidden();

    await page.locator('.cell-type#healer').click();
    await clickEditorCell(page, 1, 0);
    await expect(page.locator('#healer-cost')).toBeVisible();

    await page.locator('.cell-type#poison').click();
    await clickEditorCell(page, 0, 1);
    await expect(page.locator('#poison-duration')).toBeVisible();

    await page.locator('#poison-duration').fill('25');
    expect(await org(page, 'poison_duration')).toBe(25);
  });

  test('Unnatural organisms are flagged', async ({ page }) => {
    // A normal organism is natural
    await expect(page.locator('#unnatural-warning')).toBeHidden();

    // Stacking two cells on one coordinate makes it unnatural (the degenerate
    // NED preset that used to cover this has been removed, so build one raw)
    await page.evaluate(() => {
      window.engine.organism_editor.loadRawOrg({
        c: 7, r: 7, lifetime: 0, food_collected: 0, living: true, direction: 2,
        rotation: 0, can_rotate: false, move_count: 0, move_range: 2,
        ignore_brain_for: 0, mutability: 5, damage: 0,
        anatomy: { birth_distance: 4, is_producer: true, is_mover: false, has_eyes: false, cells: [
          { loc_col: 0, loc_row: 0, state: { name: 'mouth' } },
          { loc_col: 0, loc_row: 0, state: { name: 'producer' } },
        ]},
      });
      window.engine.emitChange(true);
    });
    await expect(page.locator('#unnatural-warning')).toBeVisible();
  });

  test('Seed World restarts the world from this organism', async ({ page }) => {
    await loadPreset(page, 'hunter');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#seed-world').click();

    const world = await page.evaluate(() => ({
      count: window.engine.env.organisms.length,
      cells: window.engine.env.organisms[0]?.anatomy.cells.length,
    }));
    expect(world.count).toBe(1);
    expect(world.cells).toBe(5); // hunter
  });
});
