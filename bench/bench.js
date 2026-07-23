#!/usr/bin/env node
/* LifeEngine benchmark harness.
 *
 *   npm run bench
 *
 * Appends one JSON line per run to bench/results.jsonl (committed, so the
 * history tracks the repo) and reports each metric against the median of up
 * to the last ten runs on the same machine -- the drift detector the
 * pass/fail floors in tests/perf_budget.spec.js are too coarse to be.
 *
 * Measurement design -- the ecology is random, so anything sampled from a
 * live evolving world varies wildly between runs. Costs are therefore
 * measured as fixed work from a fixed start instead:
 *
 * - live rates (tps, fps/tps): sampled from the real loops on a fresh world.
 *   These are stable because they saturate at their targets.
 * - sim cost: a lattice of a pinned organism (the bundled hunter preset,
 *   eyes removed so nothing hibernates) is seeded, then N ticks are run
 *   synchronously and timed. Identical starting state every run.
 * - render cost: each pass (dirty cells, decorations, glow) is invoked
 *   directly and timed on the exact seeded lattice BEFORE any tick runs, so
 *   the workload is the same organisms in the same places every time.
 *
 * Absolute fps is never recorded: headless Chromium's software compositor
 * caps canvas-heavy pages near 22fps after the JS completes. Results are
 * machine-specific (the cpu field says which); compare within one machine.
 */
const { chromium } = require('@playwright/test');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(__dirname, 'results.jsonl');
const URL = 'http://localhost:3000/?floaties=static';
const HISTORY_WINDOW = 10; // prior runs each metric is compared against
const DRIFT_WARN = 0.15;   // default fraction worse than the median that flags
const SIM_TICKS = 2000;    // fixed sim workload
const RENDER_PASSES = 60;  // fixed render workload iterations

/* Metrics that participate in drift reporting: the direction that is an
 * improvement, and an optional per-metric warn fraction where the measured
 * run-to-run noise is wider than the 15% default (small-absolute-value
 * buckets wobble ±20% between healthy runs). Everything else in the record
 * is context. */
const TRACKED = {
  /* Keys carry the mode's multiplier so a ladder retune (1x/4x -> 0.5x/8x
   * on 2026-07-22) starts a fresh history instead of reading the new target
   * as a regression against the old one's median. */
  'live.tps_halfx': { better: 'higher' },
  'live.tps_8x': { better: 'higher' },
  'live.fps_tps_ratio_8x': { better: 'lower' },
  'sim.us_per_org_tick': { better: 'lower', warn: 0.35 }, // coarse aggregate; the bucket metrics below are the precise detectors
  'sim.org_cells_us_per_org': { better: 'lower', warn: 0.35 },
  'sim.org_move_us_per_org': { better: 'lower', warn: 0.25 },
  'sim.pheromone_us_per_org': { better: 'lower', warn: 0.25 },
  'render.cells_pass_ms': { better: 'lower' },
  'render.deco_pass_ms': { better: 'lower' },
  'render.glow_pass_ms': { better: 'lower' },
  'render.deco_us_per_org': { better: 'lower' },
};

const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const ping = url => new Promise(res => http.get(url, () => res(true)).on('error', () => res(false)));

async function withServer(fn) {
  let server = null;
  if (!(await ping(URL))) {
    server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await ping(URL)); i++)
      await new Promise(r => setTimeout(r, 500));
  }
  try {
    return await fn();
  } finally {
    if (server) server.kill();
  }
}

// Fresh page per scenario so no scenario inherits another's world.
async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  await page.waitForSelector('div[data-engine-ready="true"]');
  return page;
}

/* Seed a lattice of the bundled hunter preset with its eyes removed. Movers
 * exercise movement and the deco rotation cache, killers deal damage so
 * pheromone broadcasts fire. The eyes go because a mover with eyes gets a
 * brain, and brains hibernate whenever nothing is in sight -- eyeless movers
 * move every tick, so the workload is the same every run. */
