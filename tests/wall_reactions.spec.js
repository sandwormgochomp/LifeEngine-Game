const { test, expect, openEditor, pauseEngine } = require('./helpers/fixtures');

/* Two kinds of wall, two reactions.

   The terrain palette paints Wall and Glass (invincible_wall). EyeCell.look
   returns an Observation for any non-empty state, and Brain.decide looks the
   weight up by state name, so the simulation could always tell the two apart --
   the brain editor's observable list was the only thing that could not, which
   left Glass painting something no creature could be taught to avoid.

   These drive a real eye and a real decision rather than asserting that a row
   exists: what matters is that the two walls produce different behaviour.

   Geometry throughout: the organism sits at its own (c, r) with a mover at the
   body centre and an eye one cell to its right facing right, and the wall under
   test goes three cells to the right. So the eye's ray starts beside the body
   and reaches the wall two cells out. */

// Directions, as Directions.ts numbers them.
const RIGHT = 1;
const LEFT = 3;

/* Face an organism right at a wall of `kind` and let it decide. Returns the
   heading it chose, plus what the eye actually reported. */
const faceWall = (page, kind, weight) => page.evaluate(({ kind, weight, RIGHT }) => {
  const env = window.engine.env;
  const org = env.organisms[0];

  org.anatomy.loadRaw({ cells: [
    { state: { name: 'mover' }, loc_col: 0, loc_row: 0 },
    { state: { name: 'eye' }, loc_col: 1, loc_row: 0, direction: RIGHT },
  ] });
  org.updateGrid();
  org.rotation = 0;
  org.direction = RIGHT;

  // The real CellState off the registry, so this is the same object the Wall
  // and Glass tools drop.
  env.changeCell(org.c + 3, org.r, window.cellStates[kind], null);

  org.brain.load({ states: [{
    name: 'S', decisions: { [kind]: weight }, actions: {}, transitions: [],
  }] });

  const eye = org.anatomy.cells.find(c => c.state.name === 'eye');
  const seen = eye.look();
  eye.performFunction();          // pushes the observation the brain reads
  const changed = org.brain.decide();

  return { saw: seen.state ? seen.state.name : null, changed, direction: org.direction };
}, { kind, weight, RIGHT });

test.describe('Reacting to both wall types', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('the brain editor offers a row for each wall type', async ({ page }) => {
    await openEditor(page);
    await page.locator('#open-brain').click();
    await expect(page.getByTestId('brain-modal')).toBeVisible();

    await expect(page.locator('[data-cell="wall"]')).toBeVisible();
    await expect(page.locator('[data-cell="invincible_wall"]')).toBeVisible();
    // Addressed by state name, labelled by what the player calls it.
    await expect(page.locator('[data-cell="invincible_wall"]')).toContainText('glass');
    await expect(page.locator('#weight-invincible_wall')).toBeVisible();
  });

  test('the two walls take independent weights', async ({ page }) => {
    await openEditor(page);
    await page.locator('#open-brain').click();
    await page.locator('#weight-invincible_wall').fill('-9');
    await page.locator('#weight-wall').fill('6');

    const decisions = await page.evaluate(() => JSON.parse(JSON.stringify(
      window.engine.organism_editor.organism.brain.states[0].decisions)));
    // Setting one must not move the other.
    expect(decisions.invincible_wall).toBe(-9);
    expect(decisions.wall).toBe(6);
  });

  test('an eye reports each wall type under its own name', async ({ page }) => {
    expect((await faceWall(page, 'wall', 0)).saw).toBe('wall');
    expect((await faceWall(page, 'invincible_wall', 0)).saw).toBe('invincible_wall');
  });

  /* The payoff: a creature can now be taught to avoid glass specifically. A
     negative weight steers it away from what it saw, a positive one toward. */
  test('a negative weight on glass turns the organism away from it', async ({ page }) => {
    const fled = await faceWall(page, 'invincible_wall', -10);
    expect(fled.changed, 'the observation moved it').toBe(true);
    expect(fled.direction, 'it turns away from the glass ahead').toBe(LEFT);

    const chased = await faceWall(page, 'invincible_wall', 10);
    expect(chased.direction, 'and toward it when the weight is positive').toBe(RIGHT);
  });

  test('the two walls steer independently', async ({ page }) => {
    /* Glass ahead while only plain `wall` carries a weight: the organism has
       no opinion about what it is looking at, so nothing steers it. This is
       the case that was impossible to express before -- both walls answered to
       the single `wall` row or to nothing at all. */
    const indifferent = await page.evaluate(({ RIGHT }) => {
      const env = window.engine.env;
      const org = env.organisms[0];
      org.anatomy.loadRaw({ cells: [
        { state: { name: 'mover' }, loc_col: 0, loc_row: 0 },
        { state: { name: 'eye' }, loc_col: 1, loc_row: 0, direction: RIGHT },
      ] });
      org.updateGrid();
      org.rotation = 0;
      org.direction = RIGHT;
      env.changeCell(org.c + 3, org.r, window.cellStates.invincible_wall, null);
      org.brain.load({ states: [{
        name: 'S', decisions: { wall: -10 }, actions: {}, transitions: [],
      }] });
      const eye = org.anatomy.cells.find(c => c.state.name === 'eye');
      eye.performFunction();
      return { changed: org.brain.decide(), direction: org.direction };
    }, { RIGHT });

    expect(indifferent.changed, 'a wall weight says nothing about glass').toBe(false);
    expect(indifferent.direction).toBe(RIGHT);
  });
});
