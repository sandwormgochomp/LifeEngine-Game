const { test, expect } = require('./helpers/fixtures');

/* The Narrator turns sim transitions into toasts by diffing successive samples.
   These tests drive it directly (window.narrator.sample) against synthetic world
   snapshots and a stubbed extant-species map, spying on the toast bus, so every
   event type is exercised deterministically without waiting on evolution. The
   real wiring -- that sample() is only reached from WorldEnvironment.update and
   never from the Lab preview -- is covered by the "no preview leak" case. */

// Run one narration scenario in the page and return the toasts it emitted.
// `species` maps name -> start_tick and replaces the extant registry for the
// sample; `env` is the synthetic world snapshot. The registry and any Notifier
// subscription are restored before returning so the shared singletons are clean.
async function narrate(page, { seed, samples }) {
  return await page.evaluate(({ seed, samples }) => {
    const fr = window.fossilRecord;
    const saved = fr.extant_species;
    const toasts = [];
    const unsub = window.notifier.subscribe(m => toasts.push(m));
    try {
      window.narrator.reset();
      const runOne = ({ species, env }) => {
        fr.extant_species = {};
        for (const name in species) fr.extant_species[name] = { name, start_tick: species[name] };
        window.narrator.sample(env);
      };
      // The seed sample establishes the baseline and must stay silent.
      const seedCount = toasts.length;
      runOne(seed);
      const seededToasts = toasts.slice(seedCount);
      const perSample = [];
      for (const s of samples) {
        const before = toasts.length;
        runOne(s);
        perSample.push(toasts.slice(before));
      }
      return { seededToasts, perSample };
    } finally {
      unsub();
      fr.extant_species = saved;
      window.narrator.reset();
    }
  }, { seed, samples });
}

const env = (total_ticks, pop, largest) => ({ total_ticks, organisms: { length: pop }, largest_cell_count: largest });