const seedWorld = (page, step) => page.evaluate(async s => {
  const engine = window.engine;
  engine.stop();
  // Relative like the app's own asset fetches: a root-absolute path misses
  // vite's /LifeEngine-Game/ base (page URLs only work via the / redirect)
  const preset = await (await fetch('assets/organisms/hunter.json')).json();
  preset.anatomy.cells = preset.anatomy.cells.filter(c => c.state.name !== 'eye');
  engine.organism_editor.loadRawOrg(preset);
  const env = engine.env;
  let placed = 0;
  for (let c = 4; c < env.num_cols - 4; c += s)
    for (let r = 4; r < env.num_rows - 4; r += s)
      if (env.controller.dropOrganism(engine.organism_editor.organism, c, r)) placed++;
  return placed;
}, step);

// Median of the always-on tick rate over ~2.5s of real loop time.
async function liveTps(page) {
  await page.waitForTimeout(1500);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    samples.push(await page.evaluate(() => window.engine.actual_tps));
    await page.waitForTimeout(400);
  }
  return median(samples);
}

async function run() {
  const browser = await chromium.launch();
  const scenarios = {};

  // 1. Live loop rates on a fresh world: is the machinery hitting targets?
  {
    const page = await freshPage(browser);
    await page.evaluate(() => window.engine.setSpeedIndex(1)); // Play, 0.5x
    const tpsHalf = await liveTps(page);
    await page.evaluate(() => window.engine.setSpeedIndex(3)); // Faster, 8x
    const tps8 = await liveTps(page);
    const fps = await page.evaluate(() => window.engine.actual_fps);
    scenarios.live = {
      tps_halfx: +tpsHalf.toFixed(1),
      tps_8x: +tps8.toFixed(1),
      fps_tps_ratio_8x: tps8 > 0 ? +(fps / tps8).toFixed(3) : null,
    };
    await page.close();
  }

  // 2. Sim cost, two phases from the identical seeded lattice.
  {
    const page = await freshPage(browser);
    const seeded = await seedWorld(page, 5);
    const m = await page.evaluate(n => {
      const engine = window.engine;
      /* Phase 1 -- per-bucket costs over the FIRST 120 ticks (the Perf ring
         size, so the snapshot covers exactly this window). From an identical
         lattice, 120 ticks leave the ecology no room to diverge and the
         population near the seeded count, which keeps the per-organism
         numbers repeatable; a longer probed window would report whatever
         random ecosystem the run drifted into.

         Every organism is pre-damaged (1 point against the hunter's 4 cells
         of health -- nothing dies) so all of them broadcast pheromones every
         tick: combat damage is burst-random, and letting it drive the
         pheromone bucket made that metric swing ±65% run to run. This turns
         it into a fixed, maximal workload instead. */
      for (const org of engine.env.organisms) org.damage = 1;
      window.perf.setEnabled(true);
      for (let i = 0; i < 120; i++) engine.environmentUpdate();
      const snap = window.perf.snapshot();
      window.perf.setEnabled(false);
      /* Phase 2 -- raw throughput over a longer run, probes off. Tick cost
         scales with the living population, and how fast the seeded lattice
         decays varies run to run, so raw ms/tick inherits the decay curve's
         randomness (measured ±25%). Summing the population every tick and
         normalizing to organism-ticks cancels that to first order. */
      let org_ticks = 0;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        engine.environmentUpdate();
        org_ticks += engine.env.organisms.length;
      }
      const total = performance.now() - t0;
      return { total, org_ticks, snap, orgs_end: engine.env.organisms.length };
    }, SIM_TICKS);
    const perOrgUs = key => (m.snap[key] ? +((m.snap[key].avg * 1000) / seeded).toFixed(2) : null);
    scenarios.sim = {
      seeded,
      orgs_end: m.orgs_end,
      ms_per_tick: +(m.total / SIM_TICKS).toFixed(3), // context; decay-curve noisy
      us_per_org_tick: m.org_ticks > 0 ? +((m.total * 1000) / m.org_ticks).toFixed(2) : null,
      org_cells_us_per_org: perOrgUs('org_cells'),
      org_move_us_per_org: perOrgUs('org_move'),
      pheromone_us_per_org: perOrgUs('pheromone'),
    };
    await page.close();
  }

  // 3. Render cost: each pass timed directly on the untouched seeded
  //    lattice -- zero ticks run, so the workload is byte-identical.
  {
    const page = await freshPage(browser);
    const seeded = await seedWorld(page, 5);
    const m = await page.evaluate(iters => {
      const env = window.engine.env;
      const runPass = (prep, pass) => {
        const times = [];
        // one unmeasured warm-up builds sprite caches and JIT-warms the path
        prep(); pass();
        for (let i = 0; i < iters; i++) {
          prep();
          const t = performance.now();
          pass();
          times.push(performance.now() - t);
        }
        times.sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)];
      };
      const dirtyAllOrganismCells = () => {
        for (const org of env.organisms)
          for (const bc of org.anatomy.cells) {
            const cell = org.getRealCell(bc);
            if (cell) env.renderer.addToRender(cell);
          }
      };
      return {
        cells: runPass(dirtyAllOrganismCells, () => env.renderer.renderCells()),
        deco: runPass(
          () => { env.deco_dirty = true; env.last_deco_repaint = 0; },
          () => env.renderDecorations()
        ),
        glow: runPass(
          () => { env.glow_dirty = true; env.last_glow_repaint = 0; },
          () => env.renderGlow()
        ),
      };
    }, RENDER_PASSES);
    scenarios.render = {
      seeded,
      cells_pass_ms: +m.cells.toFixed(3),
      deco_pass_ms: +m.deco.toFixed(3),
      glow_pass_ms: +m.glow.toFixed(3),
      deco_us_per_org: seeded > 0 ? +((m.deco * 1000) / seeded).toFixed(2) : null,
    };
    await page.close();
  }

  await browser.close();
  return scenarios;
}

