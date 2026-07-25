const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* The Fate Deck tab of the evolution window: cards played at the world, each a
   bundle of parameter changes that winds itself back. Everything worth
   asserting here is engine-side -- what the card did to Hyperparams and to
   env.active_events -- so the UI is used to play the card and the checks go
   through window.engine / window.hyperparams, the way world_events.spec drives
   the weather it shares a mechanism with. */

// Open the evolution window on the Fate Deck tab (it boots on the Console).
async function openDeck(page) {
  await page.locator('#tool-rules').click();
  await page.locator('#evo-tab-fate').click();
  await page.locator('[data-testid="fate-deck"]').waitFor();
}

// Wind the clock to the end of a card's window and expire it. Driving
// total_ticks beats waiting out 3000 ticks of real time, and it is what the
// tick loop would do anyway.
const expire = (page, kind) => page.evaluate(kind => {
  const env = window.engine.env;
  env.total_ticks = env.active_events.find(e => e.kind === kind).ends_at;
  env.tickWorldEvents();
  window.engine.emitChange(true);
}, kind);

const paramsOf = (page, keys) => page.evaluate(
  keys => Object.fromEntries(keys.map(k => [k, window.hyperparams[k]])), keys);

const eventKinds = page => page.evaluate(() => window.engine.env.active_events.map(e => e.kind));

