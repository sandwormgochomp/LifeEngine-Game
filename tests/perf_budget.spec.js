const { test, expect } = require('./helpers/fixtures');

/* Performance regression floors. These are smoke-level budgets, not
   benchmarks: thresholds sit far below what a healthy build delivers so they
   only trip on real regressions (re-coupling sim and render, reintroducing a
   quadratic scan, oversubscribing the tick interval), not on machine noise.

   Grounded in measured numbers on the reference machine (2026-07-22):
   fresh world at the old 1x ~60 tps (Play is now 0.5x -> ~30); moderate
   seeded world at the old 4x ~250 tps rendered AND headless (ratio ~1.0 --
   it was 0.34 before the sim/render split); dense world (700+ organisms)
   ~120+ tps headless. The top mode is now 8x, a 480 target the tick budget
   caps well below on loaded worlds.

   Only tick rates are asserted. actual_fps is NOT: headless Chromium's
   software compositor caps canvas-heavy pages near 22fps after the JS
   completes, so frame rate is only meaningful on a headed run. */

// Let the tick-rate window (500ms) turn over a few times, then average a few
// readings so one slow interval firing can't fail the suite.
async function measureTps(page, settleMs = 2000, samples = 3) {
  await page.waitForTimeout(settleMs);
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += await page.evaluate(() => window.engine.actual_tps);
    await page.waitForTimeout(400);
  }
  return sum / samples;
}

// Seed a lattice of the editor's template organism; step controls density.
async function seedWorld(page, step) {
  return await page.evaluate(s => {
    const engine = window.engine;
    engine.stop();
    const env = engine.env;
    let placed = 0;
    for (let c = 4; c < env.num_cols - 4; c += s)
      for (let r = 4; r < env.num_rows - 4; r += s)
        if (env.controller.dropOrganism(engine.organism_editor.organism, c, r)) placed++;
    return placed;
  }, step);
}

const setSpeed = (page, i) => page.evaluate(si => window.engine.setSpeedIndex(si), i);
const toggleHeadless = (page) => page.evaluate(() =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })));
const orgCount = (page) => page.evaluate(() => window.engine.env.organisms.length);

test.describe('Performance budgets', () => {
  test('Play (0.5x) runs the sim at half rate, and only half rate', async ({ page }) => {
    test.setTimeout(30000);
    // Fresh world at the default speed: the user-facing "the game runs at
    // its advertised rate" floor.
    await setSpeed(page, 1);
    const tps = await measureTps(page);
    // Floor: a healthy build reads ~30. Ceiling: a fractional-carry bug that
    // rounds 0.5 up to a tick every firing would read ~60, so overshoot
    // fails too.
    expect(tps, `0.5x tick rate was ${tps.toFixed(0)}/s`).toBeGreaterThan(25);
    expect(tps, `0.5x tick rate was ${tps.toFixed(0)}/s`).toBeLessThan(40);
  });

  test('Rendering stays decoupled from the sim loop', async ({ page }) => {
    test.setTimeout(30000);
    /* Structural invariant, independent of machine speed and world load: the
       render loop runs on requestAnimationFrame (display-rate, ~60/s at
       most), so at 8x the frame rate must be a small fraction of the tick
       rate. The pre-split engine rendered once per tick -- fps equalled tps
       (~220/~220) -- so a re-coupling regression reads ~1.0 here and fails.
       A healthy build reads ~0.25 or less (60 fps vs 250+ tps). */
    await setSpeed(page, 3);
    const tps = await measureTps(page); // also lets the fps window settle
    const fps = await page.evaluate(() => window.engine.actual_fps);
    expect(tps).toBeGreaterThan(100); // 8x must actually multiply ticks
    const ratio = fps / tps;
    expect(
      ratio,
      `at 8x: ${fps.toFixed(0)} fps vs ${tps.toFixed(0)} tps (ratio ${ratio.toFixed(2)}) -- fps tracking tps means render re-coupled to the tick`
    ).toBeLessThan(0.5);
  });

  test('A dense world keeps a usable headless tick rate', async ({ page }) => {
    test.setTimeout(30000);
    /* Absolute floor with a big population -- the scenario where a
       reintroduced quadratic scan (pheromones were one) collapses the tick
       rate. Reference machine: ~120+ tps at 700+ organisms; threshold at 40
       tolerates a much slower machine while still catching a collapse. */
    const seeded = await seedWorld(page, 5);
    expect(seeded).toBeGreaterThan(200);

    await toggleHeadless(page);
    await setSpeed(page, 3);
    const tps = await measureTps(page, 2500);
    const orgs = await orgCount(page);
    expect(
      tps,
      `dense world (${orgs} organisms) ticked at ${tps.toFixed(0)}/s headless`
    ).toBeGreaterThan(40);
  });
});
