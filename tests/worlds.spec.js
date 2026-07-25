const fs = require('fs');
const path = require('path');
const { test, expect, openPanel, pauseEngine } = require('./helpers/fixtures');

const WORLDS_DIR = path.join(__dirname, '..', 'public', 'assets', 'worlds');
const worldList = JSON.parse(fs.readFileSync(path.join(WORLDS_DIR, '_list.json'), 'utf8'));

// What a bundled save declares, read straight from its JSON on disk
function savedWorld(value) {
  const raw = JSON.parse(fs.readFileSync(path.join(WORLDS_DIR, `${value}.json`), 'utf8'));
  return {
    cols: Number(raw.grid.cols),
    rows: Number(raw.grid.rows),
    organisms: raw.organisms.length,
    walls: raw.grid.walls.length,
  };
}

// What actually made it into the live grid. invincible_wall and dish_glass
// can only come from buildPetriDish (GridMap.serialize never stores either),
// so any non-zero count means the dish was stamped over the loaded world.
async function loadedWorld(page) {
  return await page.evaluate(() => {
    const env = window.engine.env;
    let glass = 0, invincible = 0, walls = 0;
    for (const col of env.grid_map.grid) {
      for (const cell of col) {
        if (cell.dish_glass) glass++;
        if (cell.state.name === 'invincible_wall') invincible++;
        else if (cell.state.name === 'wall') walls++;
      }
    }
    return {
      cols: env.grid_map.cols,
      rows: env.grid_map.rows,
      organisms: env.organisms.filter(o => o.living).length,
      glass, invincible, walls,
    };
  });
}

// The toolbar's WORLDS button is the picker: it toggles the modal directly
async function openWorldsModal(page) {
  await openPanel(page, 'save');
  await expect(page.getByTestId('worlds-modal')).toBeVisible();
}

async function loadWorld(page, value) {
  await page.locator(`.world-card[data-world="${value}"]`).click();
  // The largest bundled grids (High Def Sweepers is 2048x1041) take a few
  // seconds to rebuild, and the modal only closes once the load lands
  await expect(page.getByTestId('worlds-modal')).toBeHidden({ timeout: 15000 });
}

