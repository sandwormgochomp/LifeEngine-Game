const { test, expect, pauseEngine } = require('./helpers/fixtures');

// The bottom-left tool palette is grouped into Terrain / Life / Events tabs.
// Only the active tab's tools render, so switching tabs swaps the tool set.
test.describe('Tool palette tabs', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Tabs swap the visible tool group', async ({ page }) => {
    // Boots on Terrain: its tools are up, the other tabs' are not rendered
    await expect(page.locator('#wall')).toBeVisible();
    await expect(page.locator('#tool-select')).toBeHidden();
    await expect(page.locator('#event-meteor')).toBeHidden();

    await page.locator('#tool-tab-life').click();
    await expect(page.locator('#tool-select')).toBeVisible();
    await expect(page.locator('#wall')).toBeHidden();

    await page.locator('#tool-tab-events').click();
    await expect(page.locator('#event-meteor')).toBeVisible();
    await expect(page.locator('#event-bloom')).toBeVisible();
    await expect(page.locator('#tool-select')).toBeHidden();
  });

  test('Every event in the tab is live', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    for (const id of ['#event-bloom', '#event-iceage', '#event-radstorm', '#event-predator']) {
      await expect(page.locator(id)).toBeEnabled();
    }
  });

  test('An armed tool marks its tab while you browse another', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await page.locator('#event-meteor').click();
    await expect(page.locator('#event-meteor')).toHaveClass(/toolPaletteBtnActive/);

    // Look away to the Terrain tab: the Events tab keeps a marker so the armed
    // tool stays discoverable
    await page.locator('#tool-tab-terrain').click();
    await expect(page.locator('#event-meteor')).toBeHidden();
    await expect(page.locator('#tool-tab-events')).toHaveClass(/toolPaletteTabArmed/);
    await expect(page.locator('#tool-tab-terrain')).not.toHaveClass(/toolPaletteTabArmed/);
  });
});

