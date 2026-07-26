const { test, expect, openEditor, pauseEngine, clickEditorCell } = require('./helpers/fixtures');

/* An explosive death is a two-beat event: the charge is armed when the
   organism dies and only lands FUSE_TICKS later, so the blast can telegraph
   itself first. These cover the ordering from both ends -- the simulation's
   (nothing detonates during the fuse) and the Lab preview's (the organism is on
   screen, intact, before any fire is). */

// The palette in Rendering/ExplosionFx and the explosive cell's own colour.
const FIRE_YELLOW = [255, 234, 0];   // explosion cells, fireball, telegraph core
const FLASH_WHITE = [255, 255, 255]; // flash frame, telegraph rim
const EXPLOSIVE = [255, 107, 0];     // the cell type's body colour

/* Build a lone explosive organism in the Lab, drop it into an emptied world,
   and stand one plain organism well clear of it. The bystander is not scenery:
   a world whose population reaches zero auto-resets, and a reset drops any
   charge still burning -- so without a survivor the fuse would be swept away
   mid-test by a mechanism that has nothing to do with what is being tested. */
async function dropBomb(page) {
  await pauseEngine(page);
  await page.evaluate(() => window.engine.env.reset(false));
  await openEditor(page);
  await page.locator('.cell-type#explosive').click();
  await clickEditorCell(page, 0, 0);
  const at = await page.evaluate(() => {
    const env = window.engine.env;
    const col = Math.floor(env.num_cols / 2);
    const row = Math.floor(env.num_rows / 2);
    env.controller.dropOrganism(window.engine.organism_editor.organism, col, row);
    return { col, row };
  });
  await page.locator('.cell-type#common').click();
  await clickEditorCell(page, 0, 0);
  return await page.evaluate(([col, row]) => {
    const env = window.engine.env;
    env.controller.dropOrganism(window.engine.organism_editor.organism, col + 12, row + 12);
    return { col, row, organisms: env.organisms.length };
  }, [at.col, at.row]);
}

const blastState = page => page.evaluate(() => {
  const env = window.engine.env;
  const b = env.active_blasts[0];
  return {
    blasts: env.active_blasts.length,
    fuse: b ? b.fuse : null,
    age: b ? b.age : null,
    body: b ? b.body.length / 2 : null,
    explosion_cells: env.active_explosions.length,
  };
});

const tick = page => page.evaluate(() => window.engine.env.update());