test.describe('Worlds picker', () => {
  test.beforeEach(async ({ page }) => {
    await openWorldsModal(page);
  });

  test('Lists the bundled worlds with their grid size', async ({ page }) => {
    expect(await page.locator('.world-card').count()).toBe(worldList.length);
    const card = page.locator('.world-card[data-world="SurvivalOfFittest"]');
    await expect(card).toBeVisible();
    // The size is on the card so a multi-second load is never a surprise
    await expect(card).toContainText('385×217');
  });

  /* The minimaps are painted at build time by scripts/generate-world-thumbs.mjs
     -- see the thumbnail suite at the bottom of this file for what's in them.
     Here: every card actually resolves its image, so a world added to
     _list.json without a regenerated thumbnail is caught. */
  test('Every world tile shows its generated minimap', async ({ page }) => {
    for (const { value } of worldList) {
      const img = page.locator(`.world-card[data-world="${value}"] img`);
      await expect(img).toHaveJSProperty('complete', true);
      expect(await img.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test('Loading a world replaces the grid and applies its saved controls', async ({ page }) => {
    await page.evaluate(() => { window.Hyperparams_probe = null; });

    await page.locator('.world-card[data-world="SurvivalOfFittest"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    // The save is 385x217 at cell size 4, unlike the default window-filled grid
    const grid = await page.evaluate(() => ({
      cols: window.engine.env.grid_map.cols,
      rows: window.engine.env.grid_map.rows,
      cell: window.engine.env.grid_map.cell_size,
      organisms: window.engine.env.organisms.length,
    }));
    expect(grid.cols).toBe(385);
    expect(grid.rows).toBe(217);
    expect(grid.cell).toBe(4);
    expect(grid.organisms).toBeGreaterThan(0);
  });

  test('Unchecking override keeps the current evolution controls', async ({ page }) => {
    // Set a distinctive value, then load with override off
    await page.keyboard.press('Escape');
    await page.locator('#tool-rules').click();
    await page.locator('#evo-tab-manual').click();
    await page.locator('#lookRange').fill('11');
    await page.keyboard.press('Escape');

    await openWorldsModal(page);
    await page.locator('#override-controls').uncheck();
    await page.locator('.world-card[data-world="SurvivalOfFittest"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    await page.locator('#tool-rules').click();
    await page.locator('#evo-tab-manual').click();
    await expect(page.locator('#lookRange')).toHaveValue('11');
  });

  /* A world takes seconds to fetch and rebuild. The load used to run to
     completion regardless, so backing out of the picker mid-fetch still
     replaced the world -- seconds after the modal had gone. */
  test('Closing mid-load abandons the fetch and freezes the other cards', async ({ page }) => {
    await pauseEngine(page);
    const before = await page.evaluate(() => ({
      cols: window.engine.env.grid_map.cols,
      rows: window.engine.env.grid_map.rows,
    }));

    // Hold the response open so the click sits in its loading state
    await page.route('**/assets/worlds/colony.json', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    const colony = page.locator('.world-card[data-world="colony"]');
    await colony.click();
    await expect(colony).toContainText('loading…');
    // The rest go dead rather than looking clickable while they no-op
    await expect(page.locator('.world-card[data-world="huggers"]')).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    // Well past the point the held response lands
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => ({
      cols: window.engine.env.grid_map.cols,
      rows: window.engine.env.grid_map.rows,
    }))).toEqual(before);
  });

  test('A failed world list says so instead of loading forever', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.route('**/assets/worlds/_list.json', route => route.abort());
    await openWorldsModal(page);
    await expect(page.getByTestId('worlds-modal')).toContainText('Could not load the world list');
  });
});

/* Worlds the user saves into localStorage. The index (names, sizes and
   thumbnails) is stored apart from the worlds themselves, so the picker can
   list them without parsing megabytes of grid on every open. */
test.describe('Worlds saved in the browser', () => {
  const savedCard = (page, name) => page.locator(`.saved-world-card[data-saved-world="${name}"]`);

  async function saveWorld(page, name) {
    await page.locator('#save-browser-btn').click();
    await page.locator('#save-world-name').fill(name);
    await page.locator('#save-world-confirm-btn').click();
    await expect(savedCard(page, name)).toBeVisible();
  }

  test('Saving names the world and lists it with a thumbnail', async ({ page }) => {
    await pauseEngine(page);
    await openWorldsModal(page);
    // Colony has a grid size distinct from the default, and enough life in it
    // to tell its minimap apart from an empty one
    await loadWorld(page, 'colony');
    await openWorldsModal(page);
    await saveWorld(page, 'Colony Fork');

    const card = savedCard(page, 'Colony Fork');
    await expect(card).toContainText('Colony Fork');
    await expect(card).toContainText('140×140');
    // Bundled worlds are untouched and still counted alongside it
    expect(await page.locator('.world-card').count()).toBe(worldList.length);

    /* The tile is a minimap, painted by the same WorldMinimap the build runs
       over the bundled worlds -- so it must come out at colony's own size,
       one pixel per cell at 140x140 (under the 352x224 box, never upscaled). */
    const img = card.locator('img');
    await expect(img).toHaveJSProperty('complete', true);
    expect(await img.evaluate(el => [el.naturalWidth, el.naturalHeight])).toEqual([140, 140]);

    // The thumb rides in the index, not the world blob: listing must not
    // depend on reading the (multi-hundred-KB) world back
    const index = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('life_engine.worlds.index')));
    expect(index).toHaveLength(1);
    expect(index[0].name).toBe('Colony Fork');
    expect(index[0].thumb).toMatch(/^data:image\/png;base64,/);
  });

  /* The generator and the picker paint from the same serialized world through
     the same module, so a bundled world saved straight back must come out
     pixel-identical to the PNG the build wrote for it. This is the check that
     fails if the two halves ever drift apart.

     Pixels, not bytes: the two encoders are different (Node's zlib against the
     browser's canvas), so the files never match even when the images do. */
  /* The dish is never in the save's wall list -- its glass is invincible_wall,
     which GridMap.serialize() skips -- so the minimap has to rebuild the
     circle from the petri_dish flag alone. Without that, every world saved
     from a dish session was pictured as the bare rectangle underneath it. */
  test.describe('The petri dish in a saved minimap', () => {
    // Counts of the two colours that tell a dish apart: the glass rim, and the
    // empty/page colour the void outside it takes.
    async function dishPixels(page) {
      return await page.evaluate(async () => {
        const url = JSON.parse(localStorage.getItem('life_engine.worlds.index'))[0].thumb;
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        const at = (x, y) => {
          const o = (y * bitmap.width + x) * 4;
          return `${data[o]},${data[o + 1]},${data[o + 2]}`;
        };
        let glass = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === 94 && data[i + 1] === 147 && data[i + 2] === 163) glass++;
        }
        return {
          glass,
          corner: at(0, 0),
          centre: at(bitmap.width >> 1, bitmap.height >> 1),
        };
      });
    }

    test('A dish world is pictured with its dish', async ({ page }) => {
      await pauseEngine(page);
      await openWorldsModal(page);
      // The default world starts inside the dish
      await saveWorld(page, 'Dish World');

      const px = await dishPixels(page);
      // #5E93A3 is invincible_wall: the rim is drawn, and drawn as a ring
      expect(px.glass).toBeGreaterThan(0);
      // The void outside takes the empty colour the page behind it has, and
      // the middle of the dish is world rather than glass
      expect(px.corner).toBe('14,19,24');
      expect(px.centre).not.toBe('94,147,163');
    });

    test('A rectangular world is not', async ({ page }) => {
      await pauseEngine(page);
      await openWorldsModal(page);
      // colony predates the dish and carries no flag
      await loadWorld(page, 'colony');
      await openWorldsModal(page);
      await saveWorld(page, 'Colony Rect');

      expect((await dishPixels(page)).glass).toBe(0);
    });
  });

  test('A saved world paints the same minimap the build does', async ({ page }) => {
    await pauseEngine(page);
    await openWorldsModal(page);
    await loadWorld(page, 'colony');
    await openWorldsModal(page);
    await saveWorld(page, 'Colony Copy');

    const result = await page.evaluate(async () => {
      const pixels = async src => {
        const bitmap = await createImageBitmap(await (await fetch(src)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        return { w: bitmap.width, h: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
      };
      const saved = await pixels(JSON.parse(localStorage.getItem('life_engine.worlds.index'))[0].thumb);
      const built = await pixels('assets/worlds/thumbs/colony.png');
      if (saved.w !== built.w || saved.h !== built.h) {
        return { size: `${saved.w}x${saved.h} vs ${built.w}x${built.h}`, differing: -1 };
      }
      let differing = 0;
      for (let i = 0; i < saved.data.length; i++) if (saved.data[i] !== built.data[i]) differing++;
      return { size: `${saved.w}x${saved.h}`, differing };
    });

    expect(result).toEqual({ size: '140x140', differing: 0 });
  });

  test('A saved world reloads its grid, and survives a page reload', async ({ page }) => {
    await pauseEngine(page);
    await openWorldsModal(page);
    await loadWorld(page, 'colony');
    await openWorldsModal(page);
    await saveWorld(page, 'Colony Fork');

    // Move the world somewhere else entirely
    await page.keyboard.press('Escape');
    await openWorldsModal(page);
    await loadWorld(page, 'SurvivalOfFittest');
    expect(await page.evaluate(() => window.engine.env.grid_map.cols)).toBe(385);

    // A fresh page proves the save outlived the session
    await page.reload();
    await pauseEngine(page);
    await openWorldsModal(page);
    await savedCard(page, 'Colony Fork').locator('.saved-world-load').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    const grid = await page.evaluate(() => ({
      cols: window.engine.env.grid_map.cols,
      rows: window.engine.env.grid_map.rows,
      organisms: window.engine.env.organisms.filter(o => o.living).length,
    }));
    expect(grid.cols).toBe(140);
    expect(grid.rows).toBe(140);
    expect(grid.organisms).toBeGreaterThan(0);
  });

  // Escape has to back out one layer, as it does everywhere else in the HUD
  test('Escape in the name field cancels the save, not the picker', async ({ page }) => {
    await openWorldsModal(page);
    await page.locator('#save-browser-btn').click();
    await page.locator('#save-world-name').press('Escape');

    await expect(page.getByTestId('worlds-modal')).toBeVisible();
    await expect(page.locator('#save-world-name')).toBeHidden();
    await expect(page.locator('#save-browser-btn')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('life_engine.worlds.index'))).toBeNull();

    // And a second Escape does close the picker
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('worlds-modal')).toBeHidden();
  });

  test('Deleting asks first, then drops the world and its data', async ({ page }) => {
    await openWorldsModal(page);
    await saveWorld(page, 'Doomed');

    // Arming the trash asks rather than acting
    await savedCard(page, 'Doomed').locator('.saved-world-delete').click();
    await expect(savedCard(page, 'Doomed')).toContainText('Delete?');
    expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(1);

    await savedCard(page, 'Doomed').locator('.saved-world-delete-confirm').click();
    await expect(savedCard(page, 'Doomed')).toBeHidden();

    // Gone from the index and from storage, not merely from this render
    await page.keyboard.press('Escape');
    await openWorldsModal(page);
    await expect(savedCard(page, 'Doomed')).toBeHidden();
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('life_engine.world.')));
    expect(keys).toEqual([]);
  });

  /* localStorage tops out near 5MB, which is less than several of the bundled
     worlds serialize to, so a full quota is a normal outcome here. */
  test('A world too big for storage says so and leaves nothing behind', async ({ page }) => {
    await openWorldsModal(page);
    // Eat the quota down to scraps. The chunk sizes step down so the slack
    // left over is smaller than even the default world's save.
    await page.evaluate(() => {
      let i = 0;
      for (const size of [256 * 1024, 8 * 1024, 256, 16]) {
        const chunk = 'x'.repeat(size);
        for (;;) {
          try { localStorage.setItem(`filler.${i++}`, chunk); } catch { break; }
        }
      }
    });

    await page.locator('#save-browser-btn').click();
    await page.locator('#save-world-name').fill('Too Big');
    await page.locator('#save-world-confirm-btn').click();

    await expect(page.getByTestId('hud-notifications')).toContainText('Too big for browser storage');
    await expect(savedCard(page, 'Too Big')).toBeHidden();
    // No half-written world left orphaned by the failed save
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('life_engine.')));
    expect(keys).toEqual([]);
  });
});