function gitDescribe() {
  try {
    return execSync('git describe --always --dirty', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function loadHistory() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs.readFileSync(RESULTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

const flatten = record => {
  const out = {};
  for (const [scen, metrics] of Object.entries(record.scenarios || {}))
    for (const [k, v] of Object.entries(metrics))
      if (typeof v === 'number') out[`${scen}.${k}`] = v;
  return out;
};

function report(record, history) {
  const prior = history
    .filter(h => h.cpu === record.cpu)
    .slice(-HISTORY_WINDOW)
    .map(flatten);
  const current = flatten(record);

  console.log(`\n${'metric'.padEnd(30)} ${'now'.padStart(9)} ${'median'.padStart(9)} ${'delta'.padStart(8)}`);
  let warned = false;
  for (const [key, spec] of Object.entries(TRACKED)) {
    const now = current[key];
    if (now == null) continue;
    const past = prior.map(p => p[key]).filter(v => v != null);
    if (!past.length) {
      console.log(`${key.padEnd(30)} ${String(now).padStart(9)} ${'--'.padStart(9)} ${'first'.padStart(8)}`);
      continue;
    }
    const med = median(past);
    const delta = med !== 0 ? (now - med) / med : 0;
    const warn = spec.warn ?? DRIFT_WARN;
    const worse = spec.better === 'higher' ? delta < -warn : delta > warn;
    const better = spec.better === 'higher' ? delta > warn : delta < -warn;
    const mark = worse ? '  << REGRESSED' : better ? '  (improved)' : '';
    if (worse) warned = true;
    console.log(
      `${key.padEnd(30)} ${String(now).padStart(9)} ${String(+med.toFixed(3)).padStart(9)} ` +
      `${((delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + '%').padStart(8)}${mark}`
    );
  }
  console.log(`\ncontext: ${record.commit} · ${record.cpu}`);
  console.log(`  sim: ${record.scenarios.sim.seeded} seeded -> ${record.scenarios.sim.orgs_end} after ${SIM_TICKS} ticks` +
    ` · render: ${record.scenarios.render.seeded} organisms`);
  if (warned)
    console.log(`\n⚠ one or more metrics regressed past their threshold vs the last ${prior.length} run(s).` +
      `\n  Re-run to rule out a busy machine; if it persists, profile with the in-game panel (P).`);
  return warned;
}

(async () => {
  const scenarios = await withServer(run);
  const record = {
    ts: new Date().toISOString(),
    commit: gitDescribe(),
    cpu: os.cpus()[0]?.model || 'unknown',
    node: process.version,
    scenarios,
  };
  const history = loadHistory();
  const warned = report(record, history);
  fs.appendFileSync(RESULTS, JSON.stringify(record) + '\n');
  console.log(`\nrecorded to ${path.relative(ROOT, RESULTS)} (${history.length + 1} runs total)`);
  process.exit(warned ? 1 : 0);
})();