test.describe('Explosions', () => {
  test('a dying explosive arms a charge that only lands after its fuse', async ({ page }) => {
    const { organisms } = await dropBomb(page);
    expect(organisms).toBe(2);

    // Nothing is armed until something dies.
    expect(await blastState(page)).toMatchObject({ blasts: 0, explosion_cells: 0 });

    await page.evaluate(() => window.engine.env.organisms[0].die());
    // Death arms the charge and captures the body for the telegraph, but lands
    // no damage: the ground is untouched until the fuse runs out.
    const armed = await blastState(page);
    expect(armed.blasts).toBe(1);
    expect(armed.fuse).toBeGreaterThan(0);
    expect(armed.body).toBeGreaterThan(0);
    expect(armed.explosion_cells).toBe(0);

    // Each tick burns one off the fuse, and not one of them detonates.
    let fuse = armed.fuse;
    while (fuse > 1) {
      await tick(page);
      const s = await blastState(page);
      expect(s.fuse, 'the fuse burns down one tick at a time').toBe(fuse - 1);
      expect(s.explosion_cells, 'nothing detonates while the fuse burns').toBe(0);
      fuse = s.fuse;
    }

    // The tick the fuse expires is the one that lands the blast.
    await tick(page);
    const blown = await blastState(page);
    expect(blown.fuse).toBe(0);
    expect(blown.age).toBe(0);
    expect(blown.explosion_cells, 'the blast scorches the ground it lands on').toBeGreaterThan(0);

    // The fireball outlives its detonation for a few ticks of drawing, then the
    // blast is dropped entirely.
    for (let i = 0; i < 20; i++) await tick(page);
    expect((await blastState(page)).blasts).toBe(0);
  });

  /* The dish glass is the world's boundary, not a wall inside it, and every
     other force in the game already knows that: a projectile stops on it
     without damaging it, a killer cell returns off it, Clear Walls refuses to
     clear it. detonate() was the one that did not -- an invincible wall is
     unowned and is not `wall`, so it fell through to the branch that burns
     whatever nobody owns, became an explosion cell, and reverted to empty three
     ticks later. A charge going off near the rim left a permanent hole. */
  test('a blast leaves the petri dish glass alone', async ({ page }) => {
    const { col, row } = await dropBomb(page);

    // Stamp a cell of the dish's own glass two cells from the charge, which is
    // inside the default blast radius of 2. The state is taken off the real
    // rim rather than named, since the tests have no handle on CellStates.
    const before = await page.evaluate(([col, row]) => {
      const env = window.engine.env;
      const glass = env.grid_map.stateAt(0, 0); // the dish's outer void
      env.changeCell(col + 2, row, glass, null);
      return {
        corner: glass.name,
        target: env.grid_map.stateAt(col + 2, row).name,
      };
    }, [col, row]);
    expect(before.corner, 'the origin world is a petri dish').toBe('invincible_wall');
    expect(before.target).toBe('invincible_wall');

    await page.evaluate(() => window.engine.env.organisms[0].die());
    const fuse = (await blastState(page)).fuse;
    for (let i = 0; i < fuse; i++) await tick(page);

    // The charge really did go off -- otherwise the assertion below passes for
    // the wrong reason.
    expect((await blastState(page)).explosion_cells).toBeGreaterThan(0);
    expect(
      await page.evaluate(([col, row]) =>
        window.engine.env.grid_map.stateAt(col + 2, row).name, [col, row]),
      'the glass is still standing where the fireball washed over it',
    ).toBe('invincible_wall');
  });

  test('a blast harms what is standing in it when it lands, not when it is armed', async ({ page }) => {
    const { col, row } = await dropBomb(page);
    // A second plain bystander, this one two cells away: inside the default
    // blast radius of 2, where the far one dropped above is not.
    await page.evaluate(([col, row]) => {
      const env = window.engine.env;
      env.controller.dropOrganism(window.engine.organism_editor.organism, col + 2, row);
    }, [col, row]);
    expect(await page.evaluate(() => window.engine.env.organisms.length)).toBe(3);

    await page.evaluate(() => window.engine.env.organisms[0].die());
    const fuse = (await blastState(page)).fuse;
    for (let i = 0; i < fuse - 1; i++) await tick(page);
    expect(
      await page.evaluate(() => window.engine.env.organisms.filter(o => o.living).length),
      'the bystanders are untouched while the fuse burns',
    ).toBe(2);

    await tick(page);
    expect(
      await page.evaluate(() => window.engine.env.organisms.filter(o => o.living).length),
      'and the one inside the radius dies when the charge actually goes off',
    ).toBe(1);
  });

  /* An `explode` action is the one thing a brain can do that kills its own
     organism mid-update -- Brain.decide calls die() outright, which is how a
     Cinderpod detonates when it is wounded. update() went on regardless, and
     the next thing it does is reproduce(): the corpse bred, and the child's
     addPop() landed on the species die() had just fossilized. What that left
     behind was a species flagged extinct, deleted from the extant registry, and
     carrying a living member -- so the species count, the most-populous lookup
     and the lineage tree all disagreed with the world.

     Only the observation is injected here; it stands in for the eye seeing prey
     a tick earlier, and everything downstream of it is the real path. */
  test('an organism that explodes on its own action does not then breed', async ({ page }) => {
    await pauseEngine(page);
    const out = await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      // A minimal Cinderpod: an eye and a mover so the brain runs at all, an
      // explosive to go off, and a mouth for the brain to react to.
      org.anatomy.loadRaw({ cells: [
        { state: { name: 'eye' },       loc_col: 0, loc_row: -1 },
        { state: { name: 'mover' },     loc_col: 0, loc_row: 0 },
        { state: { name: 'explosive' }, loc_col: 0, loc_row: 1 },
        { state: { name: 'mouth' },     loc_col: 1, loc_row: 0 },
      ] });
      org.updateGrid();
      org.brain.load({ states: [{
        name: 'Critical',
        decisions: { mouth: 10 },
        actions: { mouth: 'explode' },
        transitions: [],
      }] });
      // Fed enough to reproduce, which is the whole point: a corpse with no
      // food would not have reached reproduce() either way.
      org.food_collected = org.foodNeeded() + 5;
      org.brain.observe({ state: { name: 'mouth' }, owner: null, distance: 1, direction: 0 });

      const species = org.species;
      const before = env.organisms.length;
      org.update();
      return {
        living: org.living,
        before,
        after: env.organisms.length,
        blasts: env.active_blasts.length,
        population: species.population,
        extinct: species.extinct,
        in_extant_registry: !!window.fossilRecord.extant_species[species.name],
      };
    });

    // It really did detonate -- the charge is armed and the organism is dead.
    expect(out.living, 'the explode action kills it').toBe(false);
    expect(out.blasts, 'and arms its charge').toBe(1);

    expect(out.after, 'a corpse does not reproduce').toBe(out.before);
    // And the species accounting agrees with the world it describes.
    expect(out.population).toBe(0);
    expect(out.extinct).toBe(true);
    expect(out.in_extant_registry).toBe(false);
  });

  /* The regression this scenario was rebuilt for: the preview used to sit a
     killer next to a single explosive cell, which killed it on the first tick,
     so the popover opened on the aftermath and the organism was never really
     seen. The bomber now has five cells of health to lose first. */
  test('the Lab preview shows the organism before it explodes', async ({ page }) => {
    await openEditor(page);
    await page.locator('.cell-type#explosive').hover();
    await page.locator('[data-testid="cell-preview"]').waitFor();
    const t0 = Date.now();

    // Sample the preview canvas: is the explosive body on screen, and is any
    // fire? Exact colour matches -- every mark the effect makes is a flat fill
    // from one palette, so nothing here has to guess at a threshold.
    const sample = () => page.evaluate(([fire, flash, body]) => {
      const cv = document.querySelector('[data-testid="cell-preview"] canvas');
      const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      const hits = (c) => {
        for (let i = 0; i < data.length; i += 4)
          if (data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2]) return true;
        return false;
      };
      return { fire: hits(fire) || hits(flash), body: hits(body) };
    }, [FIRE_YELLOW, FLASH_WHITE, EXPLOSIVE]);

    /* A little over one full loop of the scenario, so the assertions below can
       be about its *shape* rather than about what happened to be on screen at
       one wall-clock moment -- the preview runs on rAF, and a busy machine can
       hold up its first frames. */
    const frames = [];
    while (Date.now() - t0 < 2200) {
      frames.push({ t: Date.now() - t0, ...await sample() });
      await page.waitForTimeout(45);
    }
    const intact = frames.map(f => f.body && !f.fire);

    expect(frames.some(f => f.fire), 'the preview does explode').toBe(true);
    expect(intact.some(Boolean), 'and shows the organism with no fire on it').toBe(true);

    // The intact organism holds for several sampled frames rather than the
    // single tick it used to get before the killer popped it.
    let run = 0, longest = 0;
    for (const ok of intact) longest = Math.max(longest, run = ok ? run + 1 : 0);
    expect(longest, 'the organism is on screen, whole, for a real beat').toBeGreaterThanOrEqual(3);

    // And that beat comes *before* the fire, not after it: somewhere in the
    // loop an intact frame is followed directly by a burning one.
    const lights = frames.some((f, i) => i > 0 && intact[i - 1] && f.fire);
    expect(lights, 'the organism is seen intact and then goes up').toBe(true);
    // Over a whole loop it is a real share of the runtime, not a flicker.
    expect(intact.filter(Boolean).length / frames.length).toBeGreaterThan(0.15);
  });
});
