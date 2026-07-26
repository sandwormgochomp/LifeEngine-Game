import type { NotificationCell } from "../Utils/Notifier";

/* Species-level ancestry, kept as a durable record beside the FossilRecord.

   Why this exists separately from Species.ancestor: a Species holds a live
   Anatomy, whose BodyCells point back at an Organism, so a chain of ancestor
   pointers pins an arbitrarily large object graph. FossilRecord.fossilize()
   therefore nulls `ancestor` on extinction -- which is correct, and which is
   also why no ancestry survives long enough to draw: nearly every species goes
   extinct. This module records the same edge as a pair of integers, so the
   shape of the tree outlives the objects that made it.

   Nothing in here ever holds a Species (or an Organism, or a BodyCell). Nodes
   carry numeric ids, the display name, and -- for the few nodes worth drawing
   -- a flat body-plan snapshot of the same shape the Narrator and
   LineageTracker take.

   NOT SERIALIZED. Deliberate, and deferred: WorldEnvironment.loadRaw mints
   every saved species as a fresh root, so a loaded world starts its ancestry
   from scratch. Saving the tree means giving saves a stable species id, which
   is a format change this first pass does not make.

   --- bounded memory ---

   Speciation happens on every mutated birth, so in a dense, high-mutability
   world the record would grow at very nearly the birth rate. Three policies
   keep it bounded, in order of how much they do:

   1. COALESCENT RETENTION. A node is retained only if it is extant or has at
      least one retained descendant -- i.e. the retained set is the extant
      species plus their common ancestry. A branch whose last member dies is
      dropped whole. Retention is tracked by the node's own retained-children
      set (unretained nodes are deleted outright, so the set *is* the count),
      and a drop only walks up while each parent's count crosses 1 -> 0. In the
      common case -- an ephemeral mutant dying childless off a live parent --
      that walk stops at the first step.

   2. PATH COMPRESSION. An extinct retained node with exactly one retained
      child and a parent is spliced out, and the count of what was spliced is
      added to the surviving child's `collapsed`. So the record says "37
      species passed through here" rather than pretending nothing did. After
      compression the retained tree holds at most 2L-1 nodes for L extant
      species.

   3. NOTABLE-EXTINCT RESERVE. Pure coalescent retention erases history: a
      clade that ruled for 50,000 ticks vanishes the instant its last member
      dies, which is the opposite of what a player wants to see. A fixed-size
      side set keeps the extinct nodes with the highest peak population (and,
      through retention, their compressed spine), evicting the lowest peak on
      overflow.

   Plus a hard cap, which raises the notability floor rather than failing. The
   cap cannot always be met -- L extant species need L nodes and none of them
   may be dropped -- so it is a degradation path, not an invariant. */

// How many extinct species are kept for their own sake.
const NOTABLE_CAPACITY = 200;
/* Floor on entry to the reserve, so the first 200 extinctions of a run cannot
   squat in it. Set to FossilRecord's own min_discard, which draws the same line
   for the same reason: a lineage that never got past a handful of members is
   not part of the story. Without this the reserve fills with the origin world's
   first few hundred stillborn mutants and only clears once something notable
   displaces each one. */
const NOTABLE_MIN_PEAK = 10;
/* Node budget. Above this the notable reserve is culled hard. The extant
   species alone can exceed it in a dense world; see the comment above. */
const MAX_NODES = 4000;
// The reserve is culled down to this fraction of capacity when the cap is hit,
// so the cap is not re-hit on the very next speciation.
const CULL_TO = 0.5;

/* What Phylogeny reads off a species. Structurally typed, so this module never
   imports Species (which would close a cycle through FossilRecord) and so the
   test suite can drive the record with plain objects. */
export interface PhyloSubject {
    id: number;
    name: string;
}

export class PhyloNode {
    // Stable species id. The map key, and the only thing edges are made of.
    id: number;
    // Display name, kept in sync through FossilRecord.changeSpeciesName.
    name: string;
    /* Parent id *after compression*, so this is "the nearest retained
       ancestor", not necessarily the species this one mutated from. null for a
       root -- either a genuine origin/editor/preset species, or one whose
       parent was never registered. */
    parent: number | null;
    // Retained children only; unretained nodes are deleted, so this is exact.
    children: Set<number>;
    birth_tick: number;
    end_tick: number;
    extinct: boolean;
    // Highest simultaneous population ever reached. Decides notability.
    peak_pop: number;
    // Species spliced out of the edge between this node and its parent.
    collapsed: number;
    // Held for the notable reserve only. Extant nodes resolve their body plan
    // live off FossilRecord instead of paying for a snapshot per speciation.
    cells: NotificationCell[] | null;
    // In the notable-extinct reserve, which retains it on its own merit.
    notable: boolean;

