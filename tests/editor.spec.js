const { test, expect, openEditor, loadPreset, pauseEngine, clickEditorCell, localCellState } = require('./helpers/fixtures');

const cellCountText = (page) => page.locator('#edit-organism-details .cell-count');

const localCellColor = (page, dc, dr) => page.evaluate(([dc, dr]) => {
  return window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr)?.custom_color ?? null;
}, [dc, dr]);

const eyeDirection = (page, dc, dr) => page.evaluate(([dc, dr]) => {
  return window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr)?.direction ?? null;
}, [dc, dr]);

test.describe('Organism Lab dock', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
  });

  test('Opens ready to draw, and picking a cell type re-arms the Draw tool', async ({ page }) => {
    // Draw + a default cell type are pre-selected: no mode fiddling needed
    await expect(page.locator('#draw-tool')).toHaveClass(/active/);
    await expect(page.locator('.cell-type#common')).toHaveClass(/dockCellBtnActive/);

    await clickEditorCell(page, 1, 0);
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);
    expect(await localCellState(page, 1, 0)).toBe('common');

    // Choosing a cell type from another tool switches back to Draw
    await page.locator('#erase-tool').click();
    await expect(page.locator('#erase-tool')).toHaveClass(/active/);
    await page.locator('.cell-type#producer').click();
    await expect(page.locator('#draw-tool')).toHaveClass(/active/);
    await expect(page.locator('.cell-type#producer')).toHaveClass(/dockCellBtnActive/);
  });

  test('Erase tool, right-click erase, and the protected center cell', async ({ page }) => {
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

    // The center cell refuses removal with a toast
    await clickEditorCell(page, 0, 0, 'right');
    await expect(page.getByTestId('hud-notifications')).toContainText('Cannot remove center cell');
    await expect(cellCountText(page)).toHaveText(/Cell count: 1/);
  });

  test('Paint tool recolors a cell', async ({ page }) => {
    await clickEditorCell(page, 1, 0);

    await page.locator('#cell-color-picker').fill('#123456');
    await expect(page.locator('#paint-tool')).toHaveClass(/active/);
    await clickEditorCell(page, 1, 0);

    expect(await localCellColor(page, 1, 0)).toBe('#123456');
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

  test('Rotate and flip transform the anatomy, eyes included', async ({ page }) => {
    await page.locator('.cell-type#eye').click();
    await clickEditorCell(page, 0, -1);
    expect(await eyeDirection(page, 0, -1)).toBe(0); // up

    // Clicking a placed eye rotates it in place instead of replacing it
    await clickEditorCell(page, 0, -1);
    expect(await eyeDirection(page, 0, -1)).toBe(1); // right
    await expect(cellCountText(page)).toHaveText(/Cell count: 2/);

    // 90° clockwise: (0,-1) -> (1,0), eye direction right -> down
    await page.locator('#rotate-btn').click();
    expect(await localCellState(page, 0, -1)).toBe(null);
    expect(await localCellState(page, 1, 0)).toBe('eye');
    expect(await eyeDirection(page, 1, 0)).toBe(2); // down

    // Mirror: (1,0) -> (-1,0); a downward eye is unchanged by a horizontal flip
    await page.locator('#flip-btn').click();
    expect(await localCellState(page, 1, 0)).toBe(null);
    expect(await localCellState(page, -1, 0)).toBe('eye');
    expect(await eyeDirection(page, -1, 0)).toBe(2);

    // Transforms are undoable
    await page.locator('#undo-btn').click();
    expect(await localCellState(page, 1, 0)).toBe('eye');
  });

  test('Zoom, species rename, and ability badges', async ({ page }) => {
    const cellSize = () => page.evaluate(() => window.engine.organism_editor.cell_size);
    const initial = await cellSize();

    await page.locator('#zoom-in').click();
    expect(await cellSize()).toBeGreaterThan(initial);
    await page.locator('#zoom-out').click();
    await page.locator('#zoom-out').click();
    expect(await cellSize()).toBeLessThan(initial);

    await page.locator('#species-name').fill('Testosaurus');
    await expect(page.locator('#edit-organism-details')).toContainText('EATS');

    await page.locator('.cell-type#mover').click();
    await clickEditorCell(page, 1, 0);
    await expect(page.locator('#edit-organism-details')).toContainText('MOVES');

    // The chosen name survives edits
    await expect(page.locator('#species-name')).toHaveValue('Testosaurus');
    const name = await page.evaluate(() => window.engine.organism_editor.organism.species.name);
    expect(name).toBe('Testosaurus');
  });

  test('The giant Bob preset loads without freezing and stays editable', async ({ page }) => {
    // Bob is ~10k cells; loading used to hard-freeze the tab (O(n²) anatomy rebuild)
    const start = Date.now();
    await loadPreset(page, 'Bob');
    await expect(cellCountText(page)).toHaveText(/Cell count: 10783/);
    expect(Date.now() - start).toBeLessThan(5000);

    // The editor is still responsive: place one more cell at the center's edge
    await page.locator('.cell-type#common').click();
    await clickEditorCell(page, 0, 0, 'left');
    expect(await localCellState(page, 0, 0)).toBe('common');
  });

  test('Presets picker shows every preset with a rendered thumbnail', async ({ page }) => {
    await page.locator('#open-presets').click();
    await expect(page.getByTestId('presets-modal')).toBeVisible();

    const cards = page.locator('.preset-card');
    await expect(cards).toHaveCount(16);
    await expect(page.locator('.preset-card[data-preset="hunter"] canvas')).toBeVisible();
    await expect(page.locator('.preset-card[data-preset="hunter"]')).toContainText('5 cells');

    // Escape closes the picker but leaves the dock open
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('presets-modal')).toBeHidden();
    await expect(page.getByTestId('editor-dock')).toBeVisible();
  });

  test('Presets load and Save downloads the organism as JSON', async ({ page }) => {
    await loadPreset(page, 'hunter');
    await expect(page.locator('#species-name')).toHaveValue('Hunter');
    await expect(cellCountText(page)).toHaveText(/Cell count: 5/);
    expect(await localCellState(page, 0, 0)).toBe('mover');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-org').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Hunter.json');
  });

  test('Deploy arms clone mode; right-click or Escape disarms it', async ({ page }) => {
    await clickEditorCell(page, 1, 0);
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await page.locator('#deploy-org').click();
    await expect(page.locator('#deploy-org')).toHaveClass(/active/);

    // Target a clear spot inside the petri dish, away from the origin organism
    await page.locator('#env-canvas').click({ position: { x: 600, y: 300 } });
    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBe(before + 1);

    // Right-click in the world cancels placement
    await page.locator('#env-canvas').click({ button: 'right', position: { x: 500, y: 300 } });
    await expect(page.locator('#deploy-org')).not.toHaveClass(/active/);

    // Escape also disarms (without closing the dock)
    await page.locator('#deploy-org').click();
    await expect(page.locator('#deploy-org')).toHaveClass(/active/);
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

  test('Grid covers its box and follows it when the layout resizes', async ({ page }) => {
    const gridState = () => page.evaluate(() => {
      const ed = window.engine.organism_editor;
      return {
        cols: ed.grid_map.cols,
        canvas_w: ed.renderer.canvas.width,
        canvas_h: ed.renderer.canvas.height,
        box_w: ed.renderer.container.clientWidth,
        box_h: ed.renderer.container.clientHeight,
        observing: !!ed.resize_observer,
      };
    });

    // The canvas covers the box on both axes: a canvas smaller than its box
    // leaves the box's own background showing as letterboxing around the grid
    const before = await gridState();
    expect(before.canvas_w).toBeGreaterThanOrEqual(before.box_w);
    expect(before.canvas_h).toBeGreaterThanOrEqual(before.box_h);
    expect(before.observing).toBe(true);

    // The dock is a fixed width, so drive the box the way a layout change would
    await page.evaluate(() => {
      window.engine.organism_editor.renderer.container.style.width = '480px';
    });
    await expect.poll(async () => (await gridState()).cols).not.toBe(before.cols);

    const after = await gridState();
    expect(after.canvas_w).toBeGreaterThanOrEqual(after.box_w);
    expect(after.canvas_h).toBeGreaterThanOrEqual(after.box_h);
    expect(after.cols % 2).toBe(1); // odd keeps the center cell centered

    // The observer holds the container, so unmounting the dock must detach it
    await openEditor(page); // close
    expect(await page.evaluate(() => !!window.engine.organism_editor.resize_observer)).toBe(false);
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

  test('Lifeforms modal lists living species and opens one in the lab', async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#lifeforms-stat').click();
    await expect(page.getByTestId('lifeforms-modal')).toBeVisible();

    const cards = page.locator('.lifeform-card');
    expect(await cards.count()).toBeGreaterThan(0);
    const cardName = await cards.first().locator('.lifeform-name').textContent();

    await cards.first().click();
    await expect(page.getByTestId('lifeforms-modal')).toBeHidden();
    await expect(page.getByTestId('editor-dock')).toBeVisible();
    await expect(page.locator('#species-name')).toHaveValue(cardName);
    await expect(page.locator('#edit-organism-details .cell-count')).toHaveText(/Cell count: [1-9]/);
  });

  test('Lifeforms list updates live as species appear and die', async ({ page }) => {
    await page.locator('#lifeforms-stat').click();
    await expect(page.getByTestId('lifeforms-modal')).toBeVisible();

    const cards = page.locator('.lifeform-card');
    const original = await cards.first().locator('.lifeform-name').textContent();
    expect(await cards.count()).toBeGreaterThan(0);

    // Wipe out all life. Auto-reset seeds a brand new species, so the list
    // should swap over on its own with the modal still open.
    await page.evaluate(() => {
      window.engine.start();
      window.engine.env.organisms.forEach(o => o.die());
    });

    await expect
      .poll(async () => cards.first().isVisible().then(v => (v ? cards.first().locator('.lifeform-name').textContent() : null)))
      .not.toBe(original);
  });

  test('A species that dies under the cursor is held in place, then pruned', async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#lifeforms-stat').click();
    const card = page.locator('.lifeform-card').first();
    await expect(card).toBeVisible();

    // Hover the grid, then kill everything: the card stays put so a click in
    // flight can't land on whatever would have shifted into its place
    await card.hover();
    await page.evaluate(() => {
      window.engine.env.organisms.forEach(o => o.die());
      window.engine.env.removeOrganisms([...window.engine.env.organisms.keys()]);
      window.engine.emitChange(true);
    });
    await expect(card).toHaveAttribute('data-extinct', 'true');
    await expect(card).toContainText('extinct');

    // Moving off the grid prunes it. Auto-reset seeds a fresh species in the
    // meantime, so assert on the extinct card rather than the total.
    await page.getByTestId('lifeforms-modal').getByText('LIFEFORMS', { exact: false }).hover();
    await expect(page.locator('.lifeform-card[data-extinct="true"]')).toHaveCount(0);
  });

  test('Right-click cancels select mode without picking', async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#tool-select').click();
    await expect(page.locator('#tool-select')).toHaveClass(/toolbarBtnActive/);

    await page.locator('#env-canvas').click({ button: 'right', position: { x: 300, y: 200 } });
    await expect(page.locator('#tool-select')).not.toHaveClass(/toolbarBtnActive/);
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });
});
