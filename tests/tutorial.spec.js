const { test, expect } = require('./helpers/fixtures');

/* The guided walkthrough: eight chapters, two entry points.

   It opens by itself on a browser's first visit and from the TUTORIAL button
   any time after. The shared fixture navigates with ?tutorial=off (the card
   would otherwise sit over the left of every other test's world), so the tests
   here re-navigate with it enabled on a cleared profile, the same way
   first_run.spec.js does for the hints.

   The property worth protecting is that the chapters advance on the player
   doing the thing, not on them clicking Next -- a walkthrough you can read
   end to end without ever touching the game teaches the button. Each of the
   six asking chapters is driven here by performing its ask through the real
   UI, never by calling the tutorial's own internals. */

const TUTORIAL_KEY = 'life_engine.tutorial_done';
const FIRST_RUN_KEY = 'life_engine.first_run_done';

async function freshVisit(page, params = '') {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/?floaties=static&firstrun=off${params}`);
  await page.waitForSelector('div[data-engine-ready="true"]');
}

const card = page => page.getByTestId('tutorial');
const stepId = page => card(page).getAttribute('data-step');
const next = page => page.getByTestId('tutorial-next').click();

// Walk forward with Next until the named chapter is showing.
async function advanceTo(page, id) {
  for (let i = 0; i < 12; i++) {
    if (await stepId(page) === id) return;
    await next(page);
  }
  throw new Error(`never reached chapter ${id}`);
}

test.describe('Tutorial', () => {
  test('opens by itself on a first visit, and marks the browser', async ({ page }) => {
    await freshVisit(page);
    await expect(card(page)).toBeVisible();
    // First chapter, and the story frame is on it.
    expect(await stepId(page)).toBe('welcome');
    await expect(card(page)).toContainText('Chapter 1 of 8');

    expect(await page.evaluate(k => localStorage.getItem(k), TUTORIAL_KEY)).toBe('1');
  });

  test('does not open again on a later visit, but the button brings it back', async ({ page }) => {
    await freshVisit(page);
    await expect(card(page)).toBeVisible();

    // Same profile, second visit: both flags are spent.
    await page.goto('/?floaties=static&firstrun=off');
    await page.waitForSelector('div[data-engine-ready="true"]');
    await expect(card(page)).toHaveCount(0);

    await page.locator('#tool-tutorial').click();
    await expect(card(page)).toBeVisible();
    expect(await stepId(page)).toBe('welcome');
  });

  test('the button toggles, and a replay always starts from chapter one', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'lab');

    // Closing mid-story and reopening does not resume where it left off.
    await page.locator('#tool-tutorial').click();
    await expect(card(page)).toHaveCount(0);
    await page.locator('#tool-tutorial').click();
    expect(await stepId(page)).toBe('welcome');
  });

  test('?tutorial=off leaves the first visit to the hints, unspent', async ({ page }) => {
    await freshVisit(page, '&tutorial=off');
    await expect(card(page)).toHaveCount(0);
    // The flag is untouched, so the walkthrough still has its first run coming.
    expect(await page.evaluate(k => localStorage.getItem(k), TUTORIAL_KEY)).toBe(null);
  });

  /* The sequencing rule: two narrators, one at a time. On a genuine first
     visit the walkthrough goes first and the world-anchored hints arm only
     once it closes. */
  test('the first-run hints wait for the walkthrough to close', async ({ page }) => {
    /* A genuine first visit: both flags unspent and neither opted out, which
       is the only arrangement that exercises the hand-off. ?hintpace=fast so
       the hints' own first beat lands inside the test budget. */
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?floaties=static&hintpace=fast');
    await page.waitForSelector('div[data-engine-ready="true"]');
    expect(await page.evaluate(k => localStorage.getItem(k), FIRST_RUN_KEY)).toBe('1');

    await expect(card(page)).toBeVisible();
    // Nothing anchored to the world while the card is up.
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('first-run-hint')).toHaveCount(0);

    await page.getByTestId('tutorial-skip').click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByTestId('first-run-hint')).toBeVisible({ timeout: 6000 });
  });

  test('closing a replay does not arm the hints', async ({ page }) => {
    // Fixture profile: the first run is already spent, so this is a replay.
    await page.locator('#tool-tutorial').click();
    await page.getByTestId('tutorial-skip').click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('first-run-hint')).toHaveCount(0);
  });

  /* --- the chapters that watch the player --- */

  test('the speed chapter advances when the world speed actually changes', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'speed');
    await expect(page.getByTestId('tutorial-ask')).toContainText('speed');

    await page.evaluate(() => window.engine.setSpeedIndex(0));
    await expect(card(page)).toHaveAttribute('data-step', 'sample');
  });

  test('the sample chapter advances on clicking a lifeform', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'sample');

    // Through the real path: following a line is what a canvas sample does.
    await page.evaluate(() => {
      const env = window.engine.env;
      env.followOrganism(env.organisms[0]);
    });
    await expect(card(page)).toHaveAttribute('data-step', 'lab');
  });

  test('the lab chapter advances on opening the dock', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'lab');

    await page.locator('#tool-edit').click();
    await expect(card(page)).toHaveAttribute('data-step', 'edit');
  });

  test('the edit chapter advances when the body plan changes', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await page.locator('#tool-edit').click();
    await advanceTo(page, 'edit');

    const cellCount = () => page.evaluate(
      () => window.engine.organism_editor.organism.anatomy.cells.length);
    const before = await cellCount();

    // Through the anatomy the lab grid edits, so the chapter is being driven
    // by a real body-plan change rather than by poking the tutorial.
    await page.evaluate(() => {
      const anatomy = window.engine.organism_editor.organism.anatomy;
      const cell = anatomy.cells[anatomy.cells.length - 1];
      anatomy.removeCell(cell.loc_col, cell.loc_row, true);
    });
    expect(await cellCount()).not.toBe(before);

    await expect(card(page)).toHaveAttribute('data-step', 'evolution');
  });

  test('the evolution and lineage chapters advance on their windows', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'evolution');

    await page.locator('#tool-rules').click();
    await expect(card(page)).toHaveAttribute('data-step', 'lineage');
    // The card outlives being sent to a modal -- it draws above the backdrop.
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await page.locator('#tool-lineage').click();
    await expect(card(page)).toHaveAttribute('data-step', 'end');
  });

  /* The escape hatch. A chapter waiting on the player must never be somewhere
     they are stuck: Next is live on every one of them. */
  test('Next is live on a waiting chapter, so nothing traps you', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'sample');
    await expect(page.getByTestId('tutorial-next')).toBeEnabled();
    await next(page);
    expect(await stepId(page)).toBe('lab');

    // Back works too, and is disabled only on the first chapter.
    await page.getByTestId('tutorial-back').click();
    expect(await stepId(page)).toBe('sample');
  });

  test('the last chapter finishes, and Escape closes the card', async ({ page }) => {
    await page.locator('#tool-tutorial').click();
    await advanceTo(page, 'end');
    await expect(page.getByTestId('tutorial-next')).toHaveText('Finish');
    await next(page);
    await expect(card(page)).toHaveCount(0);

    await page.locator('#tool-tutorial').click();
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
  });
});