    constructor(id: number, name: string, parent: number | null, tick: number) {
        this.id = id;
        this.name = name;
        this.parent = parent;
        this.children = new Set();
        this.birth_tick = tick;
        this.end_tick = -1;
        this.extinct = false;
        this.peak_pop = 1;
        this.collapsed = 0;
        this.cells = null;
        this.notable = false;
    }
}

// The same flat snapshot LineageTracker.previewOf and Narrator.previewOf take:
// this outlives the anatomy it came from, so it must not hold live BodyCells.
function snapshot(cells: readonly NotificationCell[] | null | undefined): NotificationCell[] | null {
    if (!cells || !cells.length) return null;
    return cells.map(c => ({
        loc_col: c.loc_col,
        loc_row: c.loc_row,
        direction: c.direction,
        state: { name: c.state?.name },
    }));
}

class Phylogeny {
    private nodes = new Map<number, PhyloNode>();
    private notable = new Set<PhyloNode>();
    /* Peak population a newly extinct species must beat to enter a full
       reserve. Rises as the reserve fills and when the hard cap is hit, so the
       usual case -- a mutant that never got past a handful of members -- costs
       one comparison and no scan. */
    private notable_floor = 0;
    /* Bumped on every structural change. The React layer compares this with
       Object.is through useEngineValue, so it must stay a number. */
    revision = 0;

    get size(): number {
        return this.nodes.size;
    }

    get notable_size(): number {
        return this.notable.size;
    }

    clear(): void {
        this.nodes.clear();
        this.notable.clear();
        this.notable_floor = 0;
        this.revision++;
    }

    get(id: number): PhyloNode | undefined {
        return this.nodes.get(id);
    }

    /* A new species branched off `parent`. Called from the one place a species
       enters the world (FossilRecord.addSpeciesObj); `parent` is null for
       roots, and is also treated as null when it names a species this record
       never saw (an editor-minted Species, or one from before a clear). */
    record(child: PhyloSubject, parent: PhyloSubject | null, tick: number): PhyloNode {
        const existing = this.nodes.get(child.id);
        if (existing) return existing;
        const parent_node = parent ? this.nodes.get(parent.id) : undefined;
        const node = new PhyloNode(child.id, child.name, parent_node ? parent_node.id : null, tick);
        this.nodes.set(node.id, node);
        // A new node is extant, hence retained, so it retains its parent too --
        // and the parent was already retained (it has a retained child, or is
        // itself extant), so there is nothing to propagate upward.
        if (parent_node) parent_node.children.add(node.id);
        this.revision++;
        if (this.nodes.size > MAX_NODES) this.enforceCap();
        return node;
    }

    // An extinct species dropped back in from the editor. Its node may have
    // been pruned; re-registering it as a root beats losing it silently.
    resurrect(species: PhyloSubject, tick: number): void {
        const node = this.nodes.get(species.id);
        if (!node) {
            this.record(species, null, tick);
            return;
        }
        node.extinct = false;
        node.end_tick = -1;
        this.revision++;
    }