test.describe('The Fate Deck', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openDeck(page);
  });

  test('The tab deals a hand of cards, timed ones wearing their duration', async ({ page }) => {
    // Every card in the deck is on screen at once — a hand, not a scrolling list
    for (const id of ['long-winter', 'hair-trigger', 'great-cull', 'fertile-crescent',
      'predators-gift', 'long-night', 'green-sun']) {
      await expect(page.getByTestId(`fate-card-${id}`)).toBeVisible();
      await expect(page.getByTestId(`fate-card-${id}`)).toHaveAttribute('data-live', 'false');
    }
    // A timed card prints its window; the ones that land once and never revert
    // have no clock to show
    await expect(page.getByTestId('fate-timer-long-winter')).toContainText('3,000 TK');
    await expect(page.getByTestId('fate-timer-great-cull')).toBeHidden();
    await expect(page.getByTestId('fate-timer-green-sun')).toBeHidden();
  });

  test('Playing a card writes its whole bundle through to the engine', async ({ page }) => {
    const base = await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']);

    await page.locator('#fate-card-long-winter').click();

    const after = await page.evaluate(() => {
      const env = window.engine.env;
      const ev = env.active_events.find(e => e.kind === 'long-winter');
      return {
        lifespan: window.hyperparams.lifespanMultiplier,
        food: window.hyperparams.foodProdProb,
        span: ev.ends_at - env.total_ticks,
        kinds: env.active_events.map(e => e.kind),
      };
    });
    // Both halves of the card land, and both are multiples of what the world
    // was running at rather than of the defaults
    expect(after.lifespan).toBe(base.lifespanMultiplier * 3);
    expect(after.food).toBe(base.foodProdProb * 0.5);
    expect(after.span).toBe(3000);
    expect(after.kinds).toEqual(['long-winter']);

    // The card announces itself in the same channel as the weather
    await expect(page.getByTestId('hud-notifications')).toContainText('The Long Winter');
  });

  test('A timed card winds every parameter it held back exactly', async ({ page }) => {
    /* Deliberately not the defaults: a card restores the world it was played
       on, so a revert that merely reinstated the shipped values would pass a
       weaker test than this and be wrong. */
    await page.evaluate(() => {
      window.hyperparams.lifespanMultiplier = 137;
      window.hyperparams.foodProdProb = 7.5;
    });

    await page.locator('#fate-card-long-winter').click();
    expect(await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']))
      .toEqual({ lifespanMultiplier: 411, foodProdProb: 3.75 });

    await expire(page, 'long-winter');

    expect(await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']))
      .toEqual({ lifespanMultiplier: 137, foodProdProb: 7.5 });
    expect(await eventKinds(page)).toEqual([]);
  });

  test('Replaying a live card extends its era instead of stacking it', async ({ page }) => {
    const base = await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']);

    await page.locator('#fate-card-long-winter').click();
    const first = await page.evaluate(() =>
      window.engine.env.active_events.find(e => e.kind === 'long-winter').ends_at);

    // Let the world run on a bit, then play the same card again
    await page.evaluate(() => { window.engine.env.total_ticks += 500; window.engine.emitChange(true); });
    await page.locator('#fate-card-long-winter').click();

    const after = await page.evaluate(() => {
      const env = window.engine.env;
      return {
        lifespan: window.hyperparams.lifespanMultiplier,
        food: window.hyperparams.foodProdProb,
        ends_at: env.active_events.find(e => e.kind === 'long-winter').ends_at,
        events: env.active_events.length,
      };
    });
    // Still one era, still a single x3 — not x9 — and the window was pushed out
    // from the current tick rather than a second card being dealt
    expect(after.events).toBe(1);
    expect(after.lifespan).toBe(base.lifespanMultiplier * 3);
    expect(after.food).toBe(base.foodProdProb * 0.5);
    expect(after.ends_at).toBe(first + 500);

    /* The trap this guards: a replay that re-applied the transform would also
       recapture the spiked numbers as its baselines, so expiry would strand the
       world at three times its real lifespan for good. */
    await expire(page, 'long-winter');
    expect(await paramsOf(page, ['lifespanMultiplier', 'foodProdProb'])).toEqual(base);
  });

  test('A world saved mid-card stores the true parameters, not the card’s', async ({ page }) => {
    const base = await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']);

    await page.locator('#fate-card-long-winter').click();

    const saved = await page.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.engine.env.serialize()));
      return {
        onDisk: { lifespanMultiplier: raw.controls.lifespanMultiplier, foodProdProb: raw.controls.foodProdProb },
        live: { lifespanMultiplier: window.hyperparams.lifespanMultiplier, foodProdProb: window.hyperparams.foodProdProb },
      };
    });
    // A file has no event to expire and wind it back, so a spiked value written
    // to disk would be permanent. The live world keeps its era regardless.
    expect(saved.onDisk).toEqual(base);
    expect(saved.live).toEqual({ lifespanMultiplier: base.lifespanMultiplier * 3, foodProdProb: base.foodProdProb * 0.5 });
  });

  test('Two cards that hold the same parameter cannot run at once', async ({ page }) => {
    const base = await paramsOf(page, ['foodProdProb']);

    await page.locator('#fate-card-long-winter').click();
    await page.locator('#fate-card-fertile-crescent').click();

    const during = await page.evaluate(() => ({
      kinds: window.engine.env.active_events.map(e => e.kind),
      food: window.hyperparams.foodProdProb,
    }));
    // Only the crescent is left, and it multiplied the pre-winter baseline —
    // had it captured the halved value, expiry would strand the world hungry
    expect(during.kinds).toEqual(['fertile-crescent']);
    expect(during.food).toBe(base.foodProdProb * 2.5);

    await expire(page, 'fertile-crescent');
    expect(await paramsOf(page, ['foodProdProb'])).toEqual(base);
  });

  test('Cards that hold different parameters run side by side', async ({ page }) => {
    await page.locator('#fate-card-hair-trigger').click();
    await page.locator('#fate-card-predators-gift').click();

    const both = await page.evaluate(() => ({
      kinds: window.engine.env.active_events.map(e => e.kind).sort(),
      mutation: window.hyperparams.globalMutability,
      global: window.hyperparams.useGlobalMutability,
      instaKill: window.hyperparams.instaKill,
    }));
    expect(both.kinds).toEqual(['hair-trigger', 'predators-gift']);
    expect(both.global).toBe(true);
    expect(both.instaKill).toBe(true);
    expect(both.mutation).toBe(25);

    // Each winds back on its own clock without disturbing the other
    await expire(page, 'hair-trigger');
    const after = await page.evaluate(() => ({
      kinds: window.engine.env.active_events.map(e => e.kind),
      global: window.hyperparams.useGlobalMutability,
      mutation: window.hyperparams.globalMutability,
      instaKill: window.hyperparams.instaKill,
    }));
    expect(after.kinds).toEqual(['predators-gift']);
    expect(after.global).toBe(false);
    expect(after.mutation).toBe(5);
    expect(after.instaKill).toBe(true);
  });

  test('A card in flight does not survive a reset', async ({ page }) => {
    const base = await paramsOf(page, ['lookRange', 'extraMoverFoodCost']);

    await page.locator('#fate-card-long-night').click();
    expect(await paramsOf(page, ['lookRange'])).toEqual({ lookRange: 4 });

    const after = await page.evaluate(() => {
      window.engine.env.reset(true);
      return {
        params: { lookRange: window.hyperparams.lookRange, extraMoverFoodCost: window.hyperparams.extraMoverFoodCost },
        events: window.engine.env.active_events.length,
      };
    });
    expect(after.params).toEqual(base);
    expect(after.events).toBe(0);
  });

  test('A card in flight does not survive a world load', async ({ page }) => {
    const base = await paramsOf(page, ['lookRange', 'extraMoverFoodCost']);

    // Take a save of the world as it stands, then play a card over the top of it
    await page.evaluate(() => {
      window.__world = JSON.parse(JSON.stringify(window.engine.env.serialize()));
    });
    await page.locator('#fate-card-long-night').click();

    const after = await page.evaluate(() => {
      window.engine.env.loadRaw(window.__world);
      return {
        params: { lookRange: window.hyperparams.lookRange, extraMoverFoodCost: window.hyperparams.extraMoverFoodCost },
        events: window.engine.env.active_events.length,
      };
    });
    /* active_events is an array, so no part of the save/load round trip touches
       it: a card left running here would keep holding the incoming world's look
       range down, then eventually "restore" a dead world's numbers onto it. */
    expect(after.params).toEqual(base);
    expect(after.events).toBe(0);
  });

  test('A live card counts down, stands out, and can be called off early', async ({ page }) => {
    const base = await paramsOf(page, ['lifespanMultiplier', 'foodProdProb']);
    await expect(page.locator('#fate-end-long-winter')).toBeHidden();

    await page.locator('#fate-card-long-winter').click();

    const card = page.getByTestId('fate-card-long-winter');
    await expect(card).toHaveAttribute('data-live', 'true');
    await expect(page.getByTestId('fate-timer-long-winter')).toContainText('3,000 TK');

    // The countdown is ends_at minus the clock, read live off the engine
    await page.evaluate(() => { window.engine.env.total_ticks += 1200; window.engine.emitChange(true); });
    await expect(page.getByTestId('fate-timer-long-winter')).toContainText('1,800 TK');

    // Calling the era off early winds it back exactly as expiry would
    await page.locator('#fate-end-long-winter').click();
    await expect(card).toHaveAttribute('data-live', 'false');
    expect(await paramsOf(page, ['lifespanMultiplier', 'foodProdProb'])).toEqual(base);
    expect(await eventKinds(page)).toEqual([]);
  });

  test('A permanent card changes a rule and leaves no era behind', async ({ page }) => {
    expect(await paramsOf(page, ['moversCanProduce'])).toEqual({ moversCanProduce: false });

    await page.locator('#fate-card-green-sun').click();

    // A rule, not weather: it applies and there is nothing queued to undo it
    expect(await paramsOf(page, ['moversCanProduce'])).toEqual({ moversCanProduce: true });
    expect(await eventKinds(page)).toEqual([]);
    await expect(page.getByTestId('fate-card-green-sun')).toHaveAttribute('data-live', 'false');

    // Permanent cards are written in absolute terms precisely so a replay is a
    // no-op rather than something that compounds with no event to unwind it
    await page.locator('#fate-card-green-sun').click();
    expect(await paramsOf(page, ['moversCanProduce'])).toEqual({ moversCanProduce: true });
    expect(await eventKinds(page)).toEqual([]);
  });

  /* The status bar is where a card's era becomes visible once the window is
     shut: a played card is weather from then on, and reads on the same band as
     the bloom and the ice age. */
  test('A running era is announced on the status bar, and a permanent one is not', async ({ page }) => {
    await page.locator('#fate-card-long-winter').click();
    await page.locator('#fate-card-green-sun').click();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('long-winter-countdown')).toContainText('THE LONG WINTER');
    await expect(page.getByTestId('long-winter-countdown')).toContainText('3,000');
    // Green Sun is a rule rather than an era: nothing is counting down, so
    // there is nothing to put on the bar.
    await expect(page.getByTestId('green-sun-countdown')).toBeHidden();

    // Same subtraction the deck's own timer does, off the same event
    await page.evaluate(() => { window.engine.env.total_ticks += 1200; window.engine.emitChange(true); });
    await expect(page.getByTestId('long-winter-countdown')).toContainText('1,800');

    await expire(page, 'long-winter');
    await expect(page.getByTestId('long-winter-countdown')).toBeHidden();
  });

  test('The card writes reach the sibling Console tab, not just the engine', async ({ page }) => {
    await page.locator('#fate-card-long-night').click();
    await page.locator('#evo-tab-console').click();
    await page.locator('#console-fine-toggle').click();
    // The Console mirrors Hyperparams in React state; onParamsChanged is what
    // stops it showing the pre-card number until something else resyncs it
    await expect(page.locator('#console-lookRange')).toHaveValue('4');
  });
});

