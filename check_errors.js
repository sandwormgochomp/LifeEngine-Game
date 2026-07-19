const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => console.log('[PAGE ERROR]', error.message, error.stack));

  await page.goto('http://localhost:3000', {waitUntil: 'networkidle2'});

  const res = await page.evaluate(() => {
    return {
        success: window.engine !== undefined
    };
  });

  console.log("Engine loaded:", res.success);

  await browser.close();
})();