    rename(id: number, name: string): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.name = name;
        this.revision++;
    }

    /* Population accounting, from Species.addPop -- one map lookup per birth.
       Only the peak is kept; the live count belongs to the Species. */
    onPop(id: number, population: number): void {
        const node = this.nodes.get(id);
        if (node && population > node.peak_pop) node.peak_pop = population;
    }

    /* The last member died. `cells` is the extinct species' anatomy, snapshotted
       only if the node survives the prune below -- which is why it is passed in
       rather than fetched: the overwhelmingly common case is a node that is
       dropped here, and that case must allocate nothing. */
    onExtinct(id: number, tick: number, cells?: readonly NotificationCell[] | null): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.extinct = true;
        node.end_tick = tick;
        this.considerNotable(node);
        this.pruneFrom(node);
        // Survived as a spine node or on its own merit, so it may get drawn.
        if (this.nodes.has(id) && !node.cells) node.cells = snapshot(cells);
        this.revision++;
    }

    // Root -> node, inclusive of `node`. Empty if the id has been pruned.
    ancestorsOf(id: number): PhyloNode[] {
        const chain: PhyloNode[] = [];
        let cur = this.nodes.get(id);
        // The parent chain is acyclic by construction, but a bad splice would
        // hang the render thread, so bound the walk by the node count.
        let guard = this.nodes.size + 1;
        while (cur && guard-- > 0) {
            chain.push(cur);
            cur = cur.parent !== null ? this.nodes.get(cur.parent) : undefined;
        }
        chain.reverse();
        return chain;
    }

    // Every node still held. Callers must treat these as read-only.
    retained(): PhyloNode[] {
        return Array.from(this.nodes.values());
    }

    roots(): PhyloNode[] {
        return this.retained().filter(n => n.parent === null);
    }

    /* --- retention machinery --- */

    private isRetained(node: PhyloNode): boolean {
        return !node.extinct || node.notable || node.children.size > 0;
    }

    /* Drop `node` and every ancestor the drop leaves unretained, then compress
       the highest survivor. The loop stops at the first parent that keeps
       another child or is still extant, which is the common case -- so this is
       amortised O(1) per speciation, not O(depth). */
    private pruneFrom(node: PhyloNode): void {
        let cur: PhyloNode | undefined = node;
        while (cur && !this.isRetained(cur)) {
            const parent: PhyloNode | undefined =
                cur.parent !== null ? this.nodes.get(cur.parent) : undefined;
            this.nodes.delete(cur.id);
            this.notable.delete(cur);
            if (parent) parent.children.delete(cur.id);
            cur = parent;
        }
        if (cur) this.compressFrom(cur);
    }

    /* Splice out extinct pass-through nodes, walking toward the root. Each
       splice leaves the parent with the same child count, so the only new
       candidate is the parent itself -- hence the walk rather than a rescan. */
    private compressFrom(node: PhyloNode): void {
        let cur: PhyloNode | undefined = node;
        while (cur) {
            const parent: PhyloNode | undefined =
                cur.parent !== null ? this.nodes.get(cur.parent) : undefined;
            // Roots are kept even when they are pass-throughs: the origin of a
            // lineage is the one extinct node a player always wants named.
            if (!parent || !cur.extinct || cur.notable || cur.children.size !== 1) return;
            const child_id: number = cur.children.values().next().value as number;
            const child = this.nodes.get(child_id);
            if (!child) return;
            child.parent = parent.id;
            child.collapsed += cur.collapsed + 1;
            parent.children.delete(cur.id);
            parent.children.add(child_id);
            this.nodes.delete(cur.id);
            cur = parent;
        }
    }

    /* --- notable-extinct reserve --- */

    private considerNotable(node: PhyloNode): void {
        if (node.peak_pop < NOTABLE_MIN_PEAK) return;
        if (this.notable.size < NOTABLE_CAPACITY) {
            node.notable = true;
            this.notable.add(node);
            return;
        }
        if (node.peak_pop <= this.notable_floor) return;
        const weakest = this.weakestNotable();
        if (!weakest || weakest.peak_pop >= node.peak_pop) return;
        this.demote(weakest);
        /* Promote before pruning the one it displaced: without the flag set
           first, a prune that walks up through `node` would drop the very node
           being promoted, and the reserve would then hold a deleted id. */
        node.notable = true;
        this.notable.add(node);
        /* And the displaced node has to actually go. Demoting alone only
           removes its own claim to be kept -- it is still in the node map, and
           an extinct childless node with no claim is exactly what pruneFrom
           exists to drop. Leaving this out leaked one node per eviction: 10,000
           speciations retained ~1,000 nodes instead of ~200. */
        this.pruneFrom(weakest);
        this.notable_floor = this.weakestNotable()?.peak_pop ?? 0;
    }

    private weakestNotable(): PhyloNode | null {
        let weakest: PhyloNode | null = null;
        for (const n of this.notable) {
            if (!weakest || n.peak_pop < weakest.peak_pop) weakest = n;
        }
        return weakest;
    }

    // Strip the reserve flag. The node stays only if the coalescent rule keeps
    // it; pruneFrom is what decides, and is left to the caller so a bulk cull
    // does not walk the same spine repeatedly.
    private demote(node: PhyloNode): void {
        node.notable = false;
        this.notable.delete(node);
    }

    /* Over budget. Cull the reserve to its weakest half and raise the floor so
       the next speciations do not immediately refill it. If the extant set
       alone is over the cap there is nothing further to give -- every remaining
       node is either alive or on the path between two that are -- and the
       record simply runs larger. */
    private enforceCap(): void {
        const keep = Math.floor(NOTABLE_CAPACITY * CULL_TO);
        const ranked = Array.from(this.notable).sort((a, b) => b.peak_pop - a.peak_pop);
        const doomed = ranked.slice(keep);
        for (const n of doomed) this.demote(n);
        this.notable_floor = ranked[keep - 1]?.peak_pop ?? this.notable_floor;
        for (const n of doomed) {
            // Each may already be gone: dropping one can drop its ancestors.
            if (this.nodes.has(n.id)) this.pruneFrom(n);
        }
    }
}

const instance = new Phylogeny();
export default instance;
