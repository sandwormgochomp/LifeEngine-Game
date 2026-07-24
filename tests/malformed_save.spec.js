const { test, expect, pauseEngine } = require('./helpers/fixtures');

// A save whose wall list points outside the grid it declares. Both load paths
// in the Worlds picker (its file picker and its bundled-world cards) validate
// only that `grid` and `organisms` exist, so a hand-edited or version-mismatched
// file reaches loadRaw intact.
const OUT_OF_RANGE_SAVE = {
  grid: {
    cols: 10,
    rows: 10,
    cell_size: 5,
    food: [],
    walls: [{ c: 999, r: 999 }],
  },
  organisms: [],
  fossil_record: { species: {} },
  total_ticks: 0,
};

test.describe('Malformed save handling', () => {
  // Regression: loadRaw pushed grid_map.cellAt(wall.c, wall.r) into this.walls
  // with no null check, unlike every other wall-writing path in the engine
  // (randomizeWalls and dropCellType both guard). An out-of-range coordinate
  // put a null in the array, and the crash surfaced later and elsewhere -- in
  // clearWalls, which dereferences wall.col.
  test('a wall outside the grid does not poison clearWalls', async ({ page }) => {
    await pauseEngine(page);

    const loadError = await page.evaluate((save) => {
      try {
        window.engine.env.loadRaw(save);
        return null;
      } catch (e) {
        return String(e);
      }
    }, OUT_OF_RANGE_SAVE);
    expect(loadError).toBeNull();

    // The out-of-range entry must not have been recorded at all.
    const wallStats = await page.evaluate(() => ({
      total: window.engine.env.walls.length,
      nulls: window.engine.env.walls.filter(w => w == null).length,
    }));
    expect(wallStats.nulls).toBe(0);

    // Where it used to throw: TypeError reading 'col' of null.
    const clearError = await page.evaluate(() => {
      try {
        window.engine.env.clearWalls();
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(clearError).toBeNull();
  });

  // Randomize Walls calls clearWalls() first, so it hits the same poisoned
  // array by a different route -- and this one is a single button click.
  test('randomize walls survives a poisoned wall list', async ({ page }) => {
    await pauseEngine(page);
    await page.evaluate((save) => window.engine.env.loadRaw(save), OUT_OF_RANGE_SAVE);

    const error = await page.evaluate(() => {
      try {
        window.engine.env.controller.randomizeWalls();
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toBeNull();
  });

  // The guard must reject only the genuinely out-of-bounds entries. A grid
  // large enough that the petri dish does not swallow it, with the walls near
  // the centre so they land inside the dish rather than on its glass.
  test('in-range walls survive alongside an out-of-range one', async ({ page }) => {
    await pauseEngine(page);

    await page.evaluate(() => window.engine.env.loadRaw({
      grid: {
        cols: 60, rows: 60, cell_size: 5, food: [],
        walls: [{ c: 30, r: 30 }, { c: 31, r: 31 }, { c: 999, r: 999 }],
      },
      organisms: [],
      fossil_record: { species: {} },
      total_ticks: 0,
    }));

    const loaded = await page.evaluate(() => {
      const gm = window.engine.env.grid_map;
      return {
        at30: gm.cellAt(30, 30)?.state.name,
        at31: gm.cellAt(31, 31)?.state.name,
        nulls: window.engine.env.walls.filter(w => w == null).length,
      };
    });

    expect(loaded.at30).toBe('wall');
    expect(loaded.at31).toBe('wall');
    expect(loaded.nulls).toBe(0);

    await page.evaluate(() => window.engine.env.clearWalls());

    const cleared = await page.evaluate(() => {
      const gm = window.engine.env.grid_map;
      return [gm.cellAt(30, 30)?.state.name, gm.cellAt(31, 31)?.state.name];
    });
    expect(cleared).toEqual(['empty', 'empty']);
  });
});
