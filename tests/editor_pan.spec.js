const { test, expect, openEditor, pauseEngine, clickEditorCell, localCellState } = require('./helpers/fixtures');

/* Panning the Organism Lab.

   The editor has no camera: the grid is sized to fit the canvas at the current
   cell size, so it *is* the viewport, and zooming in makes it fewer cells
   across rather than the same cells bigger. An organism larger than the grid
   therefore had cells that simply fell outside it, with no way to reach them --
   you could zoom in on a big body but never look at the far side.

   Panning moves where the body sits in the viewport. The part worth guarding
   is not the drag itself but the nine grid <-> organism-local conversions that
   used to assume the body was centred: if any one of them is left on
   getCenter(), editing lands on the wrong cell the moment you pan. */

// Middle-button drag across the editor canvas, in whole cells.
async function panBy(page, dc, dr) {
  const cs = await page.evaluate(() => window.engine.organism_editor.cell_size);
  const box = await page.locator('#editor-canvas').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x + dc * cs, y + dr * cs, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
}

const pan = page => page.evaluate(() => {
  const e = window.engine.organism_editor;
  return { c: e.pan_c, r: e.pan_r };
});

const originOnGrid = page => page.evaluate(
  () => window.engine.organism_editor.originOnGrid());

test.describe('Organism Lab panning', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
  });

  test('starts centred, with the body on the grid centre', async ({ page }) => {
    expect(await pan(page)).toEqual({ c: 0, r: 0 });
    const [origin, centre] = await page.evaluate(() => {
      const e = window.engine.organism_editor;
      return [e.originOnGrid(), e.grid_map.getCenter()];
    });
    expect(origin).toEqual(centre);
  });

  test('a middle-drag moves the body in the viewport', async ({ page }) => {
    const before = await originOnGrid(page);
    await panBy(page, 3, 2);

    const after = await originOnGrid(page);
    expect(after[0], 'the body follows the pointer').toBe(before[0] + 3);
    expect(after[1]).toBe(before[1] + 2);
    // And the organism itself really moved on the grid, not just the number.
    expect(await page.evaluate(() => {
      const o = window.engine.organism_editor.organism;
      return [o.c, o.r];
    })).toEqual(after);
  });

  /* The regression that matters. Nine call sites converted grid coordinates to
     organism-local ones through grid_map.getCenter(); any left behind puts the
     cell you painted somewhere other than where you clicked. */
  test('editing still lands on the clicked cell after panning', async ({ page }) => {
    await panBy(page, 4, -3);

    // clickEditorCell addresses cells relative to the organism's own centre,
    // so this is the same gesture as before the pan.
    await page.locator('.cell-type#killer').click();
    await clickEditorCell(page, 2, 1);
    expect(await localCellState(page, 2, 1), 'the cell lands where clicked').toBe('killer');

    // And the eraser reaches the same cell it did.
    await page.locator('#eraser-tool').click();
    await clickEditorCell(page, 2, 1);
    expect(await localCellState(page, 2, 1)).toBe(null);
  });

  test('the pan is clamped so the body cannot be lost off-grid', async ({ page }) => {
    // Far further than the grid is wide, in both directions.
    await panBy(page, 400, 400);
    const origin = await originOnGrid(page);
    const dims = await page.evaluate(() => {
      const g = window.engine.organism_editor.grid_map;
      return { cols: g.cols, rows: g.rows };
    });
    expect(origin[0]).toBeLessThanOrEqual(dims.cols - 1);
    expect(origin[1]).toBeLessThanOrEqual(dims.rows - 1);
    expect(origin[0]).toBeGreaterThanOrEqual(0);
    expect(origin[1]).toBeGreaterThanOrEqual(0);
  });

  test('fit-to-view brings a wandered body back', async ({ page }) => {
    await panBy(page, 5, 5);
    expect(await pan(page)).not.toEqual({ c: 0, r: 0 });

    await page.locator('#zoom-fit').click();
    expect(await pan(page), 'fit is the way back').toEqual({ c: 0, r: 0 });
  });

  test('a new organism arrives centred', async ({ page }) => {
    await panBy(page, 4, 4);
    await page.locator('#clear-editor').click();
    expect(await pan(page)).toEqual({ c: 0, r: 0 });
  });

  /* Every whole-organism path has to leave the body sitting *at* the origin,
     not merely somewhere. The random generator is the one that seats its
     organism itself, at the grid's true centre -- so a leftover pan put the
     origin where the body was not, and every click then edited a cell offset
     by the pan from the one under the cursor. */
  test('a random organism arrives centred, and on the origin', async ({ page }) => {
    await panBy(page, 4, 3);
    await page.locator('#random-btn').click();

    expect(await pan(page)).toEqual({ c: 0, r: 0 });
    expect(await page.evaluate(() => {
      const o = window.engine.organism_editor.organism;
      return [o.c, o.r];
    }), 'the body sits where the origin says').toEqual(await originOnGrid(page));
  });

  /* Undo is the same organism mid-edit, not a new one, so it must not yank the
     view back while you are working on a panned body. */
  test('undo keeps the pan', async ({ page }) => {
    await panBy(page, 3, 0);
    await page.locator('.cell-type#armor').click();
    await clickEditorCell(page, 1, 0);
    expect(await localCellState(page, 1, 0)).toBe('armor');

    await page.keyboard.press('Control+z');
    expect(await localCellState(page, 1, 0), 'the edit is undone').toBe(null);
    expect(await pan(page), 'but the view stayed put').toEqual({ c: 3, r: 0 });
  });

  /* Rotate and flip are a new edit, so they record -- but they are still the
     same organism, so like undo they turn it where it sits. The body must also
     really be re-seated at the panned origin, not just left with the pan
     number intact. */
  for (const [label, button] of [['rotate', '#rotate-btn'], ['flip', '#flip-btn']]) {
    test(`${label} keeps the pan`, async ({ page }) => {
      await page.locator('.cell-type#armor').click();
      await clickEditorCell(page, 1, 0);
      await panBy(page, 3, -2);

      await page.locator(button).click();
      expect(await pan(page), 'the view stayed put').toEqual({ c: 3, r: -2 });
      expect(await page.evaluate(() => {
        const o = window.engine.organism_editor.organism;
        return [o.c, o.r];
      }), 'and the body is still on the origin').toEqual(await originOnGrid(page));

      // The transform itself still happened: rotate sends (1,0) to (0,1),
      // flip to (-1,0).
      const moved = label === 'rotate' ? [0, 1] : [-1, 0];
      expect(await localCellState(page, moved[0], moved[1])).toBe('armor');
      expect(await localCellState(page, 1, 0)).toBe(null);
    });
  }

  test('panning does not enter the undo history', async ({ page }) => {
    // A pan that opened a stroke would leave an edit that changed nothing,
    // and the next ctrl+z would spend itself undoing the pan.
    await page.locator('.cell-type#armor').click();
    await clickEditorCell(page, 1, 0);
    await panBy(page, 2, 2);

    await page.keyboard.press('Control+z');
    expect(await localCellState(page, 1, 0), 'one undo reaches the real edit').toBe(null);
  });
});
