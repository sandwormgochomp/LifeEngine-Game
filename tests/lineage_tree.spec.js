/* Species-level ancestry (window.phylogeny).

   FossilRecord.fossilize() nulls Species.ancestor on extinction -- correctly, a
   Species holds a live Anatomy -- so the object graph can never carry a tree.
   Phylogeny records the same edges as integers instead, and prunes them so the
   record cannot grow without bound in a world that speciates on every mutated
   birth.

   Most of these drive the record synthetically, the way lineage.spec.js's last
   test drives LineageTracker: real speciation is a random event, and the
   pruning rules are only observable over thousands of them. */
const { test, expect, pauseEngine } = require('./helpers/fixtures');

/* Everything below assumes an empty record, so each test clears the one the
   origin world already started filling. Injected into the page as source
   because page.evaluate can't close over Node-side helpers. */
const SYNTH = `
  const P = window.phylogeny;
  const sp = (id, name) => ({ id, name: name || ('S' + id) });
  // A straight line of species, each the child of the last. Returns the ids.
  const chainOf = (n, startId, tick) => {
    const ids = [];
    let parent = null;
    for (let i = 0; i < n; i++) {
      const s = sp(startId + i);
      P.record(s, parent, (tick || 0) + i);
      ids.push(s.id);
      parent = s;
    }
    return ids;
  };
`;

