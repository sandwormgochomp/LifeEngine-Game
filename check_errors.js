const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => console.log('[PAGE ERROR]', error.message, error.stack));

  await page.goto('http://localhost:8000', {waitUntil: 'networkidle2'});

  const res = await page.evaluate(() => {
    document.querySelector('#maximize').click();
    document.querySelector('.tabnav-item#editor').click();
    
    // We expect edit_cell_type to be set
    document.querySelector('.cell-type#common').click();
    
    return {
        editCellType: window.engine.organism_editor.controller.edit_cell_type ? window.engine.organism_editor.controller.edit_cell_type.name : null
    };
  });

  console.log("Edit cell type:", res.editCellType);

  await browser.close();
})();
