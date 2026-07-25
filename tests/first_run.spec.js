const { test, expect } = require('./helpers/fixtures');

/* First-run legibility: the very first visit runs the ordinary origin world --
   one organism in its petri dish, same as every other visit -- and fires a
   short sequence of world-anchored hints over it, marking localStorage so it
   never happens again. The world itself is never swapped or resized.

   The shared fixture navigates with ?firstrun=off, so each test here
   re-navigates with the feature enabled on a cleared profile.

   ?hintpace=fast compresses the wall-clock hint timings 10x so a full sequence
   fits the repo's 15s test budget; the third hint's budget is in sim ticks, so
   it is bought with setSpeedIndex instead. */

const DONE_KEY = 'life_engine.first_run_done';

async function firstVisit(page, params = '') {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/?floaties=static${params}`);
  await page.waitForSelector('div[data-engine-ready="true"]');
}

const orgCount = page => page.evaluate(() => window.engine.env.organisms.length);

test.describe('First-run experience', () => {
  test('the first visit keeps the origin world and records the visit', async ({ page }) => {
    await firstVisit(page);
    // Stop before anything can divide: the founder should be alone in its dish.
    await page.evaluate(() => window.engine.stop());
    expect(await orgCount(page)).toBe(1);
    // The grid is viewport-derived, not a bundled world's fixed dimensions.
    const { cols, viewportCols, petri } = await page.evaluate(() => ({
      cols: window.engine.env.num_cols,
      viewportCols: Math.ceil(window.innerWidth / window.engine.env.grid_map.cell_size),
      // dish_tier is allocated only by buildPetriDish() -- null on flat worlds.
      petri: window.engine.env.grid_map.dish_tier !== null,
    }));
    expect(Math.abs(cols - viewportCols)).toBeLessThanOrEqual(2);
    expect(petri).toBe(true);
    expect(await page.evaluate(k => localStorage.getItem(k), DONE_KEY)).toBe('1');
  });

  test('?firstrun=off shows no hints and does not spend the first run', async ({ page }) => {
    await firstVisit(page, '&firstrun=off');
    await page.waitForTimeout(3000); // past MEET_DELAY_MS with room to spare
    await expect(page.getByTestId('first-run-hint')).toHaveCount(0);
    // The visit is not marked done either -- the flag belongs to the real flow.
    expect(await page.evaluate(k => localStorage.getItem(k), DONE_KEY)).toBeNull();
  });

  test('the hints do not come back on a later visit', async ({ page }) => {
    await firstVisit(page);
    await expect(page.getByTestId('first-run-hint')).toBeVisible({ timeout: 10000 });
    await page.goto('/?floaties=static');
    await page.waitForSelector('div[data-engine-ready="true"]');
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('first-run-hint')).toHaveCount(0);
  });

  test('the first hint anchors to an on-screen organism, and a reset ends the hints', async ({ page }) => {
    await firstVisit(page);
    // Freeze the world so the anchor organism cannot die mid-assertion.
    await page.evaluate(() => window.engine.stop());

    const hint = page.getByTestId('first-run-hint');
    await expect(hint).toBeVisible({ timeout: 10000 });
    await expect(hint).toContainText('click it to look inside');
    const box = await hint.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Replacing the world mid-hint (here: a reset) must end the sequence --
    // the hints were narrating a world that no longer exists.
    await page.evaluate(() => window.engine.env.reset());
    await expect(hint).toBeHidden();
    await page.waitForTimeout(3000); // longer than the gap + retry cadence
    await expect(hint).toBeHidden();
  });

  test('a hint outlives its anchor by moving to another organism', async ({ page }) => {
    await firstVisit(page, '&hintpace=fast');
    // 8x: organisms die constantly at speed. Before the label learned to
    // re-anchor, a dead anchor cut its hint down to an unreadable flash --
    // measured at under 100ms, against a 900ms fast-pace HINT_MS.
    await page.evaluate(() => window.engine.setSpeedIndex(3));

    /* The producer beat, not the first one: by then the world is populated, so
       a replacement anchor genuinely exists and an early extinction restart
       cannot decide the outcome. */
    const hint = page.getByTestId('first-run-hint');
    const isProducer = t => /grows the food/.test(t || '');
    await expect.poll(async () => (await hint.allTextContents())[0] || '',
      { timeout: 10000, intervals: [40] }).toMatch(/grows the food/);

    const start = Date.now();
    let heldFor = 0;
    while (Date.now() - start < 900) {
      if (!isProducer((await hint.allTextContents())[0])) break;
      heldFor = Date.now() - start;
      await page.waitForTimeout(40);
    }
    expect(heldFor).toBeGreaterThan(500);
  });

  test('all three beats fire, in order (fast pace)', async ({ page }) => {
    await firstVisit(page, '&hintpace=fast');
    /* 8x: the origin world's first non-founder species arrives within ~1100
       ticks worst case (scripts/measure-origin-world.js), which needs the
       speed to fit inside the budget -- the hint's own giveup is 3000 ticks. */
    await page.evaluate(() => window.engine.setSpeedIndex(3));

    // Hints flash by at fast pace, so accumulate every text the element shows.
    const seen = [];
    await expect.poll(async () => {
      for (const t of await page.getByTestId('first-run-hint').allTextContents())
        if (t !== seen[seen.length - 1]) seen.push(t);
      return seen.join(' | ');
    }, { timeout: 12000, intervals: [150] }).toMatch(/branched off|evolved a mover/);

    /* The middle beat has to survive a world that may still hold a single
       organism -- the founder is itself a producer, so the hint re-anchors on
       it rather than being dropped. */
    expect(seen.join(' | ')).toMatch(
      /first lifeform.*\|.*grows the food.*\|.*(branched off|evolved a mover)/s);
  });
});
