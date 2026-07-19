const base = require('@playwright/test');

// Shared page setup: log browser errors, load the app, wait for the engine.
const test = base.test.extend({
  page: async ({ page }, use) => {
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
    });
    await page.goto('/');
    await page.waitForSelector('div[data-engine-ready="true"]');
    await use(page);
  },
});

// Open a HUD panel from the bottom toolbar (select|print|edit|rules|environment|stats)
async function openPanel(page, panelName) {
  await page.locator(`#tool-${panelName}`).click();
}

// Pause the simulation for deterministic assertions on world state
async function pauseEngine(page) {
  await page.evaluate(() => window.engine.controlpanel.setPaused(true));
}

module.exports = { test, expect: base.expect, openPanel, pauseEngine };
