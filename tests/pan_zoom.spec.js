const { test, expect, openPanel } = require('./helpers/fixtures');

const canvasBox = (page) => page.locator('#env-canvas').boundingBox();

// Select an environment tool, then close the panel so it doesn't cover the canvas
async function selectEnvMode(page, buttonId) {
  await openPanel(page, 'environment');
  await page.locator(`#${buttonId}`).click();
  await openPanel(page, 'environment');
}

async function dragBy(page, { from, dx, dy, steps = 10, button = 'left' }) {
  const before = await canvasBox(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up({ button });

  const after = await canvasBox(page);
  return { moved_x: after.x - before.x, moved_y: after.y - before.y };
}

test.describe('Panning and zooming the world canvas', () => {
  test('Dragging pans the canvas 1:1 with the mouse', async ({ page }) => {
    await selectEnvMode(page, 'drag');

    const { moved_x, moved_y } = await dragBy(page, {
      from: { x: 400, y: 300 },
      dx: 200,
      dy: 120,
    });

    expect(moved_x).toBeCloseTo(200, 0);
    expect(moved_y).toBeCloseTo(120, 0);
  });

  test('Panning advances evenly on every mousemove', async ({ page }) => {
    await selectEnvMode(page, 'drag');

    // Each step must move the canvas by the same amount. Stalled or reversed
    // steps are what the drag reads as stutter.
    const step = 20;
    const positions = [];

    await page.mouse.move(400, 300);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(400 + i * step, 300);
      positions.push((await canvasBox(page)).x);
    }
    await page.mouse.up();

    for (let i = 1; i < positions.length; i++) {
      const delta = positions[i] - positions[i - 1];
      expect(delta, `step ${i} moved ${delta}px, expected ${step}px`).toBeCloseTo(step, 0);
    }
  });

  test('Middle-click drags the canvas in any mode', async ({ page }) => {
    const { moved_x, moved_y } = await dragBy(page, {
      from: { x: 400, y: 300 },
      dx: 150,
      dy: -80,
      button: 'middle',
    });

    expect(moved_x).toBeCloseTo(150, 0);
    expect(moved_y).toBeCloseTo(-80, 0);
  });

  test('Panning stays 1:1 while zoomed in', async ({ page }) => {
    await selectEnvMode(page, 'drag');

    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -120);
    await page.mouse.wheel(0, -120);
    const scale = await page.evaluate(() => window.engine.env.controller.scale);
    expect(scale).toBeGreaterThan(1);

    // The pan is in screen pixels, so it tracks the mouse 1:1 at any zoom
    const { moved_x, moved_y } = await dragBy(page, {
      from: { x: 400, y: 300 },
      dx: 120,
      dy: 90,
    });

    expect(moved_x).toBeCloseTo(120, 0);
    expect(moved_y).toBeCloseTo(90, 0);
  });

  test('Zooming keeps the point under the cursor fixed', async ({ page }) => {
    const cursor = { x: 500, y: 350 };
    const before = await canvasBox(page);
    // Where the cursor sits within the canvas, as a fraction of its size
    const fx = (cursor.x - before.x) / before.width;
    const fy = (cursor.y - before.y) / before.height;

    await page.mouse.move(cursor.x, cursor.y);
    await page.mouse.wheel(0, -120);

    const after = await canvasBox(page);
    expect(after.width).toBeGreaterThan(before.width);

    // That same spot on the canvas should still be under the cursor
    expect(after.x + fx * after.width).toBeCloseTo(cursor.x, 0);
    expect(after.y + fy * after.height).toBeCloseTo(cursor.y, 0);
  });

  test('Reset view restores pan and zoom', async ({ page }) => {
    const original = await canvasBox(page);

    await selectEnvMode(page, 'drag');
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -120);
    await dragBy(page, { from: { x: 400, y: 300 }, dx: 100, dy: 60 });

    await page.getByTitle('Reset Zoom').click();

    const reset = await canvasBox(page);
    expect(reset.x).toBeCloseTo(original.x, 0);
    expect(reset.y).toBeCloseTo(original.y, 0);
    expect(reset.width).toBeCloseTo(original.width, 0);
  });
});
