#!/usr/bin/env node
/* Audition every bundled world for the first-run "start here" slot.
 *
 *   node scripts/audition-worlds.js [ticks]
 *
 * For each world in public/assets/worlds/_list.json: load it, apply its saved
 * controls, run `ticks` ticks synchronously (default 1800 -- one minute of
 * watching at the default Play speed, 0.5x = 30 ticks/sec) and count what the
 * Narrator would have announced, plus population movement, new-species (and
 * new mover-species) counts, and per-tick cost. Prints one JSON line per
 * world. Used to pick DEMO_WORLD in src/Utils/FirstRun.ts; re-run it if the
 * bundled worlds change. Run the finalists again at 3x the ticks -- the 2026
 * audition's flashiest first-minute worlds turned out to be population
 * bubbles that collapsed in minutes two and three.
 */
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 5199; // clear of the dev server's 3000 so a running one is untouched
const URL = `http://localhost:${PORT}/LifeEngine-Game/?floaties=static&firstrun=off`;
const TICKS = Number(process.argv[2]) || 1800;
const WALL_CAP_MS = 60000; // give up on worlds that can't run in real time anyway

const ping = url => new Promise(res => http.get(url, () => res(true)).on('error', () => res(false)));

(async () => {
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await ping(URL)); i++)
    await new Promise(r => setTimeout(r, 500));

  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/worlds/_list.json'), 'utf8'));
  const browser = await chromium.launch();

  for (const world of list) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', err => console.error(`[${world.value}] PAGE ERROR: ${err.message}`));
    try {
      await page.goto(URL);
      await page.waitForSelector('div[data-engine-ready="true"]');
      const r = await page.evaluate(async ({ value, ticks, wallCap }) => {
        const engine = window.engine;
        engine.stop();
        const raw = await (await fetch(`assets/worlds/${value}.json`)).json();
        engine.env.loadRaw(raw);
        if (raw.controls) window.hyperparams.loadJsonObj(raw.controls);

        const env = engine.env;
        const fossil = window.fossilRecord;
        const startSpecies = new Set(Object.keys(fossil.extant_species));
        const startPop = env.organisms.length;
        const startMovers = env.organisms.filter(o => o.anatomy.is_mover).length;

        const counts = { emerged: 0, extinct: 0, record: 0, crash: 0, other: 0 };
        const unsub = window.notifier.subscribe((msg, meta) => {
          const key = meta && meta.key ? meta.key.split(':')[0] : '';
          if (key === 'emerged') counts.emerged++;
          else if (key === 'extinct') counts.extinct++;
          else if (key === 'record') counts.record++;
          else if (/Mass extinction/.test(msg)) counts.crash++;
          else counts.other++;
        });

        const t0 = performance.now();
        let ran = 0;
        for (; ran < ticks; ran++) {
          engine.environmentUpdate();
          if (performance.now() - t0 > wallCap) break;
        }
        const wall = performance.now() - t0;
        unsub();

        // New species since load, and how many of them are movers -- the
        // "just evolved a mover" hint needs one of these inside a minute.
        let newSpecies = 0, newMoverSpecies = 0;
        for (const [name, s] of Object.entries(fossil.extant_species)) {
          if (startSpecies.has(name)) continue;
          newSpecies++;
          const cells = (s.anatomy && s.anatomy.cells) || [];
          if (cells.some(c => c.state && c.state.name === 'mover')) newMoverSpecies++;
        }

        return {
          startPop, endPop: env.organisms.length,
          startSpecies: startSpecies.size,
          endSpecies: fossil.numExtantSpecies(),
          startMovers, newSpecies, newMoverSpecies, counts,
          ticksRan: ran, msPerTick: +(wall / Math.max(1, ran)).toFixed(2),
        };
      }, { value: world.value, ticks: TICKS, wallCap: WALL_CAP_MS });
      r.value = world.value;
      r.kb = Math.round(fs.statSync(path.join(ROOT, 'public/assets/worlds', `${world.value}.json`)).size / 1024);
      console.log(JSON.stringify(r));
    } catch (e) {
      console.log(JSON.stringify({ value: world.value, error: String(e).slice(0, 200) }));
    }
    await page.close();
  }

  await browser.close();
  server.kill();
})();
