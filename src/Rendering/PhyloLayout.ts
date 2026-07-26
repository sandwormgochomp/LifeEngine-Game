/* Geometry for the lineage tree: retained ancestry nodes -> {x, y, w} slots.

   Pure and DOM-free on purpose. The panel that draws this is a canvas, so
   nothing about the result can be asserted by querying the DOM; keeping the
   arithmetic in its own module means the layout is testable directly through
   page.evaluate, which is where the slot-stability tests live.

   --- the two axes ---

   x is a tick, not a pixel. Time runs left to right, the same convention the
   stats charts use, and the caller scales ticks to pixels when it draws. A
   node's slot is a horizontal *run*: x is its birth tick and w is how long it
   is known to have lasted (to its extinction, or to `now` if it is still
   extant). Drawing a species as a run rather than a point is what makes the
   compressed edges legible -- the run is the species, the vertical drop to a
   child is the speciation.

   y is a row index, one row per node, and every row is unique. Which brings us
   to the only interesting part of this file.

   --- why rows are remembered ---

   The record this draws is rewritten constantly: an extinct pass-through is
   spliced out and its child reparented to its grandparent, a dead clade
   disappears whole, a new mutant appears every few ticks. A layout computed
   fresh from the current tree -- leaves numbered in traversal order, internal
   nodes centred on their children -- assigns *different* rows after almost any
   of those, because a subtree that grew by three leaves pushes everything
   below it down by three. At the panel's repaint cadence that is a tree that
   reflows every couple of seconds, which cannot be read, let alone pointed at.

   So rows are allocated once and held. `SlotMemory` maps node id -> row and
   keeps the set of rows currently spoken for; a node that already has a row
   keeps it no matter what happens elsewhere in the tree, and only a node the
   record has actually dropped gives its row back. New nodes take the first
   free row *below their parent*, which preserves two things worth having:

     - the first pass over an empty memory is exactly a pre-order traversal
       (root 0, first child 1, its first child 2, ...), i.e. the tidy tree you
       would have drawn anyway; and
     - the invariant "a parent's row is above every descendant's" survives
       every later edit, so the drawing never has an edge running back upward.
       Path compression only ever reparents a node onto an ancestor, which is
       further up, so it cannot break this either.

   The cost is drift: as clades die their rows are freed and refilled by
   whatever is born next near that part of the tree, so after a long run the
   layout is no longer the tidiest arrangement of the current tree. That is the
   trade being made deliberately. A tidy tree that renumbers itself is unusable;
   a slightly untidy one that holds still is not. */

/* What the layout reads off a node. Structurally typed so this module never
   imports Phylogeny -- and so the tests can drive it with plain objects. */
export interface PhyloLayoutNode {
    id: number;
    // Id of the nearest retained ancestor, or null for a root. An id that is
    // not in the input is treated as null: the node draws as a root.
    parent: number | null;
    birth_tick: number;
    // -1 while extant.
    end_tick: number;
    extinct: boolean;
    // Species spliced out of the edge above this node.
    collapsed: number;
}

export interface PhyloSlot {
    id: number;
    // Birth tick.
    x: number;
    // Row index. Unique across the layout, and stable across relayouts.
    y: number;
    // Ticks this species is known to have run for.
    w: number;
    /* The run actually drawn: w, or far enough right to reach this node's
       last child if a descendant branched off after the parent's own end. A
       compressed edge can leave a child's birth outside its parent's lifespan,
       and an edge that starts in empty space reads as a break in the tree. */
    run_w: number;
    parent: number | null;
    // Row of the parent slot, for the vertical connector. null for a root.
    parent_y: number | null;
    extinct: boolean;
    collapsed: number;
    depth: number;
}

export interface PhyloLayoutResult {
    slots: PhyloSlot[];
    by_id: Map<number, PhyloSlot>;
    // Tick range spanned, for scaling x. min_x === max_x for a single instant.
    min_x: number;
    max_x: number;
    // One past the highest row used. Rows freed by dropped nodes leave holes,
    // so this is not the node count.
    rows: number;
}

/* Row assignment that outlives a single layout pass. One of these belongs to
   the panel, not to the layout call: a fresh memory means a fresh tree. */
export class SlotMemory {
    private row_of = new Map<number, number>();
    private occupied = new Set<number>();

    get size(): number {
        return this.row_of.size;
    }

    rowOf(id: number): number | undefined {
        return this.row_of.get(id);
    }

    // World reset / load. The ids restart, so the rows must too.
    reset(): void {
        this.row_of.clear();
        this.occupied.clear();
    }

    /* Give back the rows of nodes the record has dropped. Deleting from a Map
       while iterating it is well-defined and visits every surviving entry. */
    retain(live: ReadonlySet<number>): void {
        for (const [id, row] of this.row_of) {
            if (live.has(id)) continue;
            this.row_of.delete(id);
            this.occupied.delete(row);
        }
    }

