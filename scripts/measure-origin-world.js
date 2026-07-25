#!/usr/bin/env node
/* Measure how long the origin world takes to become worth watching.
 *
 *   node scripts/measure-origin-world.js [ticks] [runs]
 *
 * Loads the plain OriginOfLife + petri dish world -- one three-cell organism,
 * exactly what a first-time visitor sees -- and runs it tick by tick, recording
 * the tick at which the founder first divides, the first species that is not
 * the founder's appears, and the first mover species appears. Repeats `runs`
 * times (default 5) because mutation makes every run different, and prints a
 * per-run JSON line plus a summary.
 *
 * This is what EVOLVED_GIVEUP_TICKS in src/components/FirstRunHints.tsx is set
 * from: the third first-run hint waits that many ticks for a new species before
 * giving up, so the budget has to clear the slowest run comfortably. Re-run it
 * if the default Hyperparams (mutation rates especially) change.
 *
 * Replaces scripts/audition-worlds.js, which auditioned all 20 bundled worlds
 * for a first-run "start here" slot that no longer exists -- the first run
 * opens on the origin world like every other run.
 */
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TICKS = Number(process.argv[2]) || 6000;
const RUNS = Number(process.argv[3]) || 5;
const WALL_CAP_MS = 60000;

const ping = url => new Promise(res => http.get(url, r => res(r.statusCode < 400)).on('error', () => res(false)));

/* Ask the OS for a free port rather than picking one: a forgotten dev server
   from an old worktree squatting on a hardcoded port is otherwise an obscure
   30s "engine never became ready" timeout. */
const freePort = () => new Promise(res => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => res(port));
  });
});

(async () => {
  const PORT = await freePort();
  const URL = `http://127.0.0.1:${PORT}/LifeEngine-Game/?floaties=static&firstrun=off`;
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort',
    '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60 && !(up = await ping(URL)); i++)
    await new Promise(r => setTimeout(r, 500));
  if (!up) {
    console.error(`dev server never answered on ${URL}`);
    server.kill();
    process.exit(1);
  }

  const browser = await chromium.launch();
  const results = [];

  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', err => console.error(`[run ${run}] PAGE ERROR: ${err.message}`));
    try {
      await page.goto(URL);
      await page.waitForSelector('div[data-engine-ready="true"]');
      const r = await page.evaluate(({ ticks, wallCap }) => {
        const engine = window.engine;
        engine.stop();
        const env = engine.env;
        const fossil = window.fossilRecord;

        /* A fresh origin world under default controls -- no world file, no
           saved controls. This is the state App.tsx arms the hints on. */
        env.reset();
        const baseline = new Set(env.organisms.map(o => o.species && o.species.name).filter(Boolean));
        const startTick = env.total_ticks;

        let firstDivision = null, firstNewSpecies = null, firstMoverSpecies = null;
        const t0 = performance.now();
        let ran = 0;
        for (; ran < ticks; ran++) {
          engine.environmentUpdate();
          const elapsed = env.total_ticks - startTick;
          if (firstDivision === null && env.organisms.length > 1) firstDivision = elapsed;
          if (firstNewSpecies === null || firstMoverSpecies === null) {
            for (const org of env.organisms) {
              const name = org.species && org.species.name;
              if (!name || baseline.has(name)) continue;
              if (firstNewSpecies === null) firstNewSpecies = elapsed;
              if (firstMoverSpecies === null && org.anatomy.is_mover) firstMoverSpecies = elapsed;
            }
          }
          if (env.organisms.length === 0) break; // extinct: the run is over
          if (firstMoverSpecies !== null) break; // everything we came for
          if (performance.now() - t0 > wallCap) break;
        }
        const wall = performance.now() - t0;

        return {
          firstDivision, firstNewSpecies, firstMoverSpecies,
          endPop: env.organisms.length,
          endSpecies: fossil.numExtantSpecies(),
          extinct: env.organisms.length === 0,
          ticksRan: ran, msPerTick: +(wall / Math.max(1, ran)).toFixed(2),
        };
      }, { ticks: TICKS, wallCap: WALL_CAP_MS });
      r.run = run;
      results.push(r);
      console.log(JSON.stringify(r));
    } catch (e) {
      console.log(JSON.stringify({ run, error: String(e).slice(0, 200) }));
    }
    await page.close();
  }

  await browser.close();
  server.kill();

  // The budget has to clear the slowest run, not the average one.
  const worst = key => {
    const vals = results.map(r => r[key]).filter(v => v !== null && v !== undefined);
    return vals.length === results.length ? Math.max(...vals) : `${Math.max(...vals, 0)} (${results.length - vals.length}/${results.length} never)`;
  };
  console.log(JSON.stringify({
    summary: true, runs: results.length,
    worstFirstDivision: worst('firstDivision'),
    worstFirstNewSpecies: worst('firstNewSpecies'),
    worstFirstMoverSpecies: worst('firstMoverSpecies'),
    extinctions: results.filter(r => r.extinct).length,
  }));
})();