/* The bundled worlds are rectangular designs that predate the petri dish.
   Loading one used to stamp the session's dish over it -- glassing over the
   layout and killing every organism outside the circle -- so each world is
   checked cell-for-cell against the space its save declares. */
test.describe('Bundled worlds load into their designed space', () => {
  for (const { name, value } of worldList) {
    test(`${name} loads intact`, async ({ page }) => {
      test.slow(); // the biggest grids need more than the 15s default
      // Pause first so no ticks run between load and inspection
      await pauseEngine(page);
      await openWorldsModal(page);
      await loadWorld(page, value);

      const saved = savedWorld(value);
      const loaded = await loadedWorld(page);
      expect(loaded.cols).toBe(saved.cols);
      expect(loaded.rows).toBe(saved.rows);
      // Every saved organism survives the load alive
      expect(loaded.organisms).toBe(saved.organisms);
      // Every saved wall landed, and nothing added any
      expect(loaded.walls).toBe(saved.walls);
      // No petri dish was stamped over the rectangular design
      expect(loaded.glass).toBe(0);
      expect(loaded.invincible).toBe(0);
    });
  }
});

/* The camera used to survive a world load: pan is in screen px and the canvas
   is re-sized to the incoming grid, so a pan that framed the outgoing world
   either carried the new (smaller) canvas clean off screen, or -- on a world
   big enough to render culled to the view -- left every cell flagged off
   screen and nothing painted at all. Both read as "the world didn't load". */