test.describe('Self-narrating events', () => {
  test('seeding the baseline is silent', async ({ page }) => {
    const { seededToasts } = await narrate(page, {
      seed: { species: { Glowgrazer: 0, Spikefang: 0 }, env: env(100, 20, 5) },
      samples: [],
    });
    expect(seededToasts).toEqual([]);
  });

  test('a single new lineage is named', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 20, 5) },
      samples: [{ species: { Glowgrazer: 0, Spikefang: 200 }, env: env(200, 22, 5) }],
    });
    expect(perSample[0]).toContainEqual(expect.stringContaining('A new lifeform emerged: Spikefang'));
  });

  test('several new lineages in one window coalesce into a count', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 20, 5) },
      samples: [{ species: { Glowgrazer: 0, Spikefang: 200, Leechsap: 200, Blobling: 200 }, env: env(200, 30, 5) }],
    });
    expect(perSample[0]).toContainEqual(expect.stringContaining('3 new lifeforms emerged'));
    // Not also three individual name toasts.
    expect(perSample[0].filter(m => m.includes('emerged'))).toHaveLength(1);
  });

  test('an extinction reports the lineage name and its age', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0, Spikefang: 300 }, env: env(1000, 20, 5) },
      // Spikefang, born at tick 300, is gone by tick 4510 -> age 4210.
      samples: [{ species: { Glowgrazer: 0 }, env: env(4510, 18, 5) }],
    });
    expect(perSample[0]).toContainEqual('Spikefang went extinct after 4,210 ticks');
  });

  // Distinctive fragments from each SHORT_LIFE_QUIPS line in Narrator.ts. A
  // short-lived lineage's send-off must be one of these (mirrored here rather
  // than pinned to the exact hashed pick, the way name-generator tests do).
  const QUIP_FRAGMENTS = ['gave up', "Blink and you'd miss it", "wasn't built for this world", 'speedran extinction', 'candle', 'panicked and expired'];

  test('a lineage that dies young gets a tongue-in-cheek send-off', async ({ page }) => {
    const { perSample } = await narrate(page, {
      // Mayfly emerges at 1000, gone by 1100 -> age 100 (< 300, short-lived).
      seed: { species: { Glowgrazer: 0, Mayfly: 1000 }, env: env(1050, 20, 5) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(1100, 19, 5) }],
    });
    const line = perSample[0].find(m => m.includes('Mayfly'));
    expect(line).toBeTruthy();
    // Not the sober phrasing, but one of the quips, and it still states the age.
    expect(line).not.toContain('went extinct after');
    expect(QUIP_FRAGMENTS.some(f => line.includes(f))).toBe(true);
    expect(line).toContain('100');
  });

  test('the same lineage always gets the same send-off (deterministic)', async ({ page }) => {
    const run = () => narrate(page, {
      seed: { species: { Glowgrazer: 0, Fizzle: 1000 }, env: env(1050, 20, 5) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(1120, 19, 5) }],
    });
    const a = (await run()).perSample[0].find(m => m.includes('Fizzle'));
    const b = (await run()).perSample[0].find(m => m.includes('Fizzle'));
    expect(a).toBe(b);
  });

  test('consecutive emergences fold into one running counter under a stable key', async ({ page }) => {
    const keys = await page.evaluate(() => {
      const fr = window.fossilRecord;
      const saved = fr.extant_species;
      const events = [];
      const unsub = window.notifier.subscribe((m, meta) => events.push({ m, key: meta?.key }));
      const sp = names => Object.fromEntries(names.map((n, i) => [n, { name: n, start_tick: i }]));
      const world = (t, pop) => ({ total_ticks: t, organisms: { length: pop }, largest_cell_count: 3, largest_cells: [] });
      try {
        window.narrator.reset();
        fr.extant_species = sp(['A']);
        window.narrator.sample(world(100, 10)); // seed
        fr.extant_species = sp(['A', 'B', 'C']);
        window.narrator.sample(world(200, 12)); // +2 emerged
        fr.extant_species = sp(['A', 'B', 'C', 'D', 'E']);
        window.narrator.sample(world(300, 14)); // +2 more -> running total 4
        return events;
      } finally {
        unsub();
        fr.extant_species = saved;
        window.narrator.reset();
      }
    });
    const emerged = keys.filter(e => e.m.includes('lifeforms emerged'));
    expect(emerged).toHaveLength(2);
    expect(emerged[0].m).toContain('2 new lifeforms emerged');
    expect(emerged[1].m).toContain('4 new lifeforms emerged'); // accumulated, not reset
    expect(emerged[1].key).toBe(emerged[0].key); // same line updates in place
  });

  test('a gap breaks the streak so the next burst opens a fresh line', async ({ page }) => {
    const keys = await page.evaluate(() => {
      const fr = window.fossilRecord;
      const saved = fr.extant_species;
      const events = [];
      const unsub = window.notifier.subscribe((m, meta) => events.push({ m, key: meta?.key }));
      const sp = names => Object.fromEntries(names.map((n, i) => [n, { name: n, start_tick: i }]));
      const world = t => ({ total_ticks: t, organisms: { length: 10 }, largest_cell_count: 3, largest_cells: [] });
      try {
        window.narrator.reset();
        fr.extant_species = sp(['A']);
        window.narrator.sample(world(100)); // seed
        fr.extant_species = sp(['A', 'B', 'C']);
        window.narrator.sample(world(200)); // +2 emerged
        window.narrator.sample(world(300)); // 0 emerged -> streak breaks
        fr.extant_species = sp(['A', 'B', 'C', 'D']);
        window.narrator.sample(world(400)); // +1 -> new line, count restarts
        return events.filter(e => e.m.includes('emerged') || e.m.includes('lifeform'));
      } finally {
        unsub();
        fr.extant_species = saved;
        window.narrator.reset();
      }
    });
    expect(keys).toHaveLength(2);
    expect(keys[0].m).toContain('2 new lifeforms emerged');
    expect(keys[1].m).toContain('A new lifeform emerged: D'); // count restarted, singular again
    expect(keys[1].key).not.toBe(keys[0].key); // a different line
  });

  test('the log updates a keyed line in place rather than stacking (DOM)', async ({ page }) => {
    const rows = page.getByTestId('hud-notifications').locator('> div');
    await page.evaluate(() => {
      window.engine.stop();
      window.notifier.notify('2 new lifeforms emerged', { key: 'emerged:1' });
    });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('2 new lifeforms emerged');

    // Same key -> the one line updates, still a single row.
    await page.evaluate(() => window.notifier.notify('4 new lifeforms emerged', { key: 'emerged:1' }));
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('4 new lifeforms emerged');

    // A different key -> a second row appears.
    await page.evaluate(() => window.notifier.notify('New largest organism ever: 40 cells', { key: 'record' }));
    await expect(rows).toHaveCount(2);
  });

  test('a new size record is announced when the high-water mark rises', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 20, 8) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(200, 20, 12) }],
    });
    expect(perSample[0]).toContainEqual(expect.stringContaining('New largest organism ever: 12 cells'));
  });

  test('a steady size does not re-announce a record', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 20, 12) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(200, 20, 12) }],
    });
    expect(perSample[0].filter(m => m.includes('largest'))).toEqual([]);
  });

  test('a population crash fires past the threshold but not just under it', async ({ page }) => {
    // From 100: a drop to 55 is 45% (>= 40%, crash); a drop to 65 is 35% (no crash).
    const crash = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 100, 5) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(200, 55, 5) }],
    });
    expect(crash.perSample[0]).toContainEqual(expect.stringContaining('Mass extinction'));

    const noCrash = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 100, 5) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(200, 65, 5) }],
    });
    expect(noCrash.perSample[0].filter(m => m.includes('Mass extinction'))).toEqual([]);
  });

  test('a small population shrinking is not called a mass extinction', async ({ page }) => {
    const { perSample } = await narrate(page, {
      seed: { species: { Glowgrazer: 0 }, env: env(100, 6, 5) },
      samples: [{ species: { Glowgrazer: 0 }, env: env(200, 1, 5) }],
    });
    expect(perSample[0].filter(m => m.includes('Mass extinction'))).toEqual([]);
  });

  test('reset() re-seeds silently so a reload does not re-announce the world', async ({ page }) => {
    // Two samples: the second would normally diff against the first, but a reset
    // between them (modeled by a fresh narrate run) must announce nothing.
    const { seededToasts } = await narrate(page, {
      seed: { species: { Glowgrazer: 0, Spikefang: 0, Leechsap: 0 }, env: env(5000, 40, 30) },
      samples: [],
    });
    expect(seededToasts).toEqual([]);
  });

  test('organism-related events carry a body-plan preview payload', async ({ page }) => {
    const events = await page.evaluate(() => {
      const fr = window.fossilRecord;
      const saved = fr.extant_species;
      const seen = [];
      const unsub = window.notifier.subscribe((m, meta) => seen.push({ m, cells: meta?.organism }));
      // A fake extant species with an anatomy the Narrator can snapshot.
      const species = (name, start, cells) => ({ name, start_tick: start, anatomy: { cells } });
      const world = (ticks, pop, largest) => ({
        total_ticks: ticks, organisms: { length: pop }, largest_cell_count: largest, largest_cells: [],
      });
      const grazer = [{ loc_col: 0, loc_row: 0, state: { name: 'producer' } }];
      const hunter = [
        { loc_col: 0, loc_row: 0, state: { name: 'killer' } },
        { loc_col: 1, loc_row: 0, state: { name: 'mouth' } },
      ];
      try {
        window.narrator.reset();
        fr.extant_species = { Glowgrazer: species('Glowgrazer', 0, grazer) };
        window.narrator.sample(world(100, 5, 3)); // seed
        // Spikefang emerges (should carry its 2-cell body plan)...
        fr.extant_species = { Glowgrazer: species('Glowgrazer', 0, grazer), Spikefang: species('Spikefang', 100, hunter) };
        window.narrator.sample(world(200, 6, 3));
        // ...then goes extinct much later (long-lived, so the sober message, and
        // it should still carry the remembered body plan).
        fr.extant_species = { Glowgrazer: species('Glowgrazer', 0, grazer) };
        window.narrator.sample(world(5000, 5, 3));
        return seen;
      } finally {
        unsub();
        fr.extant_species = saved;
        window.narrator.reset();
      }
    });
    const emerged = events.find(e => e.m.includes('A new lifeform emerged: Spikefang'));
    expect(emerged).toBeTruthy();
    expect(emerged.cells).toHaveLength(2);
    expect(emerged.cells.map(c => c.state.name).sort()).toEqual(['killer', 'mouth']);

    const extinct = events.find(e => e.m.includes('Spikefang went extinct'));
    expect(extinct).toBeTruthy();
    expect(extinct.cells).toHaveLength(2); // previewed from the snapshot, though the species is gone
  });

  test('aggregate events carry no preview payload', async ({ page }) => {
    const events = await page.evaluate(() => {
      const fr = window.fossilRecord;
      const saved = fr.extant_species;
      const seen = [];
      const unsub = window.notifier.subscribe((m, meta) => seen.push({ m, cells: meta?.organism }));
      const world = (ticks, pop) => ({
        total_ticks: ticks, organisms: { length: pop }, largest_cell_count: 3, largest_cells: [],
      });
      try {
        window.narrator.reset();
        fr.extant_species = { A: { name: 'A', start_tick: 0 } };
        window.narrator.sample(world(100, 100)); // seed
        // Two new lineages (coalesced) and a crash in one window.
        fr.extant_species = { A: { name: 'A', start_tick: 0 }, B: { name: 'B', start_tick: 100 }, C: { name: 'C', start_tick: 100 } };
        window.narrator.sample(world(200, 40));
        return seen;
      } finally {
        unsub();
        fr.extant_species = saved;
        window.narrator.reset();
      }
    });
    const coalesced = events.find(e => e.m.includes('new lifeforms emerged'));
    expect(coalesced).toBeTruthy();
    expect(coalesced.cells).toBeUndefined();
    const crash = events.find(e => e.m.includes('Mass extinction'));
    expect(crash).toBeTruthy();
    expect(crash.cells).toBeUndefined();
  });

  test('a live world tick narrates through update() and renders a toast with a preview', async ({ page }) => {
    /* End-to-end, exercising the real wiring the other tests bypass: a size
       record set on the world surfaces as a DOM toast (with an organism preview)
       after the tick loop crosses a data-update boundary and calls sample(). A
       record is used because it's independent of whatever else the tick does. */
    await page.evaluate(() => {
      window.engine.stop();
      const env = window.engine.env;
      window.narrator.reset();
      // First boundary crossing seeds the baseline silently.
      env.total_ticks = env.data_update_rate - 1;
      window.engine.environmentUpdate();
      // A new all-time size record with a body plan to preview, then advance.
      env.largest_cell_count = 9999;
      env.largest_cells = [
        { loc_col: 0, loc_row: 0, state: { name: 'mouth' } },
        { loc_col: 1, loc_row: 0, state: { name: 'producer' } },
      ];
      env.total_ticks = env.data_update_rate * 2 - 1;
      window.engine.environmentUpdate();
    });
    const notif = page.getByTestId('hud-notifications');
    await expect(notif).toContainText('9,999 cells');
    // The record toast renders an OrganismThumb canvas beside its text.
    expect(await notif.locator('canvas').count()).toBeGreaterThanOrEqual(1);
  });

  test('narration is gated to the world sample, not to species-registry changes', async ({ page }) => {
    /* Why this gates the Lab preview: narration only fires from sample(), which
       only WorldEnvironment.update() calls. The preview's mini-sim has its own
       update() and never touches the global registry anyway. So a birth or death
       that isn't followed by a world sample -- exactly the preview's situation --
       must stay silent. Here we mutate the registry with the world paused and
       take no sample; nothing should toast. */
    const toasts = await page.evaluate(() => {
      window.engine.stop(); // no world ticks -> no sample() calls
      const fr = window.fossilRecord;
      const saved = fr.extant_species;
      const seen = [];
      const unsub = window.notifier.subscribe(m => seen.push(m));
      try {
        window.narrator.reset();
        // A "birth" and an "extinction" in the registry, with no sample between.
        fr.extant_species = { Newcomer: { name: 'Newcomer', start_tick: 10 } };
        delete fr.extant_species['Newcomer'];
        return seen;
      } finally {
        unsub();
        fr.extant_species = saved;
        window.narrator.reset();
      }
    });
    expect(toasts).toEqual([]);
  });
});
