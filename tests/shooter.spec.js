const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* The shooter cell fires on its own.

   It used to be inert unless the organism had a mover, an eye and a
   hand-authored `shoot` brain action -- the only cell type in the game that
   did nothing when placed, while its palette entry and the README both
   promised "fires at targets the organism sees". More to the point, a cell
   with no unattended benefit can never be selected *for*, so shooters could
   only ever be bred out of a world left running.

   Two things the scene below has to control for, both of which produced
   nonsense on the first attempt:

     - Reproduction. A well-fed two-cell body breeds every tick, and its
       children ring the shooter -- all the same species, so all unshootable,
       and the ray never reaches the real target. The turret is therefore given
       a five-cell body and held at four food: enough for shots (2 each), one
       short of the five it would need to breed.
     - Alignment. The ray starts at the *shooter cell*, so a shooter placed off
       the body centre fires down a different row than the one targets are
       placed on. It sits at (0,0) here, with the padding on the diagonals so
       none of the four cardinal rays is blocked. */

const SHOT_COST = 2;
// Five cells, so foodNeeded is 5 and HELD_FOOD cannot trigger reproduction.
const HELD_FOOD = 4;

const build = `
  const env = window.engine.env;
  const editor = window.engine.organism_editor;
  const drop = (cells, c, r) => {
    editor.organism.anatomy.loadRaw({ cells });
    env.controller.dropOrganism(editor.organism, c, r);
    return env.organisms[env.organisms.length - 1];
  };
  const cell = (name, dc, dr) => ({ state: { name }, loc_col: dc, loc_row: dr });
  // Shooter at the centre, padding on the diagonals: all four rays are clear.
  const TURRET = [
    cell('shooter', 0, 0),
    cell('common', 1, 1), cell('common', -1, 1),
    cell('common', 1, -1), cell('common', -1, -1),
  ];
`;

async function scene(page, offset, opts = {}) {
  return page.evaluate(`(({ offset, opts, HELD_FOOD }) => {
    /* eslint-disable no-undef */
    ${build}
    env.reset(false);
    const col = Math.floor(env.num_cols / 2), row = Math.floor(env.num_rows / 2);

    const shooter = drop(TURRET, col, row);
    let target = null;
    if (offset) {
      const cells = opts.targetCells === 'kin' ? TURRET
        : (opts.targetCells || [cell('common', 0, 0)]);
      target = drop(cells, col + offset[0], row + offset[1]);
    }

    const hold = opts.food === undefined ? HELD_FOOD : opts.food;
    shooter.food_collected = hold;
    const start_food = hold;
    env.active_projectiles.length = 0;

    let fired = 0;
    for (let i = 0; i < (opts.ticks || 12); i++) {
      // Topped up only when the test is not about the food budget.
      if (opts.food === undefined) shooter.food_collected = HELD_FOOD;
      env.update();
      fired = Math.max(fired, env.active_projectiles.length);
      if (target && !target.living) break;
    }
    return {
      fired,
      damage: target ? target.damage : null,
      food_spent: start_food - shooter.food_collected,
      population: env.organisms.length,
    };
  })(${JSON.stringify({ offset, opts, HELD_FOOD })})`);
}

test.describe('Shooter cell', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  /* The headline: no mover, no eye, no brain action -- just a shooter cell and
     something to shoot. This case did nothing whatsoever before. */
  test('a placed shooter fires at a target with no brain involved', async ({ page }) => {
    const hit = await scene(page, [6, 0]);
    expect(hit.population, 'the scene stayed a duel').toBe(2);
    expect(hit.fired, 'projectiles are in flight').toBeGreaterThan(0);
    expect(hit.damage, 'and they land').toBeGreaterThan(0);
  });

  test('it covers all four directions without a mover to turn it', async ({ page }) => {
    // A stationary body never changes heading, so a turret that could only
    // fire along `direction` would cover exactly one side of itself.
    for (const [dc, dr, name] of [[6, 0, 'right'], [-6, 0, 'left'], [0, 6, 'down'], [0, -6, 'up']]) {
      const r = await scene(page, [dc, dr]);
      expect(r.damage, `firing ${name}`).toBeGreaterThan(0);
    }
  });

  test('it does not fire with nothing to shoot at', async ({ page }) => {
    const empty = await scene(page, null);
    expect(empty.fired, 'an empty dish draws no fire').toBe(0);
    expect(empty.food_spent, 'and costs nothing').toBe(0);
  });

  test('it does not shoot its own kind', async ({ page }) => {
    const kin = await scene(page, [6, 0], { targetCells: 'kin' });
    expect(kin.fired, 'no shots at its own species').toBe(0);
    expect(kin.damage).toBe(0);
  });

  test('it does not shoot what it cannot see', async ({ page }) => {
    const hidden = await scene(page, [6, 0], {
      targetCells: [{ state: { name: 'chameleon' }, loc_col: 0, loc_row: 0 }],
    });
    // A chameleon is invisible to sight, so it is invisible to the guns.
    expect(hidden.fired, 'chameleons are not shot at').toBe(0);
  });

  test('a shot costs food, and a broke organism does not fire', async ({ page }) => {
    const broke = await scene(page, [6, 0], { food: SHOT_COST - 1, ticks: 8 });
    expect(broke.fired, 'cannot afford a shot').toBe(0);
    expect(broke.food_spent).toBe(0);

    const paid = await scene(page, [6, 0], { food: SHOT_COST, ticks: 4 });
    expect(paid.fired, 'exactly what the budget buys').toBeGreaterThan(0);
    expect(paid.food_spent).toBe(SHOT_COST);
  });

  /* The brain path is unchanged: a `shoot` action still fires, which is what
     the Voidlance predator in the bestiary relies on. decide() is called
     directly, so the autonomous scan never runs and cannot muddy the count. */
  test('the brain shoot action still works', async ({ page }) => {
    const out = await page.evaluate(`(() => {
      ${build}
      env.reset(false);
      const col = Math.floor(env.num_cols / 2), row = Math.floor(env.num_rows / 2);
      // has_shooter is what gates the action, so the cell has to be present.
      const org = drop([cell('mover', 0, 0), cell('eye', 1, 0), cell('shooter', -1, 0)], col, row);
      org.brain.load({ states: [{
        name: 'S', decisions: { common: 5 }, actions: { common: 'shoot' }, transitions: [],
      }] });
      org.food_collected = 1000;
      org.direction = 1;
      env.active_projectiles.length = 0;
      org.brain.observe({ state: { name: 'common' }, owner: null, distance: 1, direction: 1 });
      org.brain.decide();
      return { projectiles: env.active_projectiles.length, spent: 1000 - org.food_collected };
    })()`);
    expect(out.projectiles).toBe(1);
    expect(out.spent).toBe(SHOT_COST);
  });
});
