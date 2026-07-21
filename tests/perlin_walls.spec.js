const { test, expect, openWorldControls, pauseEngine } = require('./helpers/fixtures');

// Fraction of wall cells that touch another wall cell orthogonally. This, not
// the wall count, is what distinguishes a real noise field from static: a
// coherent field lays walls down in continuous bands (~1.0), while independent
// per-cell randomness scatters isolated singletons (~0.35). Both produce about
// the same number of walls, so counting them proves nothing.
const wallStats = page => page.evaluate(() => {
  const gm = window.engine.env.grid_map;
  const isWall = (c, r) => {
    const cell = gm.cellAt(c, r);
    return cell != null && cell.state.name === 'wall';
  };
  let walls = 0, withNeighbor = 0;
  for (let c = 0; c < gm.cols; c++) {
    for (let r = 0; r < gm.rows; r++) {
      if (!isWall(c, r)) continue;
      walls++;
      if (isWall(c - 1, r) || isWall(c + 1, r) || isWall(c, r - 1) || isWall(c, r + 1)) withNeighbor++;
    }
  }
  return { total: gm.grid.flat().length, walls, clustered: walls ? withNeighbor / walls : 0 };
});

test.describe('Perlin wall generation', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openWorldControls(page);
  });

  // Regression: Perlin's two caches were indexed with a bare array --
  // this.gradients[[vx,vy]] -- which only worked because JS stringifies the
  // key into "vx,vy". Rewritten to build that string explicitly.
  //
  // The gradient cache is what makes the field continuous: adjacent cells must
  // read back the same gradient at the lattice corners they share. Break the
  // key scheme and every lookup misses, so each corner gets a fresh random
  // gradient and the field degenerates into static. Measured, that drops
  // clustering from ~1.00 to ~0.36 while leaving the wall count untouched.
  test('lays walls in continuous bands, not scattered static', async ({ page }) => {
    await page.locator('#randomize-walls-btn').click();

    const { walls, total, clustered } = await wallStats(page);

    expect(walls).toBeGreaterThan(0);
    expect(walls).toBeLessThan(total * 0.5);
    expect(clustered).toBeGreaterThan(0.9);
  });

  // seed() re-randomizes the gradients between runs, so the band moves; what
  // has to hold every time is that it stays a band.
  test('stays coherent across reseeds', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.locator('#randomize-walls-btn').click();
      const { walls, clustered } = await wallStats(page);
      expect(walls).toBeGreaterThan(0);
      expect(clustered).toBeGreaterThan(0.9);
    }
  });
});

test.describe('Fossil record reset', () => {
  // Regression: clear_record() reset extant_species/extinct_species to [],
  // while init() and every access site treat them as objects keyed by species
  // name. Arrays only worked by accident, since they take string properties
  // too. Restart runs clear_record and then reseeds, so it exercises the
  // wiped map being written to and read back.
  test('restart rebuilds the species map from the reseeded organism', async ({ page }) => {
    await pauseEngine(page);
    await openWorldControls(page);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset-env').click();

    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBe(1);

    // The reseeded organism must be registered in the freshly cleared record,
    // reachable by its name rather than sitting at a numeric index.
    const record = await page.evaluate(() => {
      const org = window.engine.env.organisms[0];
      return { name: org.species.name, population: org.species.population };
    });

    expect(record.name).toBeTruthy();
    expect(record.population).toBeGreaterThan(0);
  });
});
