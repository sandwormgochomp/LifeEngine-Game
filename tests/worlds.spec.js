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

async function openWorldsModal(page) {
  await openPanel(page, 'save');
  // The save popup stays open behind the modal, so a second visit to the
  // picker within one test must not toggle it shut
  if (!(await page.locator('#browse-worlds-btn').isVisible())) await openPanel(page, 'save');
  await page.locator('#browse-worlds-btn').click();
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
    await openPanel(page, 'save');
    await page.locator('#browse-worlds-btn').click();
    await expect(page.getByTestId('worlds-modal')).toBeVisible();
  });

  test('Lists the bundled worlds', async ({ page }) => {
    expect(await page.locator('.world-card').count()).toBeGreaterThan(5);
    await expect(page.locator('.world-card[data-world="SurvivalOfFittest"]')).toBeVisible();
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
    await openPanel(page, 'save'); // close save popup
    await page.locator('#tool-rules').click();
    await page.locator('#lookRange').fill('11');
    await page.keyboard.press('Escape');

    await openPanel(page, 'save');
    await page.locator('#browse-worlds-btn').click();
    await page.locator('#override-controls').uncheck();
    await page.locator('.world-card[data-world="SurvivalOfFittest"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden();

    await page.locator('#tool-rules').click();
    await expect(page.locator('#lookRange')).toHaveValue('11');
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