test.describe('Species ancestry record', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
  });

  test('An unbranched extinct chain compresses to a single edge', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      // root -> 39 pass-throughs -> a still-living leaf
      const ids = chainOf(41, 1000, 0);
      const root = ids[0], leaf = ids[ids.length - 1];
      // Everything between the root and the leaf dies out, in order.
      for (let i = 1; i < ids.length - 1; i++) P.onExtinct(ids[i], 500 + i);
      const leafNode = P.get(leaf);
      return {
        size: P.size,
        retained: P.retained().map(n => n.id).sort((a, b) => a - b),
        leafParent: leafNode.parent,
        leafCollapsed: leafNode.collapsed,
        root,
        leaf,
      };
    })()`);

    // Only the root and the living leaf survive; the 39 between them are one
    // edge now, and the edge says how many.
    expect(result.size).toBe(2);
    expect(result.retained).toEqual([result.root, result.leaf]);
    expect(result.leafParent).toBe(result.root);
    expect(result.leafCollapsed).toBe(39);
  });

  test('The spine of an extant leaf is retained, and a fully dead branch is dropped', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      const root = sp(2000, 'Root');
      P.record(root, null, 0);
      // A live branch: root -> A -> B (extant).
      const a = sp(2001, 'A'), b = sp(2002, 'B');
      P.record(a, root, 1);
      P.record(b, a, 2);
      // A doomed branch: root -> X -> Y -> Z, all of which die out.
      const x = sp(2003, 'X'), y = sp(2004, 'Y'), z = sp(2005, 'Z');
      P.record(x, root, 3);
      P.record(y, x, 4);
      P.record(z, y, 5);

      P.onExtinct(z.id, 10);
      P.onExtinct(y.id, 11);
      P.onExtinct(x.id, 12);
      const afterBranchDied = P.retained().map(n => n.id).sort((n, m) => n - m);

      // Now the live branch's middle dies, leaving B alone above the root.
      P.onExtinct(a.id, 20);
      const bNode = P.get(b.id);
      return {
        afterBranchDied,
        deadBranchGone: [x.id, y.id, z.id].every(id => !P.get(id)),
        finalIds: P.retained().map(n => n.id).sort((n, m) => n - m),
        bParent: bNode.parent,
        bCollapsed: bNode.collapsed,
        rootStillThere: !!P.get(root.id),
        ids: { root: root.id, a: a.id, b: b.id },
      };
    })()`);

    // While A was alive it held the spine open; the dead branch went whole.
    expect(result.afterBranchDied).toEqual([result.ids.root, result.ids.a, result.ids.b]);
    expect(result.deadBranchGone).toBe(true);
    // A was a pass-through once it died, so it became an edge weight on B.
    expect(result.finalIds).toEqual([result.ids.root, result.ids.b]);
    expect(result.bParent).toBe(result.ids.root);
    expect(result.bCollapsed).toBe(1);
    expect(result.rootStillThere).toBe(true);
  });

  test('An extinct fork is kept: compression only splices pass-throughs', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      const root = sp(3000), fork = sp(3001), l = sp(3002), r = sp(3003);
      P.record(root, null, 0);
      P.record(fork, root, 1);
      P.record(l, fork, 2);
      P.record(r, fork, 3);
      P.onExtinct(fork.id, 10);   // extinct, but two living children
      const whileForking = { size: P.size, kept: !!P.get(fork.id) };
      P.onExtinct(l.id, 20);      // now the fork is a pass-through
      return {
        whileForking,
        afterSize: P.size,
        forkGone: !P.get(fork.id) && !P.get(l.id),
        rParent: P.get(r.id).parent,
        rCollapsed: P.get(r.id).collapsed,
        rootId: root.id,
      };
    })()`);

    // The branching point survives its own extinction because it branches.
    expect(result.whileForking).toEqual({ size: 4, kept: true });
    // Once its second child is gone it is just a step in a line, and goes.
    expect(result.afterSize).toBe(2);
    expect(result.forkGone).toBe(true);
    /* R's edge counts the fork it was spliced past -- and only that. The dead
       sibling L was never on this path, so it is dropped, not counted: an edge
       weight is "species between these two", not "species that ever existed". */
    expect(result.rParent).toBe(result.rootId);
    expect(result.rCollapsed).toBe(1);
  });

  test('ancestorsOf returns the chain root-first, ending at the species asked for', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      const root = sp(4000, 'Origin');
      P.record(root, null, 0);
      const mid = sp(4001, 'Middle');
      P.record(mid, root, 1);
      const l1 = sp(4002, 'L1'), l2 = sp(4003, 'L2');
      // Two live leaves under Middle, so Middle survives its own extinction.
      P.record(l1, mid, 2);
      P.record(l2, mid, 3);
      P.onExtinct(mid.id, 10);
      return {
        chain: P.ancestorsOf(l1.id).map(n => ({ id: n.id, name: n.name })),
        unknown: P.ancestorsOf(999999),
        rootOnly: P.ancestorsOf(root.id).map(n => n.id),
        ids: { root: root.id, mid: mid.id, l1: l1.id },
      };
    })()`);

    expect(result.chain.map(n => n.name)).toEqual(['Origin', 'Middle', 'L1']);
    expect(result.chain.map(n => n.id)).toEqual([
      result.ids.root, result.ids.mid, result.ids.l1,
    ]);
    // A pruned or never-seen id has no chain rather than a bogus one.
    expect(result.unknown).toEqual([]);
    expect(result.rootOnly).toEqual([result.ids.root]);
  });

  test('A clade that mattered survives its own extinction; a trivial one does not', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      const root = sp(5000, 'Root');
      P.record(root, null, 0);
      const big = sp(5001, 'Dominant'), small = sp(5002, 'Nobody');
      P.record(big, root, 1);
      P.record(small, root, 2);
      P.onPop(big.id, 4000);   // ruled the world
      P.onPop(small.id, 3);    // never got going
      P.onExtinct(big.id, 100, [{ loc_col: 0, loc_row: 0, state: { name: 'mouth' } }]);
      P.onExtinct(small.id, 101, [{ loc_col: 0, loc_row: 0, state: { name: 'mouth' } }]);
      const bigNode = P.get(big.id);
      return {
        bigKept: !!bigNode,
        bigPeak: bigNode ? bigNode.peak_pop : 0,
        // Kept for drawing, and flat -- no live BodyCells in the record.
        bigCells: bigNode && bigNode.cells ? bigNode.cells.length : 0,
        smallGone: !P.get(small.id),
        notable: P.notable_size,
      };
    })()`);

    expect(result.bigKept).toBe(true);
    expect(result.bigPeak).toBe(4000);
    expect(result.bigCells).toBe(1);
    expect(result.smallGone).toBe(true);
    expect(result.notable).toBe(1);
  });

  /* The regression that matters. Everything above is shape; this is the reason
     the shape is what it is -- 10,000 speciations against five surviving lines
     must not leave 10,000 nodes behind. */
  test('10,000 speciations stay bounded, with every extant spine intact', async ({ page }) => {
    test.setTimeout(30000);
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      const LINES = 5, ROUNDS = 10000;
      const roots = [], extant = [];
      let nid = 100000;
      for (let i = 0; i < LINES; i++) {
        const r = { id: nid++, name: 'Line' + i };
        P.record(r, null, 0);
        roots.push(r);
        extant.push(r);
      }
      let tick = 0;
      const t0 = performance.now();
      for (let i = 0; i < ROUNDS; i++) {
        const slot = i % LINES;
        const child = { id: nid++, name: 'M' + i };
        P.record(child, extant[slot], ++tick);
        /* A wide spread of peak populations, so the notable reserve genuinely
           fills and is then displaced thousands of times over. That eviction
           path is where the one real leak in this record was found: demoting a
           node without pruning it left it in the map forever. */
        P.onPop(child.id, 1 + (i % 137));
        // 47, not 50: a cadence divisible by LINES would hand every takeover to
        // the same line and leave the other four untouched.
        if (i % 47 === 46) {
          // This mutant takes over its line; the species it came from dies.
          const old = extant[slot];
          extant[slot] = child;
          P.onExtinct(old.id, ++tick);
        } else {
          // The overwhelmingly common case: a childless dead end.
          P.onExtinct(child.id, ++tick);
        }
      }
      const elapsed = performance.now() - t0;

      const spines = extant.map((leaf, i) => {
        const chain = P.ancestorsOf(leaf.id);
        let contiguous = chain.length > 0;
        for (let k = 1; k < chain.length; k++) {
          if (chain[k].parent !== chain[k - 1].id) contiguous = false;
        }
        return {
          rootFirst: chain.length > 0 && chain[0].id === roots[i].id,
          endsAtLeaf: chain.length > 0 && chain[chain.length - 1].id === leaf.id,
          contiguous,
          // Species compressed out of this line, which must account for the
          // ones that are gone rather than silently vanishing them.
          collapsed: chain.reduce((a, n) => a + n.collapsed, 0),
          length: chain.length,
        };
      });
      return {
        size: P.size,
        notable: P.notable_size,
        elapsed,
        spines,
        rootsAlive: roots.every(r => !!P.get(r.id)),
      };
    })()`);

    // The cap is 4000; coalescent retention plus a 200-strong reserve should
    // land far below it. The assertion is the cap, not the actual figure --
    // an unbounded record would show ~10,000.
    expect(result.size).toBeLessThan(4000);
    /* Far below it, in fact: the retained set is the five extant lines, their
       compressed spines, and the 200-strong notable reserve. The tighter bound
       is what catches a leak that the cap alone would hide -- forgetting to
       prune an evicted notable left ~1,000 here and still passed the cap. */
    expect(result.size).toBeLessThan(400);
    expect(result.notable).toBeLessThanOrEqual(200);
    expect(result.rootsAlive).toBe(true);
    for (const spine of result.spines) {
      expect(spine.rootFirst).toBe(true);
      expect(spine.endsAtLeaf).toBe(true);
      expect(spine.contiguous).toBe(true);
      // Nothing like the 2,000 speciations this line saw (it runs about 37).
      expect(spine.length).toBeLessThan(250);
    }
    // And the species spliced out of those spines are counted, not vanished.
    expect(result.spines.reduce((a, s) => a + s.collapsed, 0)).toBeGreaterThan(0);
    /* Loose by roughly two orders of magnitude -- 20,000 record/extinct calls
       run in about 12ms. It is here to catch a retention walk that stopped
       being amortised O(1) and went O(depth) or worse, which is invisible in
       every assertion above. */
    expect(result.elapsed).toBeLessThan(1000);
  });

  test('Over the hard cap the record degrades instead of failing', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      ${SYNTH}
      P.clear();
      // 5,000 living species: past the 4,000 node cap, and not one of them may
      // be dropped -- an extant species is always retained. The cap raises the
      // notability floor and re-compresses; when there is nothing left to give
      // it lets the record run large rather than throwing or losing a leaf.
      const ids = [];
      for (let i = 0; i < 5000; i++) {
        const s = { id: 900000 + i, name: 'Extant' + i };
        P.record(s, null, 0);
        ids.push(s.id);
      }
      return { size: P.size, allPresent: ids.every(id => !!P.get(id)) };
    })()`);
    expect(result.size).toBe(5000);
    expect(result.allPresent).toBe(true);
  });

  /* --- wiring, against the real simulation --- */

  test('A real speciation records the parent edge; origin species are roots', async ({ page }) => {
    const result = await page.evaluate(() => {
      const env = window.engine.env;
      const P = window.phylogeny;
      const org = env.organisms[0];
      const parent_id = org.species.id;
      const root = P.get(parent_id);
      // The one speciation choke point: a mutated birth.
      const child = window.fossilRecord.addSpecies(org, org.species);
      const node = P.get(child.id);
      return {
        rootExists: !!root,
        rootParent: root ? root.parent : 'missing',
        childParent: node ? node.parent : null,
        parent_id,
        idsDiffer: child.id !== parent_id,
        chain: P.ancestorsOf(child.id).map(n => n.id),
        childId: child.id,
      };
    });
    expect(result.rootExists).toBe(true);
    expect(result.rootParent).toBe(null);
    expect(result.idsDiffer).toBe(true);
    expect(result.childParent).toBe(result.parent_id);
    expect(result.chain).toEqual([result.parent_id, result.childId]);
  });

  test('A world reset clears the record along with the fossil record', async ({ page }) => {
    const result = await page.evaluate(() => {
      const env = window.engine.env;
      const P = window.phylogeny;
      const before = P.size;
      env.reset();
      // reset() reseeds, so the origin organism's species is registered again.
      return { before, after: P.size, roots: P.roots().length };
    });
    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBe(1);
    expect(result.roots).toBe(1);
  });

  test('The lineage card shows where the followed line descended from', async ({ page }) => {
    await page.evaluate(() => {
      const env = window.engine.env;
      const org = env.organisms[0];
      // Give the founder an ancestor: speciate it off its own species, then
      // follow it, so the card has a chain to draw.
      window.fossilRecord.addSpecies(org, org.species);
      env.followOrganism(org);
    });
    const card = page.getByTestId('lineage-card');
    await expect(card).toBeVisible();
    const strip = page.getByTestId('lineage-ancestry');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('DESCENDED FROM');
    // One ancestor, drawn as a body plan.
    await expect(strip.locator('canvas')).toHaveCount(1);
  });
});
