const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* Clickable notifications: a toast that names something is a way to get to it.
   The engine attaches a NotificationFocus describing *what to look for*, and
   the HUD resolves it against the live world at click time -- so these drive
   the resolver through window.notifier rather than waiting for the Narrator to
   fire on its own schedule, except where the real producer is the point.

   Everything runs paused: the camera assertions would otherwise race a world
   that keeps moving the organism they just centred on. */

// Where the world cell (col,row) currently sits on screen, in page coordinates.
// The same mapping FirstRunHints uses to anchor its labels.
const screenPosOf = (page, col, row) => page.evaluate(({ col, row }) => {
  const env = window.engine.env;
  const cam = env.overlayCamera();
  const cs = env.grid_map.cell_size;
  return {
    x: cam.ox + (col + 0.5) * cs * cam.s,
    y: cam.oy + (row + 0.5) * cs * cam.s,
  };
}, { col, row });

/* The middle of the viewport, in the same space overlayCamera() maps into --
   which is the *container*, not the canvas. The canvas carries the pan/zoom
   transform, so its own bounding rect moves with the camera and would make any
   centring assertion trivially true. */
const viewportCentre = page => page.evaluate(() => {
  const cont = window.engine.env.container;
  return { x: cont.clientWidth / 2, y: cont.clientHeight / 2 };
});

