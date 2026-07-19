# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.js >> Editor Functionality >> Regression: Removing the middle cell allows placing a new cell
- Location: tests\editor.spec.js:52:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#edit-organism-details .cell-count')
Expected pattern: /Cell count: 0/
Received string:  "Cell count: 1"
Timeout: 5000ms

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('#edit-organism-details .cell-count')
    14 × locator resolved to <p class="cell-count">Cell count: 1</p>
       - unexpected value "Cell count: 1"

```

```yaml
- button ""
- button ""
- button ""
- button ""
- button ""
- button ""
- img "Life Engine"
- heading "Simulation Speed" [level=3]
- slider: "60"
- button ""
- button ""
- paragraph: "Target FPS: 60"
- paragraph: "Actual FPS: 66"
- button "Reset"
- button "Clear"
- text:  Brush Size
- slider " Brush Size": "2"
- paragraph: About
- paragraph: Editor
- paragraph: World Controls
- paragraph: Evolution Controls
- paragraph: Statistics
- button ""
- button ""
- button ""
- button ""
- button "+"
- button ""
- button ""
- button ""
- button "Clear"
- button ""
- heading "Organism Details" [level=3]
- paragraph: "Species name: nmvgv7jmpi"
- paragraph: "Cell count: 1"
- paragraph: "Mutation Rate: 5"
- heading "Brain" [level=4]
- paragraph: "Move Towards (State 1): food(+10)"
- paragraph: "Move Away From (State 1): killer(-10)"
- button "Community Creations "
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Editor Functionality', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  6   |     page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text()); });
  7   |     await page.goto('/');
  8   |     await page.waitForFunction(() => window.engine !== undefined);
  9   |     const maximizeBtn = page.locator('#maximize');
  10  |     if (await maximizeBtn.isVisible()) await maximizeBtn.click();
  11  |     
  12  |     // Switch to editor tab
  13  |     await page.locator('#editor.tabnav-item').click();
  14  |   });
  15  | 
  16  |   test('Selecting a cell type highlights it', async ({ page }) => {
  17  |     // First we must enter Edit mode to see the cell selections
  18  |     await page.locator('#edit.edit-mode-btn').click();
  19  | 
  20  |     const commonCellBtn = page.locator('.cell-type#common');
  21  |     await commonCellBtn.click();
  22  |     
  23  |     // Check that the border color is yellow
  24  |     await expect(commonCellBtn).toHaveCSS('border-color', 'rgb(255, 255, 0)');
  25  |     
  26  |     // Clicking again should deselect
  27  |     await commonCellBtn.click();
  28  |     await expect(commonCellBtn).not.toHaveCSS('border-color', 'rgb(255, 255, 0)');
  29  |   });
  30  | 
  31  |   test('Placing a cell on the editor canvas updates organism size', async ({ page }) => {
  32  |     // Initial cell count should be 1
  33  |     const cellCount = page.locator('#edit-organism-details .cell-count');
  34  |     await expect(cellCount).toHaveText(/Cell count: 1/);
  35  | 
  36  |     // Select Common Cell
  37  |     await page.locator('.cell-type#common').click();
  38  | 
  39  |     // Click on the editor canvas (just slightly off center to hit an adjacent cell)
  40  |     const editorCanvas = page.locator('#editor-canvas');
  41  |     const box = await editorCanvas.boundingBox();
  42  |     if (box) {
  43  |       // Center is the middle cell
  44  |       // Since cell size is 13px, click 13px to the right of the center
  45  |       await page.mouse.click(box.x + box.width / 2 + 13, box.y + box.height / 2);
  46  |     }
  47  |     
  48  |     // Wait for the UI to update
  49  |     await expect(cellCount).toHaveText(/Cell count: 2/);
  50  |   });
  51  | 
  52  |   test('Regression: Removing the middle cell allows placing a new cell', async ({ page }) => {
  53  |     // Initial cell count should be 1
  54  |     const cellCount = page.locator('#edit-organism-details .cell-count');
  55  |     await expect(cellCount).toHaveText(/Cell count: 1/);
  56  | 
  57  |     const editorCanvas = page.locator('#editor-canvas');
  58  |     const box = await editorCanvas.boundingBox();
  59  |     
  60  |     // Right click the middle cell to remove it
  61  |     if (box) {
  62  |       await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  63  |     }
  64  | 
  65  |     // Cell count should now be 0
> 66  |     await expect(cellCount).toHaveText(/Cell count: 0/);
      |                             ^ Error: expect(locator).toHaveText(expected) failed
  67  | 
  68  |     // Now try to place a new cell
  69  |     await page.locator('#edit.edit-mode-btn').click();
  70  |     await page.locator('.cell-type#common').click();
  71  |     if (box) {
  72  |       // Place it right in the center again
  73  |       await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  74  |     }
  75  | 
  76  |     // Cell count should go back to 1
  77  |     await expect(cellCount).toHaveText(/Cell count: 1/);
  78  |   });
  79  | 
  80  |   test('Clearing the organism allows placing a new cell', async ({ page }) => {
  81  |     const clearBtn = page.locator('#empty-org');
  82  |     await clearBtn.click();
  83  | 
  84  |     // Confirm dialog (playwright auto-accepts by default, or we might need to handle it)
  85  |     page.on('dialog', dialog => dialog.accept());
  86  | 
  87  |     const cellCount = page.locator('#edit-organism-details .cell-count');
  88  |     await expect(cellCount).toHaveText(/Cell count: 0/);
  89  | 
  90  |     await page.locator('.cell-type#producer').click();
  91  |     const editorCanvas = page.locator('#editor-canvas');
  92  |     const box = await editorCanvas.boundingBox();
  93  |     if (box) {
  94  |       await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  95  |     }
  96  |     await expect(cellCount).toHaveText(/Cell count: 1/);
  97  |   });
  98  | 
  99  |   test('Selecting a color preset updates the color picker', async ({ page }) => {
  100 |     const blackPreset = page.locator('.color-preset[data-color="#000000"]');
  101 |     if (await blackPreset.count() > 0) {
  102 |       await blackPreset.click();
  103 |       const colorPicker = page.locator('#cell-color-picker');
  104 |       await expect(colorPicker).toHaveValue('#000000');
  105 |     }
  106 |   });
  107 |   test('Placing 5 common cells on the canvas works correctly', async ({ page }) => {
  108 |     // Initial cell count should be 1
  109 |     const cellCount = page.locator('#edit-organism-details .cell-count');
  110 |     await expect(cellCount).toHaveText(/Cell count: 1/);
  111 | 
  112 |     // Select Edit Mode and Common Cell
  113 |     await page.locator('#edit.edit-mode-btn').click();
  114 |     await page.locator('.cell-type#common').click();
  115 | 
  116 |     const editorCanvas = page.locator('#editor-canvas');
  117 |     const box = await editorCanvas.boundingBox();
  118 |     if (box) {
  119 |       const centerX = box.x + box.width / 2;
  120 |       const centerY = box.y + box.height / 2;
  121 |       
  122 |       // Place 5 common cells in a line to the right
  123 |       for (let i = 1; i <= 5; i++) {
  124 |         await page.mouse.click(centerX + (i * 13), centerY);
  125 |       }
  126 |     }
  127 |     
  128 |     // Wait for the UI to update to show 6 cells (1 original + 5 new)
  129 |     await expect(cellCount).toHaveText(/Cell count: 6/);
  130 | 
  131 |     // Validate that the cells exist and are visible for the user in the locations they were placed
  132 |     // We move the mouse away to remove any hover highlights before checking
  133 |     await page.mouse.move(0, 0);
  134 |     await page.waitForTimeout(100);
  135 | 
  136 |     const visibilityChecks = await page.evaluate(() => {
  137 |       const editor = window.engine.organism_editor;
  138 |       const canvas = editor.renderer.canvas;
  139 |       const ctx = editor.renderer.ctx;
  140 |       
  141 |       const results = [];
  142 |       for (let i = 0; i <= 5; i++) {
  143 |         const cell = editor.organism.anatomy.cells.find(c => c.loc_col === i && c.loc_row === 0);
  144 |         if (!cell) {
  145 |           results.push({ col: i, visible: false, reason: 'not in anatomy' });
  146 |           continue;
  147 |         }
  148 |         
  149 |         const gridCell = editor.organism.getRealCell(cell);
  150 |         
  151 |         const pixelX = gridCell.x + Math.floor(editor.renderer.cell_size / 2);
  152 |         const pixelY = gridCell.y + Math.floor(editor.renderer.cell_size / 2);
  153 |         
  154 |         const pixelData = ctx.getImageData(pixelX, pixelY, 1, 1).data;
  155 |         
  156 |         // Background (empty) is black [0,0,0,255]. Common cell should be gray (not black).
  157 |         const isBlack = (pixelData[0] === 0 && pixelData[1] === 0 && pixelData[2] === 0);
  158 |         results.push({ col: i, visible: !isBlack, color: `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})` });
  159 |       }
  160 |       return results;
  161 |     });
  162 | 
  163 |     for (const check of visibilityChecks) {
  164 |       expect(check.visible).toBe(true);
  165 |     }
  166 |   });
```