const { test, expect, openEditor, loadPreset, pauseEngine, clickEditorCell, expectCellCount, localCellState } = require('./helpers/fixtures');


const localCellColor = (page, dc, dr) => page.evaluate(([dc, dr]) => {
  return window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr)?.custom_color ?? null;
}, [dc, dr]);

const eyeDirection = (page, dc, dr) => page.evaluate(([dc, dr]) => {
  return window.engine.organism_editor.organism.anatomy.getLocalCell(dc, dr)?.direction ?? null;
}, [dc, dr]);

// Pixels actually painted around the editor cell at (dc, dr), as a comparable
// string. The eye decoration overflows its cell, so the sampled box is padded.
const renderedCellPixels = (page, dc, dr) => page.evaluate(([dc, dr]) => {
  const editor = window.engine.organism_editor;
  const [cc, cr] = editor.grid_map.getCenter();
  const cs = editor.grid_map.cell_size;
  const ctx = editor.renderer.canvas.getContext('2d');
  const data = ctx.getImageData((cc + dc) * cs - cs, (cr + dr) * cs - cs, cs * 3, cs * 3).data;
  return Array.from(data).join(',');
}, [dc, dr]);

test.describe('Organism Lab dock', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
  });

  test('Opens ready to draw, and picking a cell type disarms Paint', async ({ page }) => {
    // A default cell type is pre-selected: no mode fiddling needed
    await expect(page.locator('.cell-type#common')).toHaveClass(/dockCellBtnActive/);

    await clickEditorCell(page, 1, 0);
    await expectCellCount(page, 2);
    expect(await localCellState(page, 1, 0)).toBe('common');

    // Choosing a cell type while Paint is armed switches back to drawing
    // (the span dodges the color input, whose click opens the native picker)
    await page.locator('#paint-tool span').click();
    await expect(page.locator('#paint-tool')).toHaveClass(/dockCellBtnActive/);
    await page.locator('.cell-type#producer').click();
    await expect(page.locator('#paint-tool')).not.toHaveClass(/dockCellBtnActive/);
    await expect(page.locator('.cell-type#producer')).toHaveClass(/dockCellBtnActive/);
  });

  test('Right-click erases, and the center cell is protected', async ({ page }) => {
    await clickEditorCell(page, 1, 0);
    await clickEditorCell(page, 2, 0);
    await expectCellCount(page, 3);

    // Right-click erases without disturbing the armed cell type
    await clickEditorCell(page, 1, 0, 'right');
    await expectCellCount(page, 2);
    await clickEditorCell(page, 2, 0, 'right');
    await expectCellCount(page, 1);
    await expect(page.locator('.cell-type#common')).toHaveClass(/dockCellBtnActive/);

    // The center cell refuses removal with a toast
    await clickEditorCell(page, 0, 0, 'right');
    await expect(page.getByTestId('hud-notifications')).toContainText('Cannot remove center cell');
    await expectCellCount(page, 1);
  });

  test('Paint tool recolors a cell', async ({ page }) => {
    await clickEditorCell(page, 1, 0);

    // Picking a color arms Paint by itself
    await page.locator('#cell-color-picker').fill('#123456');
    await expect(page.locator('#paint-tool')).toHaveClass(/dockCellBtnActive/);
    await clickEditorCell(page, 1, 0);

    expect(await localCellColor(page, 1, 0)).toBe('#123456');
  });

  test('Undo and redo walk the edit history', async ({ page }) => {
    // Undo with an empty history is a no-op
    await page.keyboard.press('Control+z');
    await expectCellCount(page, 1);

    await clickEditorCell(page, 1, 0);
    await clickEditorCell(page, 0, 1);
    await expectCellCount(page, 3);

    await page.keyboard.press('Control+z');
    await expectCellCount(page, 2);

    await page.keyboard.press('Control+z');
    await expectCellCount(page, 1);

    await page.keyboard.press('Control+y');
    await expectCellCount(page, 2);

    // Shift+Ctrl+Z redoes as well
    await page.keyboard.press('Control+z');
    await expectCellCount(page, 1);
    await page.keyboard.press('Control+Shift+z');
    await expectCellCount(page, 2);
  });

  test('Rotate and flip transform the anatomy, eyes included', async ({ page }) => {
    await page.locator('.cell-type#eye').click();
    await clickEditorCell(page, 0, -1);
    expect(await eyeDirection(page, 0, -1)).toBe(0); // up

    // Clicking a placed eye rotates it in place instead of replacing it
    await clickEditorCell(page, 0, -1);
    expect(await eyeDirection(page, 0, -1)).toBe(1); // right
    await expectCellCount(page, 2);

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
    await page.keyboard.press('Control+z');
    expect(await localCellState(page, 1, 0)).toBe('eye');
  });

  /* The decoration renderer caches a sprite per organism, keyed on an anatomy
     hash. Rotating an eye changes only the cell's `direction`, so a hash that
     leaves it out keeps serving the old sprite and the pupil never moves --
     the anatomy is right and the picture is stale. Assert on pixels, since
     eyeDirection() above passes either way. */
  test('Rotating an eye repaints its pupil', async ({ page }) => {
    await page.locator('.cell-type#eye').click();
    await clickEditorCell(page, 0, -1);

    const seen = new Set();
    for (const expected of [1, 2, 3, 0]) { // right, down, left, back to up
      seen.add(await renderedCellPixels(page, 0, -1));
      await clickEditorCell(page, 0, -1);
      expect(await eyeDirection(page, 0, -1)).toBe(expected);
    }

    // Four distinct facings must have produced four distinct renders
    expect(seen.size).toBe(4);
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

    // Ability badges float over the editor canvas
    await expect(page.locator('#editor-env')).toContainText('EATS');
    await page.locator('.cell-type#mover').click();
    await clickEditorCell(page, 1, 0);
    await expect(page.locator('#editor-env')).toContainText('MOVES');

    // The chosen name survives edits
    await expect(page.locator('#species-name')).toHaveValue('Testosaurus');
    const name = await page.evaluate(() => window.engine.organism_editor.organism.species.name);
    expect(name).toBe('Testosaurus');
  });

  test('The giant Bob preset loads without freezing and stays editable', async ({ page }) => {
    // Bob is ~10k cells; loading used to hard-freeze the tab (O(n²) anatomy rebuild)
    const start = Date.now();
    await loadPreset(page, 'Bob');
    await expectCellCount(page, 10783);
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
    await expectCellCount(page, 5);
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
    await expectCellCount(page, 2);

    await openEditor(page); // close
    await expect(page.locator('#editor-canvas')).toBeHidden();
    await openEditor(page); // reopen: fresh canvas is bound
    await expectCellCount(page, 2);

    // Tool and cell type selection live on the engine and survive the remount
    await expect(page.locator('.cell-type#producer')).toHaveClass(/dockCellBtnActive/);
    await clickEditorCell(page, -1, 0);
    await expectCellCount(page, 3);
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

    // Arm select from the always-on tool palette (no popup panel)
    await page.locator('#tool-select').click();
    await expect(page.locator('#tool-select')).toHaveClass(/toolPaletteBtnActive/);
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
    // The tool stays armed so successive clicks keep sampling; right-click,
    // Escape or re-clicking the palette button put it away.
    await expect(page.locator('#tool-select')).toHaveClass(/toolPaletteBtnActive/);

    const counts = await page.evaluate(() => ({
      world: window.engine.env.organisms[0].anatomy.cells.length,
      editor: window.engine.organism_editor.organism.anatomy.cells.length,
    }));
    expect(counts.editor).toBe(counts.world);
  });

  test('Unarmed left-click samples an organism into the lab', async ({ page }) => {
    await pauseEngine(page);

    // The world boots unarmed: no tool highlighted, mode is None
    expect(await page.evaluate(() => window.engine.env.controller.mode)).toBe(0);
    await expect(page.locator('[class*="toolPaletteBtnActive"]')).toHaveCount(0);

    // Clicking empty ground (no organism within brush radius) does nothing.
    // Scan only the vertically-middle band of the grid so the chosen point
    // isn't covered by the top/bottom HUD overlays, which intercept clicks.
    const emptyPos = await page.evaluate(() => {
      const env = window.engine.env;
      const cs = env.grid_map.cell_size;
      const radius = 20; // comfortably beyond any brush size
      const mid = Math.floor(env.num_rows / 2);
      const band = Math.floor(env.num_rows / 6);
      for (let r = mid - band; r < mid + band; r++) {
        for (let c = 2; c < env.num_cols - 2; c++) {
          if (env.organisms.every(o => Math.abs(o.c - c) + Math.abs(o.r - r) > radius))
            return { x: c * cs + cs / 2, y: r * cs + cs / 2 };
        }
      }
      return null;
    });
    expect(emptyPos).not.toBeNull();
    await page.locator('#env-canvas').click({ position: emptyPos });
    await expect(page.getByTestId('editor-dock')).toBeHidden();

    // Clicking a living organism samples it, exactly like the Select tool
    const pos = await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      const cs = env.grid_map.cell_size;
      return { x: org.c * cs + cs / 2, y: org.r * cs + cs / 2 };
    });
    await page.locator('#env-canvas').click({ position: pos });

    await expect(page.getByTestId('editor-dock')).toBeVisible();
    // Sampling is the ambient default, not the Sample tool: nothing arms
    await expect(page.locator('[class*="toolPaletteBtnActive"]')).toHaveCount(0);

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
    await expect.poll(() =>
      page.evaluate(() => window.engine.organism_editor.organism.anatomy.cells.length)
    ).toBeGreaterThan(0);
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
    await expect(page.locator('#tool-select')).toHaveClass(/toolPaletteBtnActive/);

    await page.locator('#env-canvas').click({ button: 'right', position: { x: 300, y: 200 } });
    await expect(page.locator('#tool-select')).not.toHaveClass(/toolPaletteBtnActive/);
    await expect(page.getByTestId('editor-dock')).toBeHidden();
  });
});