test.describe('World events', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Meteor falls, then kills organisms in the blast and scatters food', async ({ page }) => {
    const target = await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      const cs = env.grid_map.cell_size;
      return { x: org.c * cs + cs / 2, y: org.r * cs + cs / 2 };
    });
    const foodBefore = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-meteor').click();
    await expect(page.locator('#event-meteor')).toHaveClass(/toolPaletteBtnActive/);
    await page.locator('#env-canvas').click({ position: target });

    // The click launches an animated strike rather than resolving instantly
    expect(await page.evaluate(() => window.engine.env.active_meteors.length)).toBe(1);

    // The blast lands when the fireball does (~0.5s, render-loop driven, so
    // the paused sim doesn't hold it up): the organism under the impact dies
    await expect.poll(() => page.evaluate(() => window.engine.env.organisms[0].living)).toBe(false);
    // ...and its body (plus scatter) left food behind
    const food = await page.evaluate(() =>
      window.engine.env.grid_map.grid.flat().filter(c => c.state.name === 'food').length);
    expect(food).toBeGreaterThan(foodBefore);
  });

  test('Bloom spikes food production, then restores it when the window ends', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();

    const spiked = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      blooms: window.engine.env.active_events.filter(e => e.kind === 'bloom').length,
    }));
    expect(spiked.prob).toBe(base * 3);
    expect(spiked.blooms).toBe(1);

    // Wind the clock to the event's end and tick the scheduler: it restores.
    const restored = await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events.find(e => e.kind === 'bloom').ends_at;
      env.tickWorldEvents();
      return { prob: window.hyperparams.foodProdProb, events: env.active_events.length };
    });
    expect(restored.prob).toBe(base);
    expect(restored.events).toBe(0);
  });

  test('Re-triggering a bloom extends it without stacking the multiplier', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    await page.locator('#event-bloom').click();

    const state = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      blooms: window.engine.env.active_events.filter(e => e.kind === 'bloom').length,
    }));
    // Still one bloom, still a single 3x spike — not 9x
    expect(state.prob).toBe(base * 3);
    expect(state.blooms).toBe(1);
  });

  test('Ice age crashes food production, then restores it when the window ends', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-iceage').click();

    const spiked = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      ages: window.engine.env.active_events.filter(e => e.kind === 'iceage').length,
    }));
    // A famine, not a glut: the same mechanism as the bloom with the
    // multiplier under 1
    expect(spiked.prob).toBeLessThan(base);
    expect(spiked.ages).toBe(1);

    const restored = await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events.find(e => e.kind === 'iceage').ends_at;
      env.tickWorldEvents();
      return { prob: window.hyperparams.foodProdProb, events: env.active_events.length };
    });
    expect(restored.prob).toBe(base);
    expect(restored.events).toBe(0);
  });

  test('An ice age shows a live countdown and frosts the world until it thaws', async ({ page }) => {
    // Cold open: no countdown chip, no frost.
    await expect(page.getByTestId('iceage-countdown')).toBeHidden();
    await expect(page.getByTestId('frost-overlay')).toHaveAttribute('data-frost', 'false');

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-iceage').click();

    // The chip appears with the event's full span on it...
    await expect(page.getByTestId('iceage-countdown')).toBeVisible();
    const full = await page.evaluate(() => {
      const env = window.engine.env;
      return env.active_events.find(e => e.kind === 'iceage').ends_at - env.total_ticks;
    });
    await expect(page.getByTestId('iceage-countdown')).toContainText(full.toLocaleString('en-US'));
    // ...and the frost layer notices the weather (rAF-driven, hence the poll).
    await expect(page.getByTestId('frost-overlay')).toHaveAttribute('data-frost', 'true');

    // Wind the clock forward: the countdown is ends_at - total_ticks, live.
    await page.evaluate(() => {
      window.engine.env.total_ticks += 500;
      window.engine.emitChange(true);
    });
    await expect(page.getByTestId('iceage-countdown')).toContainText((full - 500).toLocaleString('en-US'));

    // Thaw: run the event out and both the chip and the frost stand down.
    await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events.find(e => e.kind === 'iceage').ends_at;
      env.tickWorldEvents();
      window.engine.emitChange(true);
    });
    await expect(page.getByTestId('iceage-countdown')).toBeHidden();
    await expect(page.getByTestId('frost-overlay')).toHaveAttribute('data-frost', 'false');
  });

  /* Every timed event earns a chip, not just the ice age: the band under the
     stats bar is what tells you which pressures the world is currently under
     when you have played several. */
  test('Bloom and a storm each get their own chip, side by side', async ({ page }) => {
    await expect(page.getByTestId('event-tickers')).toBeHidden();

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    await expect(page.getByTestId('bloom-countdown')).toContainText('BLOOM');

    // A second, unrelated event doesn't replace the first — both are running,
    // so both are on the bar.
    await page.locator('#event-radstorm').click();
    await expect(page.getByTestId('bloom-countdown')).toBeVisible();
    await expect(page.getByTestId('radstorm-countdown')).toContainText('RAD STORM');

    // The storm blows itself out; the bloom is untouched and keeps its chip.
    await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events.find(e => e.kind === 'radstorm').ends_at;
      env.tickWorldEvents();
      window.engine.emitChange(true);
    });
    await expect(page.getByTestId('radstorm-countdown')).toBeHidden();
    await expect(page.getByTestId('bloom-countdown')).toBeVisible();
  });

  test('An ice age cancels a running bloom instead of nesting inside it', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    await page.locator('#event-iceage').click();

    const during = await page.evaluate(() => ({
      prob: window.hyperparams.foodProdProb,
      kinds: window.engine.env.active_events.map(e => e.kind),
    }));
    // Only the ice age is left, and it crashed from the pre-bloom baseline —
    // had it captured the spiked value, restoring would leave a permanent glut
    expect(during.kinds).toEqual(['iceage']);
    expect(during.prob).toBeLessThan(base);

    const after = await page.evaluate(() => {
      const env = window.engine.env;
      env.total_ticks = env.active_events[0].ends_at;
      env.tickWorldEvents();
      return window.hyperparams.foodProdProb;
    });
    expect(after).toBe(base);
  });

  test('Saving mid-event stores the real food rate, not the spiked one', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();

    const saved = await page.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.engine.env.serialize()));
      return { onDisk: raw.controls.foodProdProb, live: window.hyperparams.foodProdProb };
    });
    // A save has no event to expire it, so a spiked value written to the file
    // would be a permanent glut. The live world keeps its bloom regardless:
    // saving doesn't call off the weather.
    expect(saved.onDisk).toBe(base);
    expect(saved.live).toBe(base * 3);
  });

  test('Resetting the world winds back an active bloom', async ({ page }) => {
    const base = await page.evaluate(() => window.hyperparams.foodProdProb);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();
    expect(await page.evaluate(() => window.hyperparams.foodProdProb)).toBe(base * 3);

    const after = await page.evaluate(() => {
      window.engine.env.reset(true);
      return { prob: window.hyperparams.foodProdProb, events: window.engine.env.active_events.length };
    });
    expect(after.prob).toBe(base);
    expect(after.events).toBe(0);
  });
});