test.describe('Loading a world reframes it', () => {
  // Fraction of sample points inside the on-screen part of the world canvas
  // that got painted. A never-drawn region is transparent black, so alpha is
  // the signal; even an empty cell paints an opaque backdrop.
  async function paintedFraction(page) {
    return await page.evaluate(() => {
      const canvas = document.getElementById('env-canvas');
      const cont = document.getElementById('env');
      const cr = canvas.getBoundingClientRect();
      const vr = cont.getBoundingClientRect();
      const l = Math.max(cr.left, vr.left), r = Math.min(cr.right, vr.right);
      const t = Math.max(cr.top, vr.top), b = Math.min(cr.bottom, vr.bottom);
      if (r <= l || b <= t) return 0; // canvas entirely off screen
      const sx = canvas.width / cr.width, sy = canvas.height / cr.height;
      const ctx = canvas.getContext('2d');
      let painted = 0, total = 0;
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 20; j++) {
          const x = Math.floor(((l - cr.left) + (r - l) * (i + 0.5) / 20) * sx);
          const y = Math.floor(((t - cr.top) + (b - t) * (j + 0.5) / 20) * sy);
          total++;
          if (ctx.getImageData(x, y, 1, 1).data[3] > 0) painted++;
        }
      }
      return painted / total;
    });
  }

  // colony (140x140) renders in full; battleground (575x325) is over the
  // renderer's cull threshold, so it paints the view and defers the rest --
  // the two loads exercise both halves of renderFullGrid.
  for (const [first, second] of [['SurvivalOfFittest', 'colony'], ['colony', 'battleground']]) {
    test(`${second} is on screen after panning around ${first}`, async ({ page }) => {
      test.slow();
      await pauseEngine(page);
      await openWorldsModal(page);
      await loadWorld(page, first);

      // Pan far, as a user exploring the first world would
      await page.evaluate(() => {
        const ctl = window.engine.env.controller;
        ctl.pan_x = -2200;
        ctl.pan_y = -700;
        ctl.applyView();
      });

      await openWorldsModal(page);
      await loadWorld(page, second);

      expect(await paintedFraction(page)).toBe(1);
    });
  }
});

