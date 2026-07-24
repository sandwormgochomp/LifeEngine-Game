const { test, expect, openPanel, pauseEngine } = require('./helpers/fixtures');

/* GridMap maintains Cell.food_adj -- the number of orthogonally adjacent food
   cells -- so a mouth can rule out its neighbourhood with one read instead of
   four grid lookups. It is derived state on the hottest mutation path in the
   engine, so these tests are mostly one assertion: the counter still agrees
   with the grid it describes. A drifted counter is invisible until organisms
   quietly stop eating, which is exactly the failure worth catching here. */

// Every cell whose food_adj disagrees with a direct recount, capped so a
// wholesale drift reports a few examples instead of a megabyte of JSON.
async function driftedCells(page) {
  return await page.evaluate(() => {
    const grid_map = window.engine.env.grid_map;
    const bad = [];
    for (let c = 0; c < grid_map.cols; c++) {
      for (let r = 0; r < grid_map.rows; r++) {
        let actual = 0;
        for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const n = grid_map.cellAt(c + dc, r + dr);
          if (n && n.state.name === 'food') actual++;
        }
        const cell = grid_map.grid[c][r];
        if (cell.food_adj !== actual) {
          if (bad.length < 5) bad.push({ c, r, counted: cell.food_adj, actual });
          else return bad;
        }
      }
    }
    return bad;
  });
}

const runTicks = (page, n) =>
  page.evaluate(n => { for (let i = 0; i < n; i++) window.engine.environmentUpdate(); }, n);

async function loadWorld(page, value) {
  await openPanel(page, 'save');
  await page.locator(`.world-card[data-world="${value}"]`).click();
  await expect(page.getByTestId('worlds-modal')).toBeHidden({ timeout: 15000 });
}

test.describe('Food-adjacency counter', () => {
  test('Holds through a live simulation', async ({ page }) => {
    await pauseEngine(page);
    await runTicks(page, 150);
    expect(await driftedCells(page)).toEqual([]);
  });

  test('Holds after loading a world', async ({ page }) => {
    await pauseEngine(page);
    // colony is small, dense, and carries saved food
    await loadWorld(page, 'colony');
    expect(await driftedCells(page)).toEqual([]);
    await runTicks(page, 60);
    expect(await driftedCells(page)).toEqual([]);
  });

  test('Holds across the bulk grid writes', async ({ page }) => {
    await pauseEngine(page);
    await runTicks(page, 40); // let producers scatter food first

    // reset(false) -> fillGrid, the bulk path that rebuilds rather than tracks
    await page.evaluate(() => window.engine.env.reset(false));
    expect(await driftedCells(page)).toEqual([]);

    // reset(true) reseeds life, then let it produce again
    await page.evaluate(() => window.engine.env.reset(true));
    await runTicks(page, 40);
    expect(await driftedCells(page)).toEqual([]);

    // and the wall tools, which write cells outside the organism loop
    await page.evaluate(() => window.engine.env.controller.randomizeWalls());
    await page.evaluate(() => window.engine.env.clearWalls());
    expect(await driftedCells(page)).toEqual([]);
  });

  test('Survives a save/load round trip', async ({ page }) => {
    await pauseEngine(page);
    await runTicks(page, 40);
    await page.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.engine.env.serialize()));
      window.engine.env.loadRaw(raw);
    });
    expect(await driftedCells(page)).toEqual([]);
    await runTicks(page, 30);
    expect(await driftedCells(page)).toEqual([]);
  });

  test('A mouth still eats the food beside it', async ({ page }) => {
    await pauseEngine(page);
    await runTicks(page, 30); // produce some food to borrow a state object from

    const result = await page.evaluate(() => {
      const env = window.engine.env;
      let food_state = null;
      for (const col of env.grid_map.grid) {
        for (const cell of col) if (cell.state.name === 'food') { food_state = cell.state; break; }
        if (food_state) break;
      }
      if (!food_state) return { error: 'no food in the world to sample a state from' };

      // Find a living mouth with an empty cell beside it
      for (const org of env.organisms) {
        if (!org.living) continue;
        for (const bc of org.anatomy.cells) {
          if (bc.state.name !== 'mouth') continue;
          const c = bc.getRealCol(), r = bc.getRealRow();
          for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const n = env.grid_map.cellAt(c + dc, r + dr);
            if (!n || n.state.name !== 'empty') continue;
            const before = org.food_collected;
            env.changeCell(n.col, n.row, food_state, null);
            const counted = env.grid_map.cellAt(c, r).food_adj;
            org.update();
            return {
              counted,                                   // the placement must be visible to the counter
              eaten: env.grid_map.cellAt(n.col, n.row).state.name !== 'food',
              gained: org.food_collected > before,
            };
          }
        }
      }
      return { error: 'no mouth with an empty neighbour' };
    });

    expect(result.error).toBeUndefined();
    expect(result.counted).toBeGreaterThan(0);
    expect(result.eaten).toBe(true);
    expect(result.gained).toBe(true);
  });

  test('Falls back to the full scan when the edible set is not the four neighbours', async ({ page }) => {
    await pauseEngine(page);
    await runTicks(page, 30);

    /* The counter only covers the orthogonal neighbours. With diagonals
       edible, a mouth whose orthogonal count is 0 must still find the
       diagonal food -- i.e. the fast path has to refuse this set. */
    const result = await page.evaluate(() => {
      const env = window.engine.env;
      window.hyperparams.edibleNeighbors = [[0, 1], [0, -1], [1, 0], [-1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]];
      let food_state = null;
      for (const col of env.grid_map.grid) {
        for (const cell of col) if (cell.state.name === 'food') { food_state = cell.state; break; }
        if (food_state) break;
      }
      if (!food_state) return { error: 'no food in the world to sample a state from' };

      for (const org of env.organisms) {
        if (!org.living) continue;
        for (const bc of org.anatomy.cells) {
          if (bc.state.name !== 'mouth') continue;
          const c = bc.getRealCol(), r = bc.getRealRow();
          const own = env.grid_map.cellAt(c, r);
          if (!own || own.food_adj !== 0) continue; // need a mouth the fast path would skip
          for (const [dc, dr] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const diag = env.grid_map.cellAt(c + dc, r + dr);
            if (!diag || diag.state.name !== 'empty') continue;
            env.changeCell(diag.col, diag.row, food_state, null);
            // Placing diagonally must not move the orthogonal counter
            const still_zero = env.grid_map.cellAt(c, r).food_adj === 0;
            org.update();
            return { still_zero, eaten: env.grid_map.cellAt(diag.col, diag.row).state.name !== 'food' };
          }
        }
      }
      return { error: 'no mouth with a clear diagonal' };
    });

    expect(result.error).toBeUndefined();
    expect(result.still_zero).toBe(true);
    expect(result.eaten).toBe(true);
  });
});
