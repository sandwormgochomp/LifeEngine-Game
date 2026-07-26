const { test, expect, pauseEngine } = require('./helpers/fixtures');

// The world paint tools and one-shot terrain actions live in the always-on
// bottom-left palette. These used to sit behind the World Controls modal, which
// has since been folded into the palette (tools) and New Game (world setup).
test.describe('World tools palette', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Clicking the armed tool puts it away', async ({ page }) => {
    await page.locator('#wall').click();
    await expect(page.locator('#wall')).toHaveClass(/toolPaletteBtnActive/);

    await page.locator('#wall').click();
    await expect(page.locator('#wall')).not.toHaveClass(/toolPaletteBtnActive/);
    expect(await page.evaluate(() => window.engine.env.controller.mode)).toBe(0); // Modes.None
  });

  test('Clear Walls clears placed walls but never the petri dish', async ({ page }) => {
    // Place a user wall inside the dish so there's something to clear
    await page.locator('#wall').click();
    await page.locator('#env-canvas').click({ position: { x: 500, y: 400 } });

    // The dish glass is flagged cell-by-cell, so it splits from user walls
    const counts = () => page.evaluate(() => ({
      user: window.engine.env.grid_map.grid.flat()
        .filter(c => c.state.name.includes('wall') && !c.dish_glass).length,
      dish: window.engine.env.grid_map.grid.flat()
        .filter(c => c.state.name.includes('wall') && c.dish_glass).length,
    }));
    const before = await counts();
    expect(before.user).toBeGreaterThan(0);
    expect(before.dish).toBeGreaterThan(0);

    await page.locator('#clear-walls').click();

    const after = await counts();
    expect(after.user).toBe(0); // placed walls gone
    expect(after.dish).toBe(before.dish); // dish untouched
  });

  test('Clear Life removes every organism but keeps the walls', async ({ page }) => {
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBeGreaterThan(0);

    await page.locator('#tool-tab-life').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-life').click();

    const state = await page.evaluate(() => ({
      organisms: window.engine.env.organisms.length,
      walls: window.engine.env.grid_map.grid.flat().filter(c => c.state.name.includes('wall')).length,
    }));
    expect(state.organisms).toBe(0);
    expect(state.walls).toBeGreaterThan(0); // dish survives
  });

  test('Brush size slider drives the engine brush', async ({ page }) => {
    await page.locator('#brush-slider').fill('0');
    await page.locator('#food').click();

    // Sim is paused, so a brush of 0 changes exactly the clicked cell (5px cells)
    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    await page.locator('#env-canvas').click({ position: { x: 500, y: 400 } });

    const after = await page.evaluate(() => ({
      total: window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length,
      clicked: window.engine.env.grid_map.cellAt(100, 80).state.name,
    }));
    expect(after.clicked).toBe('food');
    expect(after.total - before).toBe(1);
  });

  test('Seed Life paints random organisms into the world', async ({ page }) => {
    // A wide brush scatters a few random organisms per click.
    await page.locator('#brush-slider').fill('15');
    await page.locator('#tool-tab-life').click();
    await page.locator('#seed-life').click();

    const before = await page.evaluate(() => window.engine.env.organisms.length);

    // A few clicks over open space reliably spawns life (each cell spawns
    // sparsely, so one click alone can draw a blank)
    const canvas = page.locator('#env-canvas');
    for (let i = 0; i < 4; i++)
      await canvas.click({ position: { x: 300, y: 200 } });

    const after = await page.evaluate(() => window.engine.env.organisms.length);
    expect(after).toBeGreaterThan(before);
  });

  test('Eraser clears placed food and walls', async ({ page }) => {
    const canvas = page.locator('#env-canvas');
    // The clicked cells only (5px cells): food elsewhere in the world -- laid
    // down by producers before the pause -- must not affect the assertions.
    const clicked = () => page.evaluate(() => ({
      food: window.engine.env.grid_map.cellAt(100, 80).state.name,
      wall: window.engine.env.grid_map.cellAt(120, 60).state.name,
    }));

    await page.locator('#food').click();
    await canvas.click({ position: { x: 500, y: 400 } });
    await page.locator('#wall').click();
    await canvas.click({ position: { x: 600, y: 300 } });

    const before = await clicked();
    expect(before.food).toBe('food');
    expect(before.wall).toBe('wall');

    await page.locator('#eraser').click();
    await canvas.click({ position: { x: 500, y: 400 } });
    await canvas.click({ position: { x: 600, y: 300 } });

    const after = await clicked();
    expect(after.food).toBe('empty');
    expect(after.wall).toBe('empty');
  });

  /* The brush reticle used to be painted straight onto the world canvas and
     un-painted the next frame by re-rendering every cell it had covered. It
     now has its own layer, so the life-form canvas must come out of a hover
     bit-for-bit unchanged. */
  test('The brush reticle paints its own layer, never the life-form canvas', async ({ page }) => {
    await page.locator('#brush-slider').fill('6');
    await page.locator('#wall').click();

    // Open water, well clear of the origin organism at the middle of the world:
    // a hovered organism highlights, which is a legitimate world-canvas write.
    const pos = { x: 300, y: 200 };
    /* Both layers are probed 20px off the pointer: inside the brush disc (6
       cells of 5px), but away from the single hovered cell, which the
       renderer's own hover highlight still paints onto the world canvas --
       a separate mechanism from this overlay. */
    const probe = { x: pos.x - 20, y: pos.y };

    // Checksum of the world canvas where the reticle is about to land
    const worldSample = () => page.evaluate(p => {
      const world = document.getElementById('env-canvas');
      const cr = world.getBoundingClientRect();
      const x = Math.round(p.x * world.width / cr.width);
      const y = Math.round(p.y * world.height / cr.height);
      const data = world.getContext('2d').getImageData(x - 8, y - 8, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum = (sum * 31 + data[i]) | 0;
      return sum;
    }, probe);

    const before = await worldSample();
    await page.locator('#env-canvas').hover({ position: pos });
    // Two frames: the overlay is drawn by the render loop, not the event
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    // The reticle is on its own layer...
    const painted = await page.evaluate(p => {
      const world = document.getElementById('env-canvas');
      const cursor = document.getElementById('env-cursor-canvas');
      const cr = world.getBoundingClientRect();
      const ur = cursor.getBoundingClientRect();
      const x = Math.round(cr.left + p.x - ur.left);
      const y = Math.round(cr.top + p.y - ur.top);
      const data = cursor.getContext('2d').getImageData(x - 8, y - 8, 16, 16).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      return lit;
    }, probe);
    expect(painted).toBeGreaterThan(0);

    // ...and the layer underneath it never saw it.
    expect(await worldSample()).toBe(before);
  });

  test('Right-click cancels every world tool', async ({ page }) => {
    const canvas = page.locator('#env-canvas');
    const tools = [
      { tab: null, id: 'food' },
      { tab: null, id: 'wall' },
      { tab: null, id: 'invincible-wall' },
      { tab: null, id: 'radiation-drop' },
      { tab: null, id: 'eraser' },
      { tab: '#tool-tab-life', id: 'tool-select' },
      { tab: '#tool-tab-life', id: 'seed-life' },
      { tab: '#tool-tab-life', id: 'kill' },
    ];
    for (const tool of tools) {
      if (tool.tab) await page.locator(tool.tab).click();
      await page.locator(`#${tool.id}`).click();
      await expect(page.locator(`#${tool.id}`)).toHaveClass(/toolPaletteBtnActive/);

      await canvas.click({ button: 'right', position: { x: 400, y: 300 } });
      expect(await page.evaluate(() => window.engine.env.controller.mode), tool.id).toBe(0);
      await expect(page.locator(`#${tool.id}`)).not.toHaveClass(/toolPaletteBtnActive/);
    }
  });

  test('Right-click no longer erases while a tool is armed', async ({ page }) => {
    const canvas = page.locator('#env-canvas');
    await page.locator('#food').click();
    await canvas.click({ position: { x: 500, y: 400 } });

    const before = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    expect(before).toBeGreaterThan(0);

    await canvas.click({ button: 'right', position: { x: 500, y: 400 } });

    const after = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    expect(after).toBe(before);
    expect(await page.evaluate(() => window.engine.env.controller.mode)).toBe(0);
  });
});