test.describe('World shape round-trip', () => {
  test('A petri-dish world keeps its dish through save and load', async ({ page }) => {
    await pauseEngine(page);
    // The default world starts inside the dish
    const before = await loadedWorld(page);
    expect(before.glass).toBeGreaterThan(0);

    // JSON round-trip mirrors what Download/Load World does with the file
    await page.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.engine.env.serialize()));
      window.engine.env.loadRaw(raw);
    });

    const after = await loadedWorld(page);
    expect(after.glass).toBe(before.glass);
    expect(after.organisms).toBe(before.organisms);
  });

  test('A rectangular world stays rectangular through save and load', async ({ page }) => {
    await pauseEngine(page);
    await openWorldsModal(page);
    await loadWorld(page, 'colony');
    expect((await loadedWorld(page)).glass).toBe(0);

    await page.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.engine.env.serialize()));
      window.engine.env.loadRaw(raw);
    });

    const after = await loadedWorld(page);
    expect(after.glass).toBe(0);
    expect(after.invincible).toBe(0);
  });
});

/* The build paints a minimap per bundled world (scripts/generate-world-thumbs.mjs).
   These checks read the PNGs off disk rather than through the page: a world
   added to _list.json without a regenerated thumbnail, or a generator that
   stops writing valid files, fails here rather than shipping a picker full of
   fallback globes. */
test.describe('Generated world thumbnails', () => {
  const THUMBS_DIR = path.join(WORLDS_DIR, 'thumbs');
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Width and height live in the IHDR chunk, which PNG pins at bytes 16..24
  function readPng(value) {
    const buf = fs.readFileSync(path.join(THUMBS_DIR, `${value}.png`));
    return {
      magic: buf.subarray(0, 8),
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      bytes: buf.length,
    };
  }

  for (const { name, value } of worldList) {
    test(`${name} has a minimap matching its grid`, () => {
      const png = readPng(value);
      expect(png.magic.equals(PNG_MAGIC)).toBe(true);
      expect(png.bytes).toBeGreaterThan(0);

      // Fits the tile's box, and is never upscaled past one pixel per cell
      const world = savedWorld(value);
      expect(png.width).toBeLessThanOrEqual(352);
      expect(png.height).toBeLessThanOrEqual(224);
      expect(png.width).toBeLessThanOrEqual(world.cols);
      expect(png.height).toBeLessThanOrEqual(world.rows);

      // Aspect ratio survives the downscale (one pixel of rounding either way)
      expect(png.width / png.height).toBeCloseTo(world.cols / world.rows, 1);
    });
  }

  test('Every bundled world has one, and there are no orphans', () => {
    const files = fs.readdirSync(THUMBS_DIR).filter(f => f.endsWith('.png')).sort();
    expect(files).toEqual(worldList.map(w => `${w.value}.png`).sort());
  });
});