/* The Rad Storm is the one event that moves: a band of irradiated columns that
   sweeps across the world, tick by tick, rather than a single spike held for a
   window. Driven here by calling tickWorldEvents() directly on a paused engine. */
test.describe('Radiation storm', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#tool-tab-events').click();
  });

  // The storm's currently-held columns, as a sorted array.
  const litColumns = page => page.evaluate(() => {
    const storm = window.engine.env.active_events.find(e => e.kind === 'radstorm');
    return storm ? [...storm.lit].sort((a, b) => a - b) : null;
  });

  test('The front irradiates a band and carries it across the world', async ({ page }) => {
    await page.locator('#event-radstorm').click();

    // It blows in from off the edge, so nothing is irradiated at launch
    expect(await page.evaluate(() => window.engine.env.radiation_map.size)).toBe(0);
    expect(await litColumns(page)).toEqual([]);

    const step = n => page.evaluate(n => {
      for (let i = 0; i < n; i++) window.engine.env.tickWorldEvents();
    }, n);

    await step(40);
    const early = await litColumns(page);
    const rows = await page.evaluate(() => window.engine.env.num_rows);
    // A band, not a line, and every cell of every column it holds
    expect(early.length).toBeGreaterThan(1);
    expect(await page.evaluate(() => window.engine.env.radiation_map.size)).toBe(early.length * rows);

    await step(40);
    const later = await litColumns(page);
    // It moved on: the band travelled far enough to have left its old ground
    expect(Math.min(...later)).not.toBe(Math.min(...early));
    expect(later.some(c => early.includes(c))).toBe(false);
    // ...and the world behind it is clean again
    expect(await page.evaluate(() => window.engine.env.radiation_map.size)).toBe(later.length * rows);
  });

  test('The storm sweeps over hand-painted radiation and leaves it standing', async ({ page }) => {
    // Paint a zone by hand first
    await page.locator('#tool-tab-terrain').click();
    await page.locator('#radiation-drop').click();
    await page.locator('#env-canvas').click({ position: { x: 300, y: 200 } });
    const painted = await page.evaluate(() => [...window.engine.env.radiation_map]);
    expect(painted.length).toBeGreaterThan(0);

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-radstorm').click();

    // Run the front all the way past the far edge and let the event expire
    const after = await page.evaluate(painted => {
      const env = window.engine.env;
      const storm = env.active_events.find(e => e.kind === 'radstorm');
      const span = storm.ends_at - env.total_ticks;
      for (let i = 0; i < span; i++) {
        env.total_ticks++;
        env.tickWorldEvents();
      }
      return {
        events: env.active_events.length,
        remaining: [...env.radiation_map].sort(),
        expected: [...painted].sort(),
      };
    }, painted);

    // The storm expired, taking every cell it laid with it and none of the
    // player's — the whole point of it owning its cells individually
    expect(after.events).toBe(0);
    expect(after.remaining).toEqual(after.expected);
  });

  test('Only one storm sweeps at a time', async ({ page }) => {
    await page.locator('#event-radstorm').click();
    await page.locator('#event-radstorm').click();

    await expect(page.getByTestId('hud-notifications')).toContainText('already sweeping');
    expect(await page.evaluate(() =>
      window.engine.env.active_events.filter(e => e.kind === 'radstorm').length)).toBe(1);
  });

  test('Clear Radiation calls off the storm rather than letting it repaint', async ({ page }) => {
    await page.locator('#event-radstorm').click();
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) window.engine.env.tickWorldEvents();
    });
    expect(await page.evaluate(() => window.engine.env.radiation_map.size)).toBeGreaterThan(0);

    await page.locator('#tool-tab-terrain').click();
    await page.locator('#clear-radiation').click();

    // Cleared, and it stays cleared: a storm left running would re-irradiate
    // the band it is standing on with the very next tick
    const after = await page.evaluate(() => {
      const env = window.engine.env;
      const cleared = env.radiation_map.size;
      for (let i = 0; i < 5; i++) env.tickWorldEvents();
      return { cleared, later: env.radiation_map.size, events: env.active_events.length };
    });
    expect(after.cleared).toBe(0);
    expect(after.later).toBe(0);
    expect(after.events).toBe(0);
  });

  test('Resetting the world winds back a storm in flight', async ({ page }) => {
    await page.locator('#event-radstorm').click();
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) window.engine.env.tickWorldEvents();
    });

    const after = await page.evaluate(() => {
      window.engine.env.reset(true);
      return {
        radiation: window.engine.env.radiation_map.size,
        events: window.engine.env.active_events.length,
      };
    });
    expect(after.radiation).toBe(0);
    expect(after.events).toBe(0);
  });

  test('The smoke overlay is told the map changed even when its size does not', async ({ page }) => {
    await page.locator('#event-radstorm').click();
    // Run the front into the world so it is adding and dropping columns
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.engine.env.tickWorldEvents();
    });

    // A moving front can add one column and drop another in the same step, so
    // radiation_map.size is not a change signal — radiation_version is.
    const moved = await page.evaluate(() => {
      const env = window.engine.env;
      const before = { size: env.radiation_map.size, version: env.radiation_version };
      for (let i = 0; i < 8; i++) env.tickWorldEvents();
      return { before, after: { size: env.radiation_map.size, version: env.radiation_version } };
    });
    expect(moved.after.size).toBe(moved.before.size); // a band of fixed width
    expect(moved.after.version).toBeGreaterThan(moved.before.version);
  });
});

