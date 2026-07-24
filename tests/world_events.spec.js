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

  test('Scaffolded events are present but disabled', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await expect(page.locator('#event-bloom')).toBeEnabled();
    await expect(page.locator('#event-predator')).toBeEnabled();
    for (const id of ['#event-iceage', '#event-radstorm']) {
      await expect(page.locator(id)).toBeDisabled();
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
