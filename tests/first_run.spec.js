const { test, expect } = require('./helpers/fixtures');

/* First-run legibility: the very first visit opens on the curated demo world
   (ArthursWorld) instead of the blank origin world, marks the visit in
   localStorage so it never happens again, and fires a short sequence of
   world-anchored hints. The shared fixture navigates with ?firstrun=off, so
   each test here re-navigates with the feature enabled on a cleared profile.

   ?hintpace=fast compresses the hint timings 10x so a full sequence fits the
   repo's 15s test budget. */

const DEMO_COLS = 356; // ArthursWorld's width; the origin world is viewport-sized
const DONE_KEY = 'life_engine.first_run_done';

async function firstVisit(page, params = '') {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/?floaties=static${params}`);
  await page.waitForSelector('div[data-engine-ready="true"]');
}

const worldCols = page => page.evaluate(() => window.engine.env.num_cols);

test.describe('First-run experience', () => {
  test('the first visit swaps in the demo world and records the visit', async ({ page }) => {
    await firstVisit(page);
    await expect.poll(() => worldCols(page)).toBe(DEMO_COLS);
    // A real ecosystem arrived, not just a resized grid.
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBeGreaterThan(100);
    expect(await page.evaluate(k => localStorage.getItem(k), DONE_KEY)).toBe('1');
  });

  test('later visits keep the blank origin world', async ({ page }) => {
    await firstVisit(page);
    await expect.poll(() => worldCols(page)).toBe(DEMO_COLS); // flag is written now
    await page.goto('/?floaties=static');
    await page.waitForSelector('div[data-engine-ready="true"]');
    // Give a would-be demo fetch ample time to land before asserting it didn't.
    await page.waitForTimeout(800);
    expect(await worldCols(page)).not.toBe(DEMO_COLS);
  });

  test('?firstrun=off skips the demo world even on a fresh profile', async ({ page }) => {
    await firstVisit(page, '&firstrun=off');
    await page.waitForTimeout(800);
    expect(await worldCols(page)).not.toBe(DEMO_COLS);
    // The visit is not marked done either -- the flag belongs to the real flow.
    expect(await page.evaluate(k => localStorage.getItem(k), DONE_KEY)).toBeNull();
  });

  test('the first hint anchors to an on-screen organism, and a reset ends the hints', async ({ page }) => {
    await firstVisit(page);
    await expect.poll(() => worldCols(page)).toBe(DEMO_COLS);
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

  test('the full sequence reaches the evolution hint (fast pace)', async ({ page }) => {
    await firstVisit(page, '&hintpace=fast');
    await expect.poll(() => worldCols(page)).toBe(DEMO_COLS);
    // 8x: ArthursWorld reliably produces a brand-new species within a few
    // hundred ticks, so the third hint's condition lands well inside the budget.
    await page.evaluate(() => window.engine.setSpeedIndex(3));

    // Hints flash by at fast pace, so accumulate every text the element shows.
    const seen = new Set();
    await expect.poll(async () => {
      const texts = await page.getByTestId('first-run-hint').allTextContents();
      for (const t of texts) seen.add(t);
      return [...seen].join(' | ');
    }, { timeout: 12000, intervals: [150] }).toMatch(/evolved a mover|new species just branched off/);
  });
});
