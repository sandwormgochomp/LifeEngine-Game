const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => console.log('[PAGE ERROR]', error.message, error.stack));

  await page.goto('http://localhost:3000', {waitUntil: 'networkidle2'});

  const res = await page.evaluate(async () => {
    // wait for engine
    await new Promise(r => setTimeout(r, 100));
    
    document.querySelector('#editor.tabnav-item').click();
    document.querySelector('#edit.edit-mode-btn').click();
    document.querySelector('.cell-type#producer').click();
    
    // Simulate click on canvas
    const canvas = document.querySelector('#editor-canvas');
    const rect = canvas.getBoundingClientRect();
    const event = new MouseEvent('mousedown', {
        clientX: rect.left + 165,
        clientY: rect.top + 155,
        button: 0, // left click
        bubbles: true
    });
    canvas.dispatchEvent(event);
    
    return {
        cells: window.engine.organism_editor.organism.anatomy.cells.length,
        mode: window.engine.organism_editor.controller.mode,
        editCellType: window.engine.organism_editor.controller.edit_cell_type.name,
        leftClick: window.engine.organism_editor.controller.left_click
    };
  });

  console.log("Result:", res);

  await browser.close();
})();
