/* The lineage tree panel, and the geometry behind it.

   Two halves, and the first is the one that matters. `PhyloLayout` is a pure
   function -- retained ancestry nodes in, {x, y, w} slots out -- so it is
   driven directly through window.phyloLayout rather than inferred from what
   ended up on the canvas. The property being protected is that a node keeps
   its row when the tree changes around it: a tree that renumbers itself every
   couple of seconds cannot be read, and no screenshot or DOM assertion would
   ever catch it moving.

   The second half is the panel itself, which is a <canvas>, so the assertions
   available are "did anything get painted", "does hovering produce a tooltip",
   and "does clicking route somewhere". */
const { test, expect, pauseEngine } = require('./helpers/fixtures');

// Injected as source: page.evaluate cannot close over Node-side helpers.
const SETUP = `
  const { layoutPhylogeny, SlotMemory } = window.phyloLayout;
  // A node as the layout reads it. Extant unless an end tick is given.
  const n = (id, parent, birth, end) => ({
    id, parent,
    birth_tick: birth,
    end_tick: end === undefined ? -1 : end,
    extinct: end !== undefined,
    collapsed: 0,
  });
  const rows = (result) => {
    const out = {};
    for (const s of result.slots) out[s.id] = s.y;
    return out;
  };
`;

test.describe('Lineage tree layout', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('A first layout is a pre-order walk: x from tick, one row per node', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      /*      root -- a -- a1
                    \\      \\ a2
                     \\ b            */
      const nodes = [n(1, null, 0), n(2, 1, 10), n(3, 2, 20), n(4, 2, 30), n(5, 1, 40)];
      const out = layoutPhylogeny(nodes, 100, new SlotMemory());
      return {
        rows: rows(out),
        xs: Object.fromEntries(out.slots.map(s => [s.id, s.x])),
        ws: Object.fromEntries(out.slots.map(s => [s.id, s.w])),
        runs: Object.fromEntries(out.slots.map(s => [s.id, s.run_w])),
        parents: Object.fromEntries(out.slots.map(s => [s.id, s.parent_y])),
        total: out.rows,
        span: [out.min_x, out.max_x],
      };
    })()`);

    // Depth-first, so a whole subtree lands before the next sibling.
    expect(result.rows).toEqual({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 });
    expect(result.total).toBe(5);
    // x is the birth tick, w the span to `now` for an extant node.
    expect(result.xs).toEqual({ 1: 0, 2: 10, 3: 20, 4: 30, 5: 40 });
    expect(result.ws).toEqual({ 1: 100, 2: 90, 3: 80, 4: 70, 5: 60 });
    expect(result.runs[1]).toBe(100);
    // Every child knows the row to drop from, and roots have none.
    expect(result.parents).toEqual({ 1: null, 2: 0, 3: 1, 4: 1, 5: 0 });
    expect(result.span).toEqual([0, 100]);
  });

  /* The regression this file exists for. */
  test('A node keeps its row when an unrelated subtree changes', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      const memory = new SlotMemory();
      // Two branches off one root. 'left' is 2/3/4, 'right' is 5/6.
      const before = [n(1, null, 0), n(2, 1, 10), n(3, 2, 20), n(4, 2, 30), n(5, 1, 40), n(6, 5, 50)];
      const first = rows(layoutPhylogeny(before, 100, memory));

      /* Now the left branch does everything it can do: it grows two new
         species, and one of its members dies out. Nothing on the right is
         touched -- and a from-scratch in-order layout would still push every
         right-hand row down by the two new nodes. */
      const after = [
        n(1, null, 0), n(2, 1, 10), n(4, 2, 30),
        n(7, 2, 60), n(8, 7, 70),
        n(5, 1, 40), n(6, 5, 50),
      ];
      const second = rows(layoutPhylogeny(after, 200, memory));

      // And a third pass with nothing changed at all must be a no-op.
      const third = rows(layoutPhylogeny(after, 300, memory));
      return { first, second, third };
    })()`);

    expect(result.first).toEqual({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 });
    // The right branch is exactly where it was.
    expect(result.second[5]).toBe(result.first[5]);
    expect(result.second[6]).toBe(result.first[6]);
    // As is everything on the left that survived.
    expect(result.second[1]).toBe(0);
    expect(result.second[2]).toBe(1);
    expect(result.second[4]).toBe(3);
    // The freed row is reused rather than pushing the tree down: node 3 is
    // gone, so row 2 is available to the first new node below node 2.
    expect(result.second[7]).toBe(2);
    expect(result.second[8]).toBe(6);
    expect(result.third).toEqual(result.second);
  });

  test('A reparented child keeps its row, and stays below its new parent', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      const memory = new SlotMemory();
      // root -> mid -> leaf, with a sibling under root.
      const before = [n(1, null, 0), n(2, 1, 10), n(3, 2, 20), n(4, 1, 30)];
      const first = rows(layoutPhylogeny(before, 100, memory));
      /* Path compression splices the middle node out and hangs its leaf off
         the root,
         charging the edge with what it swallowed. That is the single most
         common edit the record makes, and it must not move anything. */
      const after = [
        n(1, null, 0),
        { ...n(3, 1, 20), collapsed: 1 },
        n(4, 1, 30),
      ];
      const out = layoutPhylogeny(after, 100, memory);
      const second = rows(out);
      const belowParent = out.slots.every(s => s.parent_y === null || s.y > s.parent_y);
      return { first, second, belowParent, collapsed: out.by_id.get(3).collapsed };
    })()`);

    expect(result.first).toEqual({ 1: 0, 2: 1, 3: 2, 4: 3 });
    expect(result.second).toEqual({ 1: 0, 3: 2, 4: 3 });
    // The invariant the drawing depends on: no edge ever runs back upward.
    expect(result.belowParent).toBe(true);
    // The count of what was spliced out survives into the slot, so the panel
    // can say "+1" instead of claiming direct descent.
    expect(result.collapsed).toBe(1);
  });

  test('A node whose parent is not in the input draws as a root', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      const out = layoutPhylogeny([n(9, 404, 5), n(10, 9, 6)], 20, new SlotMemory());
      return {
        rows: rows(out),
        parents: Object.fromEntries(out.slots.map(s => [s.id, s.parent])),
        min_x: out.min_x,
      };
    })()`);
    expect(result.rows).toEqual({ 9: 0, 10: 1 });
    // The dangling parent id is dropped rather than drawn as an edge to
    // nowhere; the real record can hand us one after a prune.
    expect(result.parents).toEqual({ 9: null, 10: 9 });
    expect(result.min_x).toBe(5);
  });

  test('An empty record lays out to nothing rather than throwing', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      const out = layoutPhylogeny([], 10, new SlotMemory());
      return { slots: out.slots.length, rows: out.rows, min_x: out.min_x, max_x: out.max_x };
    })()`);
    expect(result).toEqual({ slots: 0, rows: 0, min_x: 0, max_x: 0 });
  });

  /* Relayout runs on the render thread beside a live simulation, so its cost
     is a budget, not a curiosity. Loose by an order of magnitude; it is here to
     catch the walk going quadratic, not to police milliseconds. */
  test('Relayout at ~600 nodes is cheap enough to run beside the sim', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SETUP}
      // A 600-node tree of the shape the record actually retains: a spine with
      // clusters of leaves hanging off it.
      const nodes = [n(1, null, 0)];
      let id = 2, spine = 1;
      for (let i = 0; i < 120; i++) {
        const next = id++;
        nodes.push(n(next, spine, i * 10));
        for (let k = 0; k < 4; k++) nodes.push(n(id++, next, i * 10 + k));
        spine = next;
      }
      const memory = new SlotMemory();
      layoutPhylogeny(nodes, 5000, memory);   // warm
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) layoutPhylogeny(nodes, 5000, memory);
      return { count: nodes.length, per_call: (performance.now() - t0) / 20 };
    })()`);
    expect(result.count).toBeGreaterThan(590);
    expect(result.per_call).toBeLessThan(20);
  });
});

test.describe('Lineage tree panel', () => {
  test.beforeEach(async ({ page }) => {
    // Speciate a few times off the origin organism so there is a tree, not a
    // single node, and pause so nothing moves under the assertions.
    await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      let parent = org.species;
      for (let i = 0; i < 6; i++) {
        parent = window.fossilRecord.addSpecies(org, parent);
        window.phylogeny.onPop(parent.id, 50 + i);
      }
      window.engine.emitChange(true);
    });
    await pauseEngine(page);
  });

  test('The panel opens from the toolbar and paints a tree', async ({ page }) => {
    await expect(page.getByTestId('lineage-tab')).toBeHidden();
    await page.locator('#tool-lineage').click();

    const canvas = page.getByTestId('lineage-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('lineage-counts')).toContainText('on record');

    /* Something is actually drawn. Counted as opaque bright green rather than
       "any non-transparent pixel", which the faint tick grid would satisfy on
       its own -- the species runs are what has to be there. */
    await expect.poll(() => page.evaluate(() => {
      const c = document.querySelector('[data-testid="lineage-canvas"]');
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 200 && data[i + 1] > 200) lit++;
      }
      return lit;
    }), { timeout: 5000 }).toBeGreaterThan(200);
  });

  test('It closes on Escape like every other panel, and costs nothing shut', async ({ page }) => {
    await page.locator('#tool-lineage').click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await page.keyboard.press('Escape');
    // Unmounted, not hidden: nothing subscribes to the record while it is shut.
    await expect(page.getByTestId('lineage-tab')).toHaveCount(0);
  });

  test('Only one panel at a time: opening stats puts the tree away', async ({ page }) => {
    await page.locator('#tool-lineage').click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await page.locator('#tool-stats').click();
    await expect(page.getByTestId('lineage-tab')).toHaveCount(0);
    await expect(page.locator('#species-count')).toBeVisible();
  });

  test('Hovering a species names it, and clicking opens it in the lab', async ({ page }) => {
    await page.locator('#tool-lineage').click();
    const canvas = page.getByTestId('lineage-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

    /* Aim at a node through the layout rather than by sweeping the canvas: the
       tree is 1px runs on a 1000px surface and a blind sweep is a coin flip.
       The panel exposes nothing, so this reproduces the same transform the
       painter uses -- which is exactly what makes the pure layout worth
       having. */
    const target = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="lineage-canvas"]');
      const rect = c.getBoundingClientRect();
      const nodes = window.phylogeny.retained().map(node => ({
        id: node.id, parent: node.parent, birth_tick: node.birth_tick,
        end_tick: node.end_tick, extinct: node.extinct, collapsed: node.collapsed,
      }));
      const out = window.phyloLayout.layoutPhylogeny(
        nodes, window.engine.env.total_ticks, new window.phyloLayout.SlotMemory());
      // The deepest node, so it is unambiguous which run the pointer is on.
      const slot = out.slots.reduce((a, b) => (b.depth > a.depth ? b : a));
      const PAD = 8, PAD_TOP = 20;
      const span = Math.max(1, out.max_x - out.min_x);
      const sx = (rect.width - PAD * 2) / span;
      const sy = Math.min(13, Math.max(1, (rect.height - PAD_TOP - PAD) / Math.max(1, out.rows)));
      return {
        x: PAD + (slot.x + slot.run_w / 2 - out.min_x) * sx,
        y: PAD_TOP + slot.y * sy,
        name: window.phylogeny.get(slot.id).name,
      };
    });

    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + target.x, box.y + target.y);
    const tip = page.getByTestId('lineage-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(target.name);
    await expect(tip).toContainText('open in lab');

    // A click on the same node hands that species to the Organism Lab -- the
    // same handler, and the same destination, as the Lifeforms picker.
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => window.engine.organism_editor.organism.species.name)
    ).toBe(target.name);
  });

  test('The followed line is drawn in the lineage cyan', async ({ page }) => {
    await page.locator('#tool-lineage').click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    const cyanPixels = () => page.evaluate(() => {
      const c = document.querySelector('[data-testid="lineage-canvas"]');
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let cyan = 0;
      /* #00d9ff against a palette whose every other shade is #00ff41: the blue
         channel is the whole difference (255 against 65), so that alone
         separates them. */
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 200 && data[i] < 60 && data[i + 2] > 150) cyan++;
      }
      return cyan;
    });
    await expect.poll(cyanPixels).toBe(0);

    // Following an organism tints its species -- the same cyan the decoration
    // pass and the lineage card already use for that line.
    await page.evaluate(() => {
      const env = window.engine.env;
      env.followOrganism(env.organisms[0]);
      window.engine.emitChange(true);
    });
    await expect.poll(cyanPixels, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('An empty record says so instead of drawing nothing', async ({ page }) => {
    await page.evaluate(() => {
      window.phylogeny.clear();
      window.engine.emitChange(true);
    });
    await page.locator('#tool-lineage').click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByTestId('lineage-tab')).toContainText('Nothing on record yet');
  });
});
