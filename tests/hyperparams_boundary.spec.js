const fs = require('fs');
const path = require('path');
const { test, expect, openPanel, pauseEngine } = require('./helpers/fixtures');

const WORLDS_DIR = path.join(__dirname, '..', 'public', 'assets', 'worlds');
const worldList = JSON.parse(fs.readFileSync(path.join(WORLDS_DIR, '_list.json'), 'utf8'));

const controlsOf = value =>
  JSON.parse(fs.readFileSync(path.join(WORLDS_DIR, `${value}.json`), 'utf8')).controls;

/* Hyperparams.loadJsonObj is the one door every untrusted parameter blob comes
   through: a bundled world's `controls`, a saved world's, and the evolution
   window's own Load button. What arrives is whatever was on disk, and the
   bundled corpus is not clean -- sixteen of the twenty-two worlds store
   numbers as JSON strings ("50", ".7", a 75-digit lifespan), written by a
   settings UI that passed input.value straight through years ago.

   The declared types say those fields are numbers, so every reader treats them
   as numbers. The dials call value.toFixed. */
test.describe('Evolution controls survive the world corpus', () => {
  // The crash, by the route a player hits it: load Chains, whose controls
  // carry foodProdProb as the string "50", then open the window. The Console
  // renders three PixelDials, and the first thing a dial does with its value
  // is Number(value.toFixed(3)) for aria-valuenow -- so the whole window went
  // down with "value.toFixed is not a function" and left an empty modal.
  test('a world with string-typed controls opens the evolution window', async ({ page }) => {
    const crashes = [];
    page.on('pageerror', e => crashes.push(e.message));

    await pauseEngine(page);
    await openPanel(page, 'save');
    await page.locator('.world-card[data-world="Chains"]').click();
    await expect(page.getByTestId('worlds-modal')).toBeHidden({ timeout: 15000 });

    await openPanel(page, 'rules');
    await expect(page.getByTestId('evolution-console')).toBeVisible();

    // The dial rendered, and reads the value the world asked for as a number
    await expect(page.locator('#dial-abundance')).toHaveAttribute('aria-valuenow', '50');
    expect(crashes).toEqual([]);
  });

  /* Every bundled world, against the invariant rather than against a list of
     the ones that happen to be dirty today: whatever `controls` holds on disk,
     what lands on the singleton matches the type the field declares. Fed
     straight to loadJsonObj rather than by loading each world, because this is
     about the parameter boundary and rebuilding twenty-two grids to reach it
     would make the slowest spec in the suite out of the cheapest check. */
  test('every bundled world lands its controls as the declared types', async ({ page }) => {
    const shape = await page.evaluate(() =>
      Object.fromEntries(Object.entries(window.hyperparams)
        .filter(([, v]) => typeof v !== 'function')
        .map(([k, v]) => [k, Array.isArray(v) ? 'array' : typeof v])));

    for (const { value } of worldList) {
      const controls = controlsOf(value);
      if (!controls) continue;

      const landed = await page.evaluate((c) => {
        window.hyperparams.loadJsonObj(c);
        return Object.fromEntries(Object.entries(window.hyperparams)
          .filter(([, v]) => typeof v !== 'function')
          .map(([k, v]) => [k, Array.isArray(v) ? 'array' : typeof v]));
      }, controls);

      expect(landed, `${value} put a wrong-typed value on the singleton`).toEqual(shape);
    }
  });

  /* Four bundled worlds (the Computer family, and ComputerZoo) nest an entire
     save under `controls` -- grid, organisms, fossil_record and a second
     `controls` inside it. Those keys are not parameters, and used to be
     assigned onto the singleton anyway, hanging a whole grid off the object
     every reader in the engine consults. */
  test('a nested save under controls leaves no non-parameter keys behind', async ({ page }) => {
    const before = await page.evaluate(() => Object.keys(window.hyperparams).sort());

    await page.evaluate(() => window.hyperparams.loadJsonObj({
      foodProdProb: 12,
      grid: { cols: 10, rows: 10 },
      organisms: [1, 2, 3],
      fossil_record: {},
      controls: { foodProdProb: 99 },
      total_ticks: 5,
    }));

    const after = await page.evaluate(() => Object.keys(window.hyperparams).sort());
    expect(after).toEqual(before);
    // The one real parameter in that blob still took effect
    expect(await page.evaluate(() => window.hyperparams.foodProdProb)).toBe(12);
  });

  // Coercion is not blanket Number(): a null or an empty string would both
  // come out 0, which reads as a deliberate zero rather than as absent.
  test('values that cannot mean a number leave the field alone', async ({ page }) => {
    const readings = await page.evaluate(() => {
      const out = {};
      for (const raw of [null, '', '   ', 'abc', {}, [], true]) {
        window.hyperparams.setDefaults();
        window.hyperparams.loadJsonObj({ lifespanMultiplier: raw });
        out[JSON.stringify(raw) ?? 'undefined'] = window.hyperparams.lifespanMultiplier;
      }
      return out;
    });
    // 100 is the default: every one of those was rejected, not coerced
    for (const [input, value] of Object.entries(readings)) {
      expect(value, `${input} should have been rejected`).toBe(100);
    }
  });

  test('string numbers land as numbers, including the awkward ones', async ({ page }) => {
    const landed = await page.evaluate(() => {
      window.hyperparams.setDefaults();
      // ".7" and "50" are real values out of Ostracod_Slide and Chains
      window.hyperparams.loadJsonObj({
        lifespanMultiplier: '.7',
        foodProdProb: '50',
        lookRange: ' 35 ',
        instaKill: 'true',
        rotationEnabled: false,
      });
      const h = window.hyperparams;
      return {
        lifespan: h.lifespanMultiplier,
        food: h.foodProdProb,
        look: h.lookRange,
        insta: h.instaKill,
        rotation: h.rotationEnabled,
      };
    });
    expect(landed).toEqual({
      lifespan: 0.7, food: 50, look: 35, insta: true, rotation: false,
    });
  });
});