/* The auto-scheduler behind Evolution Controls' "Random world events". Off by
   default: it draws from Math.random, so an unattended world only stays
   reproducible while nothing is scheduled. */
test.describe('Random world events', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Off by default, and silent however long the world runs', async ({ page }) => {
    expect(await page.evaluate(() => window.hyperparams.randomEvents)).toBe(false);

    const fired = await page.evaluate(() => {
      const env = window.engine.env;
      const toasts = [];
      const unsub = window.notifier.subscribe(m => toasts.push(m));
      // Well past several intervals' worth of ticks
      for (let i = 0; i < 6000; i++) {
        env.total_ticks = i;
        env.maybeScheduleRandomEvent();
      }
      unsub();
      return { events: env.active_events.length, meteors: env.active_meteors.length, toasts };
    });
    expect(fired.events).toBe(0);
    expect(fired.meteors).toBe(0);
    expect(fired.toasts).toHaveLength(0);
  });

  test('On, it fires on the interval and nowhere in between', async ({ page }) => {
    const rolls = await page.evaluate(() => {
      const env = window.engine.env;
      window.hyperparams.randomEvents = true;
      window.hyperparams.randomEventInterval = 100;
      const on_interval = [];
      const off_interval = [];
      try {
        for (let tick = 1; tick <= 1000; tick++) {
          env.total_ticks = tick;
          const before = env.active_events.length + env.active_meteors.length;
          env.maybeScheduleRandomEvent();
          const after = env.active_events.length + env.active_meteors.length;
          (tick % 100 === 0 ? on_interval : off_interval).push(after - before);
        }
      } finally {
        window.hyperparams.randomEvents = false;
      }
      return { on_interval, off_interval };
    });
    // Nothing ever fires off the interval...
    expect(rolls.off_interval.every(d => d === 0)).toBe(true);
    // ...and on it, something does — bar the rolls that land on an event
    // already running (a re-triggered bloom extends rather than enqueues)
    expect(rolls.on_interval.filter(d => d > 0).length).toBeGreaterThan(0);
  });

  test('The interval slider only appears once the scheduler is on', async ({ page }) => {
    // Both live in the Console's hazard block, no fold to open
    await page.locator('#tool-rules').click();
    await expect(page.locator('#console-randomEvents')).toBeVisible();
    await expect(page.locator('#console-randomEventInterval')).toBeHidden();

    await page.locator('#console-randomEvents').check();
    await expect(page.locator('#console-randomEventInterval')).toBeVisible();
    expect(await page.evaluate(() => window.hyperparams.randomEvents)).toBe(true);

    // Leave the world as we found it: the scheduler is off by default
    await page.locator('#console-randomEvents').uncheck();
    expect(await page.evaluate(() => window.hyperparams.randomEvents)).toBe(false);
  });
});

/* The Predator event is a two-step: the bestiary arms the release tool with a
   species, and a click in the world drops that species' founding pack there. */
