const { test, expect, openEditor, pauseEngine, clickEditorCell, localCellState } = require('./helpers/fixtures');

const cellCountText = (page) => page.locator('#edit-organism-details .cell-count');

test.describe('Organism Lab dock', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test('Opens ready to draw: Draw tool and a cell type are pre-selected', async ({ page }) => {
    await expect(page.locator('#draw-tool')).toHaveClass(/active/);
    await expect(page.locator('.cell-type#common')).toHaveClass(/dockCellBtnActive/);

    // No mode fiddling needed: a click immediately places a cell
    await clickEditorCell(page, 1, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);
    expect(await localCellState(page, 1, 0)).toBe('common');
  });

  test('Choosing a cell type switches to the Draw tool', async ({ page }) => {
    await page.locator('#erase-tool').click();
    await expect(page.locator('#erase-tool')).toHaveClass(/active/);

    await page.locator('.cell-type#producer').click();
    await expect(page.locator('#draw-tool')).toHaveClass(/active/);
    await expect(page.locator('.cell-type#producer')).toHaveClass(/dockCellBtnActive/);
  });

  test('Erase tool and right-click both remove cells', async ({ page }) => {
    await clickEditorCell(page, 1, 0);
    await clickEditorCell(page, 2, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 3/);

    // Erase tool with left click
    await page.locator('#erase-tool').click();
    await clickEditorCell(page, 1, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    // Right-click erases even with the Draw tool active
    await page.locator('#draw-tool').click();
    await clickEditorCell(page, 2, 0, 'right');
    await expect(cellCountText(page)).toHaveText(/Cell count: 1/);
  });

  test('Removing the center cell is refused with a toast', async ({ page }) => {
    await clickEditorCell(page, 0, 0, 'right');

    await expect(page.getByTestId('hud-notifications')).toContainText('Cannot remove center cell');
    await expect(cellCountText(page)).toHaveText(/Cell count: 1/);
    await expect(page.getByTestId('hud-notifications')).toBeHidden({ timeout: 5000 });
  });

  test('Paint tool recolors a cell', async ({ page }) => {
    await clickEditorCell(page, 1, 0);

    await page.locator('#cell-color-picker').fill('#123456');
    await expect(page.locator('#paint-tool')).toHaveClass(/active/);
    await clickEditorCell(page, 1, 0);

    const color = await page.evaluate(() => {
      return window.engine.organism_editor.organism.anatomy.getLocalCell(1, 0).custom_color;
    });
    expect(color).toBe('#123456');
  });

  test('Undo and redo walk the edit history', async ({ page }) => {
    await expect(page.locator('#undo-btn')).toBeDisabled();

    await clickEditorCell(page, 1, 0);
    await clickEditorCell(page, 0, 1);
    await expect(cellCountText(page)).toHaveText(/Cell count: 3/);

    await page.locator('#undo-btn').click();
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    await page.locator('#undo-btn').click();
    await expect(cellCountText(page)).toHaveText(/Cell count: 1/);
    await expect(page.locator('#undo-btn')).toBeDisabled();

    await page.locator('#redo-btn').click();
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    // Keyboard shortcuts drive the same history
    await page.keyboard.press('Control+z');
    await expect(cellCountText(page)).toHaveText(/Cell count: 1/);
    await page.keyboard.press('Control+y');
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);
  });

  test('Rotate and flip transform the anatomy', async ({ page }) => {
    await page.locator('.cell-type#producer').click();
    await clickEditorCell(page, 1, 0);
    expect(await localCellState(page, 1, 0)).toBe('producer');

    // 90° clockwise: (1,0) -> (0,1)
    await page.locator('#rotate-btn').click();
    expect(await localCellState(page, 1, 0)).toBe(null);
    expect(await localCellState(page, 0, 1)).toBe('producer');

    // Mirror: (0,1) stays put; add one at (1,0) and flip it to (-1,0)
    await clickEditorCell(page, 1, 0);
    await page.locator('#flip-btn').click();
    expect(await localCellState(page, -1, 0)).toBe('producer');
    expect(await localCellState(page, 1, 0)).toBe(null);
  });

  test('Rotating an organism with an eye turns the eye too', async ({ page }) => {
    await page.locator('.cell-type#eye').click();
    await clickEditorCell(page, 0, -1);

    const dirBefore = await page.evaluate(() => {
      return window.engine.organism_editor.organism.anatomy.getLocalCell(0, -1).direction;
    });
    expect(dirBefore).toBe(0); // up

    await page.locator('#rotate-btn').click();
    const dirAfter = await page.evaluate(() => {
      return window.engine.organism_editor.organism.anatomy.getLocalCell(1, 0).direction;
    });
    expect(dirAfter).toBe(1); // right
  });

  test('Clicking a placed eye rotates its direction', async ({ page }) => {
    await page.locator('.cell-type#eye').click();
    await clickEditorCell(page, 0, -1);

    await clickEditorCell(page, 0, -1); // same spot: rotate instead of replace
    const dir = await page.evaluate(() => {
      return window.engine.organism_editor.organism.anatomy.getLocalCell(0, -1).direction;
    });
    expect(dir).toBe(1);
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);
  });

  test('Zoom controls change the grid scale', async ({ page }) => {
    const cellSize = () => page.evaluate(() => window.engine.organism_editor.cell_size);
    const initial = await cellSize();

    await page.locator('#zoom-in').click();
    expect(await cellSize()).toBeGreaterThan(initial);

    await page.locator('#zoom-out').click();
    await page.locator('#zoom-out').click();
    expect(await cellSize()).toBeLessThan(initial);
  });

  test('Renaming the species sticks across edits', async ({ page }) => {
    await page.locator('#species-name').fill('Testosaurus');
    await clickEditorCell(page, 1, 0);

    await expect(page.locator('#species-name')).toHaveValue('Testosaurus');
    const name = await page.evaluate(() => window.engine.organism_editor.organism.species.name);
    expect(name).toBe('Testosaurus');
  });

  test('Ability badges reflect the anatomy', async ({ page }) => {
    await expect(page.locator('#edit-organism-details')).toContainText('EATS');

    await page.locator('.cell-type#mover').click();
    await clickEditorCell(page, 1, 0);
    await expect(page.locator('#edit-organism-details')).toContainText('MOVES');
  });

  test('Loading a preset fills the editor', async ({ page }) => {
    await page.locator('#preset-select').selectOption('hunter');

    await expect(page.locator('#species-name')).toHaveValue('Hunter');
    await expect(cellCountText(page)).toHaveText(/Cell count: 5/);
    expect(await localCellState(page, 0, 0)).toBe('mover');
  });

  test('Save downloads the organism as JSON', async ({ page }) => {
    await page.locator('#species-name').fill('Downloadus');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-org').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Downloadus.json');
  });

  test('Deploy arms clone mode and places organisms in the world', async ({ page }) => {
    await pauseEngine(page);
    await clickEditorCell(page, 1, 0);
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await page.locator('#deploy-org').click();
    await expect(page.locator('#deploy-org')).toHaveClass(/active/);

    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });
    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBe(before + 1);

    // Escape disarms without closing the dock
    await page.keyboard.press('Escape');
    await expect(page.locator('#deploy-org')).not.toHaveClass(/active/);
    await expect(page.getByTestId('editor-dock')).toBeVisible();
  });

  test('Editor keeps working after closing and reopening the dock', async ({ page }) => {
    await page.locator('.cell-type#producer').click();
    await clickEditorCell(page, 1, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    await openEditor(page); // close
    await expect(page.locator('#editor-canvas')).toBeHidden();
    await openEditor(page); // reopen: fresh canvas is bound
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    // Tool and cell type selection live on the engine and survive the remount
    await expect(page.locator('.cell-type#producer')).toHaveClass(/dockCellBtnActive/);
    await clickEditorCell(page, -1, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 3/);
  });
});

test.describe('Select from world', () => {
  test('Picking a world organism loads it into the editor and opens the dock', async ({ page }) => {
    await pauseEngine(page);

    // Arm select from the toolbar (no popup panel)
    await page.locator('#tool-select').click();
    await expect(page.locator('#tool-select')).toHaveClass(/toolbarBtnActive/);
    await expect(page.getByTestId('editor-dock')).toBeHidden();

    // Click on a known living organism
    const pos = await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      const cs = env.grid_map.cell_size;
      return { x: org.c * cs + cs / 2, y: org.r * cs + cs / 2 };
    });
    await page.locator('#env-canvas').click({ position: pos });

    await expect(page.getByTestId('editor-dock')).toBeVisible();
    await expect(page.locator('#tool-select')).not.toHaveClass(/toolbarBtnActive/);

    const counts = await page.evaluate(() => ({
      world: window.engine.env.organisms[0].anatomy.cells.length,
      editor: window.engine.organism_editor.organism.anatomy.cells.length,
    }));
    expect(counts.editor).toBe(counts.world);
  });
});
