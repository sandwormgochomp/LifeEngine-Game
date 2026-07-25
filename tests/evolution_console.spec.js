const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* The Console tab — concepts/evolution-window-overhauls.md, overhaul 1.

   The world is paused before the window opens so every reading is taken
   against a frozen sim: the mutation dial follows a live engine value, and an
   unpaused world would drift out from under the assertion between the render
   and the read. */

// Everything the engine reads is the Hyperparams singleton, and an organism
// holds a live reference to it — the same object ProducerCell and Organism
// consult every tick. Asserting through it is asserting the parameter landed
// where the sim will actually look for it.
const engineParam = (page, key) =>
  page.evaluate(k => window.engine.env.organisms[0].hyperparams[k], key);

const dialValue = async (page, id) =>
  Number(await page.locator(`#${id}`).getAttribute('aria-valuenow'));

test.describe('The Console', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#tool-rules').click();
    await expect(page.getByTestId('evolution-console')).toBeVisible();
  });

  test('The window opens on the console, with three working dials', async ({ page }) => {
    for (const id of ['dial-abundance', 'dial-lifespan', 'dial-mutation']) {
      const dial = page.locator(`#${id}`);
      await expect(dial).toHaveAttribute('role', 'slider');
      await expect(dial).toHaveAttribute('aria-valuenow', /.+/);
      // A control, not a picture: it has to be reachable by keyboard
      await dial.focus();
      await expect(dial).toBeFocused();
    }
  });

  // The regression this whole window exists to avoid: a control that looks
  // like it does something and reaches no engine code at all.
  test('The lifespan dial reaches the engine', async ({ page }) => {
    const dial = page.locator('#dial-lifespan');
    const before = await dialValue(page, 'dial-lifespan');
    await dial.press('ArrowRight');
    await dial.press('ArrowRight');
    const after = await dialValue(page, 'dial-lifespan');
    expect(after).toBeGreaterThan(before);

    const applied = await page.evaluate(() => {
      const org = window.engine.env.organisms[0];
      return { lifespan: org.lifespan(), cells: org.anatomy.cells.length };
    });
    // lifespan() === cells * lifespanMultiplier, read straight off Hyperparams
    expect(applied.lifespan).toBe(applied.cells * after);
  });

  // 1..10000 on a linear arc would put every useful value in the first few
  // degrees of travel; the dial is log-scaled so the low end stays operable.
  test('The lifespan dial is log-scaled, so the low end is reachable', async ({ page }) => {
    const dial = page.locator('#dial-lifespan');
    await dial.press('Home');
    expect(await dialValue(page, 'dial-lifespan')).toBe(1);

    await dial.press('ArrowRight');
    const nudged = await dialValue(page, 'dial-lifespan');
    // A linear dial would jump ~200 per press down here
    expect(nudged).toBeGreaterThan(1);
    expect(nudged).toBeLessThan(10);

    await dial.press('End');
    expect(await dialValue(page, 'dial-lifespan')).toBe(10000);
    expect(await engineParam(page, 'lifespanMultiplier')).toBe(10000);
  });

  test('A dial can be dragged, and lands where it is pointed', async ({ page }) => {
    const box = await page.locator('#dial-abundance').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy - 30); // straight up: the middle of the sweep
    await page.mouse.down();
    await page.mouse.up();

    const value = await dialValue(page, 'dial-abundance');
    // Straight up is 140 of the 260-degree sweep, i.e. a shade over half
    expect(value).toBeGreaterThan(45);
    expect(value).toBeLessThan(62);
    expect(await engineParam(page, 'foodProdProb')).toBe(value);
  });

  /* The mutation trap. useGlobalMutability is false by default, so
     globalMutability is inert and a dial bound straight to it would be a dial
     that controls nothing. The dial has to be honest about which of the two it
     is doing. */
  test('The mutation dial reads evolved drift until you take the wheel', async ({ page }) => {
    const dial = page.locator('#dial-mutation');
    // By testid, not by text: the tab strip has a MANUAL button of its own
    const badge = page.getByTestId('dial-mutation-badge');
    await expect(badge).toHaveText('EVOLVED');
    await expect(page.locator('#console-return-evolved')).toHaveCount(0);

    // In EVOLVED state the needle reports the world's own average, not a
    // number nothing reads
    expect(await engineParam(page, 'useGlobalMutability')).toBe(false);
    const observed = await page.evaluate(() => Math.round(window.engine.env.averageMutability() * 100) / 100);
    expect(await dialValue(page, 'dial-mutation')).toBeCloseTo(observed, 2);

    // Touching it is a decision: it takes manual control rather than pretending
    // it had it all along
    await dial.press('ArrowRight');
    await expect(badge).toHaveText('MANUAL');
    expect(await engineParam(page, 'useGlobalMutability')).toBe(true);

    const manual = await dialValue(page, 'dial-mutation');
    // With the global rate live, averageMutability() *is* globalMutability
    expect(await page.evaluate(() => window.engine.env.averageMutability())).toBe(manual);

    // ...and there is a visible way back
    await page.locator('#console-return-evolved').click();
    await expect(badge).toHaveText('EVOLVED');
    expect(await engineParam(page, 'useGlobalMutability')).toBe(false);
  });

  test('Hazard toggles write through, and their consequences are on screen', async ({ page }) => {
    const hazard = page.getByTestId('console-hazard');
    // The tooltip text, rewritten as an outcome and shown rather than hovered
    await expect(hazard.getByText('killers end a whole body at a single touch')).toBeVisible();

    await page.locator('#console-instaKill').check();
    expect(await engineParam(page, 'instaKill')).toBe(true);

    await page.locator('#console-moversCanProduce').check();
    expect(await engineParam(page, 'moversCanProduce')).toBe(true);

    // The schedule is meaningless until the scheduler is on
    await expect(page.locator('#console-randomEventInterval')).toHaveCount(0);
    await page.locator('#console-randomEvents').check();
    expect(await engineParam(page, 'randomEvents')).toBe(true);
    await expect(page.locator('#console-randomEventInterval')).toBeVisible();
    await page.locator('#console-randomEventInterval').fill('600');
    expect(await engineParam(page, 'randomEventInterval')).toBe(600);
  });

  /* The fold absorbed the Manual tab, so it holds every parameter the console
     does not already give an exact control -- including the three the dials
     take, which a dial can aim at but not type. */
  test('Fine tuning folds away everything without an exact control up top', async ({ page }) => {
    await expect(page.getByTestId('console-fine-tuning')).toHaveCount(0);
    const toggle = page.locator('#console-fine-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    /* 21 parameters, less the four hazards and the event interval (which are
       already exact controls on the tab) and less the global mutation rate
       (inert, and hidden while evolved rates are on) */
    await expect(toggle).toHaveText(/FINE TUNING \(15\)/);

    await toggle.click();
    const fold = page.getByTestId('console-fine-tuning');
    await expect(fold).toBeVisible();

    // Everything the tab does not otherwise show lives here...
    for (const key of ['lookRange', 'addProb', 'wallDurability', 'extraMoverFoodCost', 'seeThroughSelf']) {
      await expect(page.locator(`#console-${key}`)).toBeVisible();
    }
    // ...and so do exact-entry rows for the dialled parameters
    for (const key of ['foodProdProb', 'lifespanMultiplier', 'useGlobalMutability']) {
      await expect(page.locator(`#console-${key}`)).toBeVisible();
    }
    // The hazards are not duplicated: their rows up top are already exact
    for (const key of ['instaKill', 'randomEvents', 'maxOrganisms', 'moversCanProduce']) {
      await expect(page.locator(`#console-${key}`)).toHaveCount(1);
    }

    await page.locator('#console-lookRange').fill('7');
    expect(await engineParam(page, 'lookRange')).toBe(7);
  });

  /* A dial and its row in the fold are two views of one field, and the fold is
     the half you can type an exact number into -- the job the Manual tab used
     to be kept around for. */
  test('A dial and its row in the fold stay in step', async ({ page }) => {
    await page.locator('#dial-lifespan').press('End');
    await page.locator('#console-fine-toggle').click();
    await expect(page.locator('#console-lifespanMultiplier')).toHaveValue('10000');

    // ...and back the other way, at a number the log-scale dial cannot aim at
    await page.locator('#console-lifespanMultiplier').fill('250');
    await expect(page.locator('#dial-lifespan')).toHaveAttribute('aria-valuenow', '250');
    expect(await engineParam(page, 'lifespanMultiplier')).toBe(250);
  });

  /* The fold is the window's exact-entry surface, so it has to still be open
     when you come back from consulting the deck. */
  test('The fold stays open across a trip to the Fate Deck', async ({ page }) => {
    await page.locator('#console-fine-toggle').click();
    await expect(page.locator('#console-lookRange')).toBeVisible();

    await page.locator('#evo-tab-fate').click();
    await page.locator('#evo-tab-console').click();
    await expect(page.locator('#console-lookRange')).toBeVisible();
  });
});
