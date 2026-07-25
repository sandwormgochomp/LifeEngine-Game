const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* The evolution window as a whole: three tabs over one set of parameters.
   evolution_console.spec and fate_deck.spec each cover their own tab in
   isolation; what is left over -- and what neither can see -- is the seam
   between them, where a card played on one tab and a slider dragged on another
   are writing the same Hyperparams fields. */

const paramsOf = (page, keys) => page.evaluate(
  keys => Object.fromEntries(keys.map(k => [k, window.hyperparams[k]])), keys);

// Wind the clock to the end of a live era and expire it, as fate_deck.spec does
const expire = (page, kind) => page.evaluate(kind => {
  const env = window.engine.env;
  env.total_ticks = env.active_events.find(e => e.kind === kind).ends_at;
  env.tickWorldEvents();
  window.engine.emitChange(true);
}, kind);

test.describe('The evolution window', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#tool-rules').click();
    await expect(page.getByTestId('evolution-modal')).toBeVisible();
  });

  test('Opens on the Console, and every tab is reachable', async ({ page }) => {
    await expect(page.getByTestId('evolution-console')).toBeVisible();

    await page.locator('#evo-tab-fate').click();
    await expect(page.getByTestId('fate-deck')).toBeVisible();
    await expect(page.getByTestId('evolution-console')).toBeHidden();

    await page.locator('#evo-tab-manual').click();
    await expect(page.locator('#lifespanMultiplier')).toBeVisible();

    await page.locator('#evo-tab-console').click();
    await expect(page.getByTestId('evolution-console')).toBeVisible();
  });

  /* The three tabs are three views of one singleton, so a write on any of them
     has to be the value the others show. A card is the strongest version of
     the case: it writes several fields at once, from a tab with no sliders. */
  test('A card played on the deck is the number the other tabs show', async ({ page }) => {
    const before = await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']);

    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-long-winter').click();

    // The Long Winter is lifespan x3, food production /2
    await page.locator('#evo-tab-console').click();
    await expect(page.locator('#dial-lifespan'))
      .toHaveAttribute('aria-valuenow', String(before.lifespanMultiplier * 3));
    await expect(page.locator('#dial-abundance'))
      .toHaveAttribute('aria-valuenow', String(before.foodProdProb / 2));

    await page.locator('#evo-tab-manual').click();
    await expect(page.locator('#lifespanMultiplier'))
      .toHaveValue(String(before.lifespanMultiplier * 3));
  });

  /* The window used to keep showing the era's numbers after the era had wound
     them back: the mirror was only ever refreshed by the window's own edits,
     and an era expires from the tick loop. A control displaying a value the
     engine is not running on is the failure this whole window was rebuilt to
     avoid. */
  test('The window follows an era winding itself back, with no interaction', async ({ page }) => {
    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-long-winter').click();

    await page.locator('#evo-tab-manual').click();
    await expect(page.locator('#lifespanMultiplier')).toHaveValue('300');

    await expire(page, 'long-winter');

    await expect(page.locator('#lifespanMultiplier')).toHaveValue('100');
    expect((await paramsOf(page, ['lifespanMultiplier'])).lifespanMultiplier).toBe(100);
  });

  /* An era restores the values it captured, which would otherwise silently
     throw away anything the player set by hand in the meantime -- minutes
     later, with nothing on screen having warned them. Editing a held field
     takes it off the era instead. */
  test('An edit made during an era survives the era', async ({ page }) => {
    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-long-winter').click();

    await page.locator('#evo-tab-manual').click();
    await page.locator('#lifespanMultiplier').fill('500');

    await expire(page, 'long-winter');

    await expect(page.locator('#lifespanMultiplier')).toHaveValue('500');
    expect((await paramsOf(page, ['lifespanMultiplier'])).lifespanMultiplier).toBe(500);
  });

  /* Releasing one field must not disturb the rest of the bundle: the Long
     Winter still owes the world its food rate back. */
  test('Taking one control off an era leaves the rest of it running', async ({ page }) => {
    const before = await paramsOf(page, ['foodProdProb']);

    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-long-winter').click();
    await page.locator('#evo-tab-manual').click();
    await page.locator('#lifespanMultiplier').fill('500');

    // The era is still live, still holding food production
    await expect(page.getByTestId('fate-card-long-winter')).toBeHidden();
    expect(await page.evaluate(() => window.engine.env.active_events.map(e => e.kind)))
      .toContain('long-winter');

    await expire(page, 'long-winter');
    expect((await paramsOf(page, ['foodProdProb'])).foodProdProb).toBe(before.foodProdProb);
  });

  /* An era holding nothing has nothing left to wind back, so it should be over
     rather than sitting in active_events until its clock runs out. */
  test('An era whose every control was taken over ends there and then', async ({ page }) => {
    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-green-sun').click();  // permanent, enqueues nothing
    await page.locator('#fate-card-fertile-crescent').click();

    /* Fertile Crescent holds foodProdProb and foodBlocksReproduction, so both
       have to be taken over for the era to be left holding nothing.
       7.001 rather than 7 because the Manual tab's food row is min 0.001 step 1
       (evolutionParams.ts), so every value its slider can produce ends in .001
       -- the Console's ABUNDANCE dial is the one with round numbers on it. */
    await page.locator('#evo-tab-manual').click();
    await page.locator('#foodProdProb').fill('7.001');
    await page.locator('#foodBlocksReproduction').check();

    expect(await page.evaluate(() => window.engine.env.active_events.map(e => e.kind)))
      .not.toContain('fertile-crescent');
    // ...and the player's own numbers are left standing
    expect(await paramsOf(page, ['foodProdProb', 'foodBlocksReproduction']))
      .toEqual({ foodProdProb: 7.001, foodBlocksReproduction: true });
  });
});