    /* The row this node already holds, or -- for one it has never seen -- the
       first free row at or below `from`. Downward only: `from` is the parent's
       row plus one, so a child can never be placed above its parent. */
    claim(id: number, from: number): number {
        const held = this.row_of.get(id);
        if (held !== undefined) return held;
        let row = from > 0 ? from : 0;
        while (this.occupied.has(row)) row++;
        this.row_of.set(id, row);
        this.occupied.add(row);
        return row;
    }
}

/* Siblings in traversal order. Ones that already have rows come first, in row
   order, so an existing arrangement is described rather than fought; new ones
   follow in birth order. Without this a newly reparented child could be
   visited before its long-standing siblings and hand out hints that no free
   row can satisfy near the parent. */
function siblingOrder(memory: SlotMemory) {
    return (a: PhyloLayoutNode, b: PhyloLayoutNode): number => {
        const ra = memory.rowOf(a.id);
        const rb = memory.rowOf(b.id);
        if (ra !== undefined && rb !== undefined) return ra - rb;
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        if (a.birth_tick !== b.birth_tick) return a.birth_tick - b.birth_tick;
        return a.id - b.id;
    };
}

/**
 * Lay out the retained ancestry.
 *
 * @param nodes  the retained set, in any order
 * @param now    current tick, used as the right edge of every extant run
 * @param memory row assignment carried over from the previous call; omit for a
 *               one-shot layout
 */
export function layoutPhylogeny(
    nodes: readonly PhyloLayoutNode[],
    now: number,
    memory: SlotMemory = new SlotMemory(),
): PhyloLayoutResult {
    const present = new Map<number, PhyloLayoutNode>();
    for (const n of nodes) present.set(n.id, n);
    memory.retain(new Set(present.keys()));

    const children = new Map<number, PhyloLayoutNode[]>();
    const roots: PhyloLayoutNode[] = [];
    for (const n of nodes) {
        const parent = n.parent !== null ? present.get(n.parent) : undefined;
        if (!parent) {
            roots.push(n);
            continue;
        }
        const list = children.get(parent.id);
        if (list) list.push(n);
        else children.set(parent.id, [n]);
    }

    const order = siblingOrder(memory);
    roots.sort(order);
    for (const list of children.values()) list.sort(order);

    const slots: PhyloSlot[] = [];
    const by_id = new Map<number, PhyloSlot>();
    let max_row = -1;

    /* An explicit stack rather than recursion: a compressed spine in a
       long-running world runs to hundreds of nodes, and the degradation path
       above the node cap can leave it far longer than that. LIFO with the
       children pushed in reverse visits them in `order`. */
    interface Frame { node: PhyloLayoutNode; depth: number; hint: number }
    const stack: Frame[] = [];
    for (let i = roots.length - 1; i >= 0; i--) {
        stack.push({ node: roots[i], depth: 0, hint: 0 });
    }
    while (stack.length) {
        const frame = stack.pop()!;
        const node = frame.node;
        const row = memory.claim(node.id, frame.hint);
        if (row > max_row) max_row = row;

        const end = node.extinct && node.end_tick >= 0 ? node.end_tick : now;
        const w = end > node.birth_tick ? end - node.birth_tick : 0;
        const slot: PhyloSlot = {
            id: node.id,
            x: node.birth_tick,
            y: row,
            w,
            run_w: w,
            parent: node.parent,
            parent_y: null,
            extinct: node.extinct,
            collapsed: node.collapsed,
            depth: frame.depth,
        };
        slots.push(slot);
        by_id.set(node.id, slot);

        const kids = children.get(node.id);
        if (!kids) continue;
        for (let i = kids.length - 1; i >= 0; i--) {
            stack.push({ node: kids[i], depth: frame.depth + 1, hint: row + 1 });
        }
    }

    /* Second pass: wire each slot to its parent's row and stretch the parent's
       run to reach it. Done here rather than in the walk because a parent is
       visited before it knows where its last child ends. */
    let min_x = Infinity;
    let max_x = -Infinity;
    for (const slot of slots) {
        if (slot.x < min_x) min_x = slot.x;
        if (slot.parent === null) continue;
        const parent = by_id.get(slot.parent);
        if (!parent) {
            // Parent was not in the input, so this drew as a root.
            slot.parent = null;
            continue;
        }
        slot.parent_y = parent.y;
        const reach = slot.x - parent.x;
        if (reach > parent.run_w) parent.run_w = reach;
    }
    for (const slot of slots) {
        const right = slot.x + slot.run_w;
        if (right > max_x) max_x = right;
    }

    return {
        slots,
        by_id,
        min_x: slots.length ? min_x : 0,
        max_x: slots.length ? max_x : 0,
        rows: max_row + 1,
    };
}