/* The Great Cull is the deck's one card that touches bodies rather than the
   rules, and it is only allowed because it is blind: an independent coin flip
   per organism, weighted by nothing about it. */
test.describe('The Great Cull', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('It takes an indiscriminate half and leaves the bodies behind as food', async ({ page }) => {
    /* Seed a population worth culling. Seed Life paints sparsely and caps
       itself at six organisms per paint tick, so it takes a wide brush and a
       spread of anchors to lay down enough bodies for the count below to mean
       anything. */
    await page.locator('#brush-slider').fill('15');
    const before = await page.evaluate(() => {
      const env = window.engine.env;
      const ctl = env.controller;
      for (let i = 0; i < 60; i++) {
        ctl.mouse_c = 6 + Math.floor(Math.random() * (env.num_cols - 12));
        ctl.mouse_r = 6 + Math.floor(Math.random() * (env.num_rows - 12));
        ctl.seedRandomLife();
      }
      return {
        pop: env.organisms.length,
        food: env.grid_map.grid.flat().filter(c => c.state.name === 'food').length,
      };
    });
    expect(before.pop).toBeGreaterThan(20); // otherwise the assertions below say nothing

    await page.locator('#tool-rules').click();
    await page.locator('#evo-tab-fate').click();
    await page.locator('#fate-card-great-cull').click();

    const after = await page.evaluate(() => {
      const env = window.engine.env;
      return {
        pop: env.organisms.length,
        living: env.organisms.filter(o => o.living).length,
        food: env.grid_map.grid.flat().filter(c => c.state.name === 'food').length,
        events: env.active_events.length,
      };
    });
    // A coin flip each: over this many organisms the count lands nowhere near
    // the tails, and the bodies are left where they fell
    expect(after.pop).toBeLessThan(before.pop * 0.85);
    expect(after.pop).toBeGreaterThan(before.pop * 0.15);
    expect(after.living).toBe(after.pop); // the dead are cleared, not left flagged
    expect(after.food).toBeGreaterThan(before.food);
    expect(after.events).toBe(0); // once, immediately — no era to wind back
    await expect(page.getByTestId('hud-notifications')).toContainText('The Great Cull');
  });
});
