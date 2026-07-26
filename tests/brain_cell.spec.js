const { test, expect, pauseEngine, openEditor } = require('./helpers/fixtures');

/* The brain cell, and the one rule it exists for: a body needs ten of them
   before it can build a wall.

   It is the only cell type with no per-tick behaviour -- it is counted, not
   run -- so everything worth asserting is about the threshold. The tests drive
   Organism.buildWall() directly because that is the single choke point the gate
   lives at: the brain's `build` action, the editor and a loaded organism all
   arrive there, and gating anywhere else would leave one of those paths open.

   The wall lands behind the organism (buildWall builds opposite `direction`),
   so each case pins the direction and then reads the cell it should have
   written. */

const WALL_BRAIN_CELLS = 10;

/* Build an organism in an emptied world with `n` brain cells, plenty of food,
   and a known heading. Returns where its wall would go. */
async function builderAt(page, n) {
  return page.evaluate(({ n }) => {
    const env = window.engine.env;
    const org = env.organisms[0];

    const cells = [{ state: { name: 'mover' }, loc_col: 0, loc_row: 0 }];
    for (let i = 0; i < n; i++) {
      cells.push({ state: { name: 'brain' }, loc_col: 1 + (i % 5), loc_row: i < 5 ? 0 : 1 });
    }
    org.anatomy.loadRaw({ cells });
    org.updateGrid();
    org.food_collected = 100;
    org.direction = 1;          // right, so the wall goes to its left
    org.rotation = 0;

    return {
      brain_cells: org.anatomy.brain_cells,
      target: [org.c - 1, org.r],
      before: env.grid_map.stateAt(org.c - 1, org.r).name,
    };
  }, { n });
}

const stateAt = (page, [c, r]) =>
  page.evaluate(({ c, r }) => window.engine.env.grid_map.stateAt(c, r).name, { c, r });

const build = page => page.evaluate(() => {
  const org = window.engine.env.organisms[0];
  org.buildWall();
  return org.food_collected;
});

test.describe('Brain cell', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('the anatomy counts brain cells rather than flagging them', async ({ page }) => {
    // The count is what the rule reads, so one is genuinely different from ten.
    expect((await builderAt(page, 0)).brain_cells).toBe(0);
    expect((await builderAt(page, 1)).brain_cells).toBe(1);
    expect((await builderAt(page, WALL_BRAIN_CELLS)).brain_cells).toBe(WALL_BRAIN_CELLS);
  });

  test(`${WALL_BRAIN_CELLS} brain cells build a wall`, async ({ page }) => {
    const { target, before } = await builderAt(page, WALL_BRAIN_CELLS);
    expect(before).not.toBe('wall');

    const food_left = await build(page);
    expect(await stateAt(page, target), 'the wall is laid behind it').toBe('wall');
    // And it paid the standing 5-food price.
    expect(food_left).toBe(95);
  });

  test('one short of the threshold builds nothing, and is not charged', async ({ page }) => {
    const { target } = await builderAt(page, WALL_BRAIN_CELLS - 1);

    const food_left = await build(page);
    expect(await stateAt(page, target), 'no wall').not.toBe('wall');
    /* Not charged either: the gate sits above the food check on purpose, so a
       body that cannot build is not billed for trying. */
    expect(food_left).toBe(100);
  });

  test('no brain cells at all builds nothing', async ({ page }) => {
    const { target } = await builderAt(page, 0);
    await build(page);
    expect(await stateAt(page, target)).not.toBe('wall');
  });

  /* The gate has to hold on the path the game actually uses, not just on a
     direct call: a `build` action in the brain reaches buildWall through
     Brain.decide, and that path had no threshold of its own. */
  test('a build action through the brain obeys the same threshold', async ({ page }) => {
    const runBuildAction = (page, n) => page.evaluate(({ n }) => {
      const env = window.engine.env;
      const org = env.organisms[0];

      const cells = [
        { state: { name: 'mover' }, loc_col: 0, loc_row: 0 },
        { state: { name: 'eye' }, loc_col: 0, loc_row: -1 },
      ];
      for (let i = 0; i < n; i++) {
        cells.push({ state: { name: 'brain' }, loc_col: 1 + (i % 5), loc_row: i < 5 ? 0 : 1 });
      }
      org.anatomy.loadRaw({ cells });
      org.updateGrid();
      org.food_collected = 100;
      org.direction = 1;
      org.rotation = 0;
      org.brain.load({ states: [{
        name: 'Build', decisions: { mouth: 10 }, actions: { mouth: 'build' }, transitions: [],
      }] });
      // Stands in for the eye having seen something a tick earlier.
      org.brain.observe({ state: { name: 'mouth' }, owner: null, distance: 1, direction: 0 });

      const target = [org.c - 1, org.r];
      org.brain.decide();
      return { target, state: env.grid_map.stateAt(target[0], target[1]).name };
    }, { n });

    expect((await runBuildAction(page, WALL_BRAIN_CELLS - 1)).state,
      'a brain action cannot route around the threshold').not.toBe('wall');
    expect((await runBuildAction(page, WALL_BRAIN_CELLS)).state).toBe('wall');
  });

  /* The lab has to say so before you wire up an action that will not fire.
     The badge used to key off a boolean anatomy flag, which cannot express
     "you have three of the ten you need". */
  test('the brain editor says how many cells the build action still needs', async ({ page }) => {
    const buildOption = async (n) => {
      await page.evaluate(({ n }) => {
        const anatomy = window.engine.organism_editor.organism.anatomy;
        const cells = [
          { state: { name: 'mover' }, loc_col: 0, loc_row: 0 },
          { state: { name: 'eye' }, loc_col: 0, loc_row: -1 },
        ];
        for (let i = 0; i < n; i++) {
          cells.push({ state: { name: 'brain' }, loc_col: 1 + (i % 5), loc_row: i < 5 ? 0 : 1 });
        }
        anatomy.loadRaw({ cells });
        window.engine.emitChange(true);
      }, { n });
      return page.locator('select option[value="build"]').first().textContent();
    };

    await openEditor(page);
    await page.locator('#open-brain').click();
    await expect(page.getByTestId('brain-modal')).toBeVisible();

    expect(await buildOption(0)).toContain(`needs ${WALL_BRAIN_CELLS} brain`);
    expect(await buildOption(WALL_BRAIN_CELLS - 1),
      'still short, so still badged').toContain(`needs ${WALL_BRAIN_CELLS} brain`);
    expect(await buildOption(WALL_BRAIN_CELLS)).toBe('build wall');
  });

  test('the cell survives a save/load round trip and recounts', async ({ page }) => {
    await builderAt(page, WALL_BRAIN_CELLS);
    const round_tripped = await page.evaluate(() => {
      const org = window.engine.env.organisms[0];
      const raw = org.anatomy.serialize();
      // A fresh anatomy loaded from the save recomputes its own count.
      org.anatomy.loadRaw(raw);
      return {
        count: org.anatomy.brain_cells,
        names: raw.cells.map(c => c.state.name).filter(n => n === 'brain').length,
      };
    });
    expect(round_tripped.names).toBe(WALL_BRAIN_CELLS);
    expect(round_tripped.count).toBe(WALL_BRAIN_CELLS);
  });
});
