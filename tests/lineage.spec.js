// Follow-a-lineage: clicking an organism (the Select/sample plumbing) starts
// tracking it and every descendant born afterwards -- the line is highlighted,
// a small card keeps the tally, and toasts narrate births, deaths and the end
// of the line. The tracker lives on the world environment (env.lineage) and is
// fed by the optional OrganismEnv hooks only WorldEnvironment implements.
const { test, expect, pauseEngine } = require('./helpers/fixtures');

// Canvas-relative click position over the first world organism's anchor cell.
async function firstOrganismPosition(page) {
  return await page.evaluate(() => {
    const env = window.engine.env;
    const org = env.organisms[0];
    const cs = env.grid_map.cell_size;
    return { x: org.c * cs + cs / 2, y: org.r * cs + cs / 2 };
  });
}

test.describe('Follow a lineage', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Clicking an organism follows it: persisted focus, card, and a toast', async ({ page }) => {
    const target = await firstOrganismPosition(page);
    // An unarmed left click runs the same sample path as the Select tool.
    await page.locator('#env-canvas').click({ position: target });

    // Focus persists on the live world organism (not just the editor's copy).
    const state = await page.evaluate(() => {
      const env = window.engine.env;
      return {
        following: env.lineage.following,
        alive: env.lineage.alive,
        rootIsWorldOrg: env.lineage.isTracked(env.organisms[0]),
        name: env.lineage.name,
        speciesName: env.organisms[0].species.name,
      };
    });
    expect(state.following).toBe(true);
    expect(state.alive).toBe(1);
    expect(state.rootIsWorldOrg).toBe(true);
    expect(state.name).toBe(state.speciesName);

    // The card is up, titled FOLLOWING, and names the founder's species.
    const card = page.getByTestId('lineage-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('FOLLOWING');
    await expect(card).toContainText(state.name);

    // And the follow announced itself in the event log.
    await expect(page.getByTestId('hud-notifications')).toContainText(
      `Following the ${state.name} line`
    );
  });

  test('Descendants born while following join the tracked line', async ({ page }) => {
    const result = await page.evaluate(() => {
      const env = window.engine.env;
      const founder = env.organisms[0];
      env.followOrganism(founder);
      // Flood the founder with food so reproduce() fires on the next ticks;
      // step the paused sim by hand until a birth lands (placement rolls
      // random directions, so allow a few attempts).
      founder.food_collected = 1000;
      for (let i = 0; i < 300 && env.lineage.born === 0; i++) {
        env.update();
        if (founder.food_collected < 100) founder.food_collected = 1000;
      }
      const l = env.lineage;
      return {
        born: l.born,
        alive: l.alive,
        maxGen: l.max_generation,
        descendantTracked: env.organisms.some(o => o !== founder && l.isTracked(o)),
      };
    });
    expect(result.born).toBeGreaterThanOrEqual(1);
    expect(result.alive).toBeGreaterThanOrEqual(2);
    expect(result.maxGen).toBeGreaterThanOrEqual(1);
    expect(result.descendantTracked).toBe(true);

    const card = page.getByTestId('lineage-card');
    await expect(card).toContainText('BORN');
    await expect(card).toContainText(String(result.born));
    await expect(page.getByTestId('hud-notifications')).toContainText(/descendant was born|born/);
  });

  test('When the last member dies the line ends, and the card says so', async ({ page }) => {
    const state = await page.evaluate(() => {
      const env = window.engine.env;
      const founder = env.organisms[0];
      env.followOrganism(founder);
      founder.die();
      return {
        following: env.lineage.following,
        extinct: env.lineage.extinct,
        alive: env.lineage.alive,
        died: env.lineage.died,
      };
    });
    // The card stays up, frozen at the final tally, until dismissed.
    expect(state.following).toBe(true);
    expect(state.extinct).toBe(true);
    expect(state.alive).toBe(0);
    expect(state.died).toBe(1);

    const card = page.getByTestId('lineage-card');
    await expect(card).toContainText('LINE ENDED');
    await expect(page.getByTestId('hud-notifications')).toContainText('line you were following has ended');
  });

  test('Dismissing the card stops following and releases the highlight', async ({ page }) => {
    const target = await firstOrganismPosition(page);
    await page.locator('#env-canvas').click({ position: target });
    await expect(page.getByTestId('lineage-card')).toBeVisible();

    await page.getByTestId('lineage-card-close').click();
    await expect(page.getByTestId('lineage-card')).toBeHidden();
    const state = await page.evaluate(() => {
      const env = window.engine.env;
      return {
        following: env.lineage.following,
        stillTracked: env.lineage.isTracked(env.organisms[0]),
      };
    });
    expect(state.following).toBe(false);
    expect(state.stillTracked).toBe(false);
  });

  test('A world reset clears the followed line silently', async ({ page }) => {
    const state = await page.evaluate(() => {
      const env = window.engine.env;
      env.followOrganism(env.organisms[0]);
      const toasts = [];
      const unsubscribe = window.notifier.subscribe(m => toasts.push(m));
      try {
        env.reset();
      } finally {
        unsubscribe();
      }
      return { following: env.lineage.following, toasts };
    });
    expect(state.following).toBe(false);
    // Clearing is silent: no "line has ended" for a line wiped with its world.
    expect(state.toasts.filter(m => m.includes('line'))).toHaveLength(0);
    await expect(page.getByTestId('lineage-card')).toBeHidden();
  });

  // Event narration, driven synthetically against the real tracker so ticks
  // (and with them the birth/death toast throttle) are exact. Same shape as
  // narrator.spec.js's synthetic sampling.
  test('Births and deaths narrate with coalescing keys and a tick throttle', async ({ page }) => {
    const log = await page.evaluate(() => {
      const tracker = window.engine.env.lineage;
      const mk = name => ({
        living: true,
        lifetime: 0,
        species: { name },
        anatomy: { cells: [{ loc_col: 0, loc_row: 0, state: { name: 'mouth' } }] },
      });
      const toasts = [];
      const unsubscribe = window.notifier.subscribe((m, meta) => toasts.push({ m, key: meta && meta.key }));
      try {
        const founder = mk('Testling');
        const kids = [mk('Testling'), mk('Testling'), mk('Testling')];
        tracker.follow(founder, 0);
        // Ignored: parent is not part of the followed line.
        tracker.onBirth(mk('Stranger'), mk('Stranger'), 5);
        tracker.onBirth(founder, kids[0], 10); // first birth: announces
        tracker.onBirth(kids[0], kids[1], 20); // inside the 30-tick cooldown: counted, silent
        tracker.onBirth(kids[1], kids[2], 60); // past the cooldown: announces totals
        const counts = { born: tracker.born, maxGen: tracker.max_generation, alive: tracker.alive };
        founder.lifetime = 70;
        tracker.onDeath(founder, 70); // founder send-off, never throttled
        tracker.onDeath(kids[0], 71); // first regular death: announces (the founder's counted too)
        tracker.onDeath(kids[1], 72); // throttled
        tracker.onDeath(kids[2], 100); // last member: the line ends
        return { toasts, counts, extinct: tracker.extinct, endTick: tracker.end_tick };
      } finally {
        unsubscribe();
        tracker.unfollow();
      }
    });

    expect(log.counts).toEqual({ born: 3, maxGen: 3, alive: 4 });
    expect(log.extinct).toBe(true);
    expect(log.endTick).toBe(100);

    const messages = log.toasts.map(t => t.m);
    expect(messages).toEqual([
      'Following the Testling line',
      'Testling line: a descendant was born',
      'Testling line: 3 born, 4 alive',
      'The Testling founder died at 70 ticks old — 3 descendants carry on',
      'Testling line: 2 died, 2 alive',
      'The Testling line you were following has ended — 4 lived over 100 ticks',
    ]);
    // The running lines coalesce (shared keys); the one-off events do not.
    const keys = log.toasts.map(t => t.key);
    expect(keys[1]).toBe('lineage-birth');
    expect(keys[2]).toBe('lineage-birth');
    expect(keys[4]).toBe('lineage-death');
    expect(keys[3]).toBeUndefined();
    expect(keys[5]).toBeUndefined();
  });
});