test.describe('Clicking a notification', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  /* The headline case. A meteor's crater does not move, so its toast carries a
     fixed cell -- and clicking it has to land that cell in the middle of the
     viewport, not merely change the camera numbers. */
  test('A meteor toast takes the camera to the crater', async ({ page }) => {
    const before = await page.evaluate(() => {
      const c = window.engine.env.controller;
      return { pan_x: c.pan_x, pan_y: c.pan_y, scale: c.scale };
    });

    // Aim well away from centre, so a camera that did nothing would fail
    const target = { col: 12, row: 14 };
    await page.evaluate(({ col, row }) => window.engine.env.meteorStrike(col, row, 4), target);

    const toast = page.locator('[data-testid="hud-notifications"] button');
    await expect(toast).toContainText('Meteor incoming');
    await toast.click();

    const after = await page.evaluate(() => {
      const c = window.engine.env.controller;
      return { pan_x: c.pan_x, pan_y: c.pan_y, scale: c.scale };
    });
    expect(after).not.toEqual(before);
    // Never zooms out; the floor is what makes a centred subject legible
    expect(after.scale).toBeGreaterThanOrEqual(before.scale);

    const [landed, centre] = await Promise.all([
      screenPosOf(page, target.col, target.row),
      viewportCentre(page),
    ]);
    expect(Math.abs(landed.x - centre.x)).toBeLessThan(2);
    expect(Math.abs(landed.y - centre.y)).toBeLessThan(2);
  });

  /* A species focus is resolved live, so a name with something still alive
     walks the camera to a member and starts following the line -- the cyan
     tint is what makes a centred organism findable once it lands. */
  test('A species toast follows a living member of that line', async ({ page }) => {
    const name = await page.evaluate(() => {
      const org = window.engine.env.organisms.find(o => o.living && o.species);
      return org.species.name;
    });

    await page.evaluate(n => window.notifier.notify(`A new lifeform emerged: ${n}`, {
      focus: { kind: 'species', name: n },
    }), name);

    await page.locator('[data-testid="hud-notifications"] button').click();

    const followed = await page.evaluate(() => {
      const env = window.engine.env;
      const root = env.lineage.root;
      return { following: env.lineage.following, name: root && root.species && root.species.name };
    });
    expect(followed.following).toBe(true);
    expect(followed.name).toBe(name);
  });

  /* The same descriptor, with nothing left alive. It must not dead-end: the
     picker is where a finished lineage went, and it has to actually contain
     it -- LifeformsModal lists extant species, so this is the path that pulls
     the name back out of the fossil record. */
  test('An extinct species toast opens the picker on it, recovered from the record', async ({ page }) => {
    /* Fossilize a real species by killing off everything that carries it.
       die() is what reaches decreasePop -> fossilize, so the bodies are
       deliberately left in env.organisms: clearDeadOrganisms() is what would
       empty the world and trip auto-reset, re-seeding it and wiping the very
       registry this is about to read. Leaving them also exercises the resolver's
       `living` check, since a dead organism is still in the array.

       min_discard is the record's own "was this lineage worth keeping" gate,
       which a world this young has not had time to clear. Not what is under
       test here. */
    const name = await page.evaluate(() => {
      const env = window.engine.env;
      window.fossilRecord.min_discard = 0;
      const org = env.organisms.find(o => o.living && o.species);
      const species_name = org.species.name;
      for (const o of [...env.organisms]) {
        if (o.species && o.species.name === species_name) o.die();
      }
      window.engine.emitChange(true);
      return species_name;
    });
    expect(await page.evaluate(n => !!window.fossilRecord.extinct_species[n], name)).toBe(true);

    await page.evaluate(n => window.notifier.notify(`The ${n} line went extinct`, {
      focus: { kind: 'species', name: n },
    }), name);
    await page.locator('[data-testid="hud-notifications"] button').click();

    await expect(page.getByTestId('lifeforms-modal')).toBeVisible();
    const card = page.locator(`[data-highlight="true"]`);
    await expect(card).toContainText(name);
    await expect(card).toHaveAttribute('data-extinct', 'true');
  });

  /* A running era has no location, so it falls through to the window that
     lists it -- and opens on the deck, not the Console the player would then
     have to navigate away from. */
  test('An era toast opens the evolution window on the Fate Deck', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await page.locator('#event-bloom').click();

    await page.locator('[data-testid="hud-notifications"] button').filter({ hasText: 'Bloom' }).click();

    await expect(page.locator('#evo-tab-fate')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid="fate-deck"]')).toBeVisible();
  });

  /* The rad storm is the one event that moves, so its toast names the event
     rather than a coordinate: the camera has to go where the front has got to
     by click time, not where it entered the world. */
  test('A storm toast follows the front, not where it started', async ({ page }) => {
    await page.locator('#tool-tab-events').click();
    await page.locator('#event-radstorm').click();

    const start = await page.evaluate(() => Math.round(
      window.engine.env.active_events.find(e => e.kind === 'radstorm').front));
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) window.engine.env.tickWorldEvents();
    });
    const moved = await page.evaluate(() => Math.round(
      window.engine.env.active_events.find(e => e.kind === 'radstorm').front));
    expect(moved).not.toBe(start);

    await page.locator('[data-testid="hud-notifications"] button')
      .filter({ hasText: 'Radiation storm' }).click();

    const [atFront, centre] = await Promise.all([
      screenPosOf(page, moved, await page.evaluate(() => Math.floor(window.engine.env.num_rows / 2))),
      viewportCentre(page),
    ]);
    expect(Math.abs(atFront.x - centre.x)).toBeLessThan(2);
  });

  /* Most toasts have nowhere to go and must stay what they always were. A
     confirmation rendered as a button would promise an action it does not have
     -- and would swallow the canvas clicks that pass through the log today. */
  test('A toast with nowhere to go stays inert', async ({ page }) => {
    await page.locator('#tool-tab-terrain').click();
    await page.locator('#clear-walls').click();

    const log = page.getByTestId('hud-notifications');
    await expect(log).toContainText('Walls cleared');
    await expect(log.locator('button')).toHaveCount(0);
  });
});

/* The log clears itself after a spell with no new events, which is fine while
   nothing can be clicked and hostile the moment something can: six seconds is
   easily long enough to reach for a line and have it vanish under the cursor.
   The guard sits on the actionable rows, since the panel itself takes no
   pointer events at all. */
test.describe('The idle clear and the cursor', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('Hovering an actionable line holds the log open, and leaving lets it go', async ({ page }) => {
    // Two full 6s idle windows have to elapse in one test, which does not fit
    // the suite's 15s default.
    test.setTimeout(30000);

    await page.evaluate(() => window.notifier.notify('Holding still', {
      focus: { kind: 'panel', panel: 'stats' },
    }));
    const log = page.getByTestId('hud-notifications');
    const row = log.locator('button');
    await expect(row).toBeVisible();

    await row.hover();
    // Well past IDLE_CLEAR_MS (6s) -- a log that still clears on a timer it
    // armed before the hover would be gone by now.
    await page.waitForTimeout(7500);
    await expect(log).toBeVisible();

    // Leaving re-arms it, and it goes on its own
    await page.mouse.move(10, 10);
    await expect(log).toBeHidden({ timeout: 9000 });
  });
});