test.describe('Invasive predators', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await page.locator('#tool-tab-events').click();
  });

  // Somewhere with room for a pack: the middle of the dish.
  const dishCenter = page => page.evaluate(() => {
    const map = window.engine.env.grid_map;
    const [c, r] = map.getCenter();
    const cs = map.cell_size;
    return { x: c * cs + cs / 2, y: r * cs + cs / 2 };
  });

  test('The bestiary arms the release tool rather than releasing anything', async ({ page }) => {
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await page.locator('#event-predator').click();
    await expect(page.locator('[data-testid="predator-modal"]')).toBeVisible();
    await page.locator('#predator-ironjaw').click();

    // Picking closes the picker, arms the tool and lights the button — but the
    // world is untouched until a click lands in it.
    await expect(page.locator('[data-testid="predator-modal"]')).toBeHidden();
    await expect(page.locator('#event-predator')).toHaveClass(/toolPaletteActionArmed/);
    const armed = await page.evaluate(() => ({
      mode: window.engine.env.controller.mode,
      pending: window.engine.env.controller.pending_predator?.id,
      organisms: window.engine.env.organisms.length,
    }));
    expect(armed.pending).toBe('ironjaw');
    expect(armed.organisms).toBe(before);
    expect(armed.mode).not.toBe(0);
  });

  test('Clicking the world drops a founding pack that is registered as its own species', async ({ page }) => {
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await page.locator('#event-predator').click();
    await page.locator('#predator-whisperfang').click();
    await page.locator('#env-canvas').click({ position: await dishCenter(page) });

    const after = await page.evaluate(() => {
      const env = window.engine.env;
      const species = Object.values(window.fossilRecord.extant_species)
        .find(s => s.name.startsWith('Whisperfang'));
      return {
        organisms: env.organisms.length,
        population: species?.population,
        // Every founder shares the one species object, and it carries the
        // hand-built body plan (2 killers, 2 mouths, eye, mover, pheromone).
        cells: species?.anatomy?.cells.length,
        killers: species?.cell_counts?.killer,
        pheromone: species?.cell_counts?.pheromone,
      };
    });
    expect(after.organisms).toBe(before + 6);
    expect(after.population).toBe(6);
    expect(after.cells).toBe(7);
    expect(after.killers).toBe(2);
    expect(after.pheromone).toBe(1);
  });

  test('The release announces itself once, not twice', async ({ page }) => {
    await page.locator('#event-predator').click();
    await page.locator('#predator-cinderpod').click();

    // Seed the Narrator against the world as it stands: only a seeded Narrator
    // diffs successive samples, and only a diff can duplicate the announcement.
    await page.evaluate(() => {
      window.narrator.sample(window.engine.env);
      window.__toasts = [];
      window.__unsub = window.notifier.subscribe(m => window.__toasts.push(m));
    });

    await page.locator('#env-canvas').click({ position: await dishCenter(page) });

    const toasts = await page.evaluate(() => {
      window.narrator.sample(window.engine.env); // the sample that would double-announce
      window.__unsub();
      return window.__toasts;
    });
    expect(toasts.filter(t => t.includes('Cinderpod'))).toHaveLength(1);
    expect(toasts.some(t => t.includes('new lifeform'))).toBe(false);
  });

  test('Escape puts the release tool away without releasing', async ({ page }) => {
    const before = await page.evaluate(() => window.engine.env.organisms.length);

    await page.locator('#event-predator').click();
    await page.locator('#predator-hollow-thief').click();
    await page.keyboard.press('Escape');

    const after = await page.evaluate(() => ({
      mode: window.engine.env.controller.mode,
      pending: window.engine.env.controller.pending_predator,
      organisms: window.engine.env.organisms.length,
    }));
    expect(after.mode).toBe(0); // Modes.None
    expect(after.pending).toBe(null);
    expect(after.organisms).toBe(before);
    await expect(page.locator('#event-predator')).not.toHaveClass(/toolPaletteActionArmed/);
  });

  test('A pack with nowhere to land reports it instead of registering an empty species', async ({ page }) => {
    const position = await dishCenter(page);
    const before = await page.evaluate(() => ({
      organisms: window.engine.env.organisms.length,
      species: Object.keys(window.fossilRecord.extant_species).length,
    }));

    // Wall over the drop site with a brush wider than the pack's scatter.
    await page.locator('#tool-tab-terrain').click();
    await page.locator('#brush-slider').fill('15');
    await page.locator('#wall').click();
    await page.locator('#env-canvas').click({ position });

    await page.locator('#tool-tab-events').click();
    await page.locator('#event-predator').click();
    await page.locator('#predator-ironjaw').click();
    await page.locator('#env-canvas').click({ position });

    await expect(page.getByTestId('hud-notifications')).toContainText('No room to release Ironjaw');
    const after = await page.evaluate(() => ({
      species: Object.keys(window.fossilRecord.extant_species).length,
      ironjaws: Object.keys(window.fossilRecord.extant_species).filter(n => n.startsWith('Ironjaw')).length,
    }));
    // A species with no members would sit in the extant registry forever: only
    // a death fossilizes one, and there is nothing here to die.
    expect(after.ironjaws).toBe(0);
    // The wall brush kills what it paints over, so the species count can only
    // have fallen — never risen on a failed release.
    expect(after.species).toBeLessThanOrEqual(before.species);
  });
});
