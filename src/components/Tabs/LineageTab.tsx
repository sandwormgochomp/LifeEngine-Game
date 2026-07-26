import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../styles/LineageTab.module.css';
import useEngineValue from '../useEngineValue';
import type Engine from '../../Engine';
import Phylogeny from '../../Stats/Phylogeny';
import FossilRecord from '../../Stats/FossilRecord';
import OrganismThumb, { type ThumbCell } from '../OrganismThumb';
import { applyFocus } from '../notificationFocus';
import {
  layoutPhylogeny,
  SlotMemory,
  type PhyloLayoutResult,
  type PhyloSlot,
} from '../../Rendering/PhyloLayout';

/* The lineage tree: the whole retained ancestry record, drawn as a circuit
   board rather than a cladogram.
 *
 * Every species is a horizontal run from its birth tick to its extinction (or
 * to now, if it is still alive), and a speciation is a right-angle drop from
 * the parent's run to the child's row. Orthogonal on purpose: a smooth
 * dendrogram would read as a biology textbook pasted into the game, whereas
 * hard 1px runs in CRT green are the same thing everything else in this HUD is
 * made of. Extant tips are bright, dead branches are dim, and the line the
 * player is following is the same cyan the decoration pass tints it in.
 *
 * Two things it must not do, both of which the record's own comments call out:
 *
 *   - Pretend a compressed edge is direct descent. Phylogeny splices extinct
 *     pass-through species out and counts them in the survivor's `collapsed`,
 *     so an edge can stand for dozens of species. The count is drawn on the
 *     edge whenever there is room for it, and always in the tooltip.
 *
 *   - Re-walk the tree per frame. `Phylogeny.revision` is the number to
 *     compare, and even that is floored to one relayout per REPAINT_MS.
 *
 * Layout lives in Rendering/PhyloLayout, which is pure and has no DOM, so the
 * part with the interesting arithmetic in it -- row stability across
 * relayouts -- is unit-testable without a canvas.
 */

// Wall-clock floor between relayouts. The record's revision moves on every
// speciation, which in a dense world is several times a tick.
const REPAINT_MS = 200;

const PAD = 8;
// Reserved strip along the top for the tick-axis labels. The tree starts below
// it, so a root at row 0 never sits under its own timestamps.
const PAD_TOP = 20;
// Row pitch in CSS pixels at zoom 1. The floor is 1 rather than sub-pixel: a
// 600-row tree squeezed below that stops being a tree and becomes a smear.
const MIN_PITCH = 1;
const MAX_PITCH = 13;
const MAX_ZOOM = 24;
// Pitch at which an edge's compressed-species count is worth drawing.
const BADGE_PITCH = 9;

const GREEN = '#00ff41';
const GREEN_DIM = 'rgba(0, 255, 65, 0.34)';
const EDGE = 'rgba(0, 255, 65, 0.4)';
const EDGE_DIM = 'rgba(0, 255, 65, 0.18)';
// The same cyan DecorationRenderer tints the followed line in, so the lineage
// card and this panel visibly name the same thing.
const CYAN = '#00d9ff';
const CYAN_DIM = 'rgba(0, 217, 255, 0.45)';
const HOVER = '#eafff2';

interface View {
  zoom: number;
  ox: number;
  oy: number;
}

interface Transform {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  min_x: number;
}

interface HoverInfo {
  id: number;
  name: string;
  cells: ThumbCell[] | null;
  extinct: boolean;
  population: number;
  peak: number;
  collapsed: number;
  birth: number;
  end: number;
  tracked: boolean;
  // Anchor in canvas-box coordinates. The node, not the cursor: a tooltip that
  // chases the pointer over 1px rows is unreadable at speed.
  ax: number;
  ay: number;
}

interface LineageTabProps {
  engine: Engine | null;
  // The handler LifeformsModal uses, so a species opens in the lab the same way
  // from either surface.
  onOpenInLab: (raw: unknown, name: string) => void;
  // Where a shift-click falls back to when nothing of the species is alive.
  onOpenLifeforms: (species?: string) => void;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function transformOf(layout: PhyloLayoutResult, view: View, w: number, h: number): Transform {
  const span = Math.max(1, layout.max_x - layout.min_x);
  const base_x = Math.max(0.0001, (w - PAD * 2) / span);
  const base_y = clamp((h - PAD_TOP - PAD) / Math.max(1, layout.rows), MIN_PITCH, MAX_PITCH);
  return { sx: base_x * view.zoom, sy: base_y * view.zoom, ox: view.ox, oy: view.oy, min_x: layout.min_x };
}

// Integer device coordinates: every run and connector is a fillRect, never a
// stroke, so the tree stays hard-edged at any zoom.
const atX = (t: Transform, x: number) => Math.round(PAD + (x - t.min_x) * t.sx + t.ox);
const atY = (t: Transform, y: number) => Math.round(PAD_TOP + y * t.sy + t.oy);

/* Gridline spacing: the 1/2/5 decade step that puts roughly `target` lines
   across the visible span. Without these the x axis is unlabelled and a burst
   of speciation crammed against the right edge reads as "the tree is broken"
   rather than "most of this happened recently". */
function niceStep(span: number, target: number): number {
    const raw = Math.max(1, span) / Math.max(1, target);
    const decade = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / decade;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * decade;
}

function clampView(layout: PhyloLayoutResult, view: View, w: number, h: number): void {
  const t = transformOf(layout, view, w, h);
  const content_w = (layout.max_x - layout.min_x) * t.sx + PAD * 2;
  const content_h = layout.rows * t.sy + PAD_TOP + PAD;
  view.ox = content_w <= w ? 0 : clamp(view.ox, w - content_w, 0);
  view.oy = content_h <= h ? 0 : clamp(view.oy, h - content_h, 0);
}

/* An extinct node carries its own body-plan snapshot; an extant one does not,
   because snapshotting every speciation would allocate at the birth rate. The
   live anatomy is read here at hover time and never stored. Same split
   LineageAncestry makes, for the same reason. */
function cellsFor(id: number): ThumbCell[] | null {
  const node = Phylogeny.get(id);
  if (!node) return null;
  if (node.cells) return node.cells as ThumbCell[];
  const live = FossilRecord.extant_species[node.name];
  return (live?.anatomy?.cells as ThumbCell[] | undefined) ?? null;
}

/* The species ids the followed line currently occupies. A followed line is a
   set of organisms, not a species -- a mutated descendant founds a new one and
   is still the same line -- so this asks the tracker per organism rather than
   matching on name. Recomputed per relayout, which is where the cost belongs.

   Names are display strings only: FossilRecord is keyed by name and a name can
   be reclaimed by an unrelated later lineage, so everything here keys off the
   numeric id. */
function trackedSpeciesIds(engine: Engine): Set<number> {
  const ids = new Set<number>();
  const lineage = engine.env.lineage;
  if (!lineage.following) return ids;
  if (lineage.founder_species_id) ids.add(lineage.founder_species_id);
  for (const org of engine.env.organisms) {
    if (!org.living || !lineage.isTracked(org)) continue;
    const id = org.species?.id;
    if (id) ids.add(id);
  }
  return ids;
}

const LineageTab: React.FC<LineageTabProps> = ({ engine, onOpenInLab, onOpenLifeforms }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<PhyloLayoutResult | null>(null);
  // Survives every relayout for the lifetime of the panel; that persistence is
  // the whole reason the tree holds still. Reset when the record is cleared.
  const memoryRef = useRef(new SlotMemory());
  const viewRef = useRef<View>({ zoom: 1, ox: 0, oy: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const trackedRef = useRef<Set<number>>(new Set());
  const hoverRef = useRef<number>(0);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const lastLayoutRef = useRef(0);
  const lastSizeRef = useRef(0);

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [counts, setCounts] = useState({ nodes: 0, extant: 0, span: 0 });
  // False until the first relayout, so "nothing on record" is a finding rather
  // than a frame of the panel opening.
  const [ready, setReady] = useState(false);

  /* Everything the painter reads is a ref, so this closure never changes and
     the relayout effect below does not resubscribe on every render. */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    const layout = layoutRef.current;
    if (!layout || !layout.slots.length || w <= 0 || h <= 0) return;

    const t = transformOf(layout, viewRef.current, w, h);
    const tracked = trackedRef.current;
    const hovered = hoverRef.current;

    /* The time grid, under everything. Ticks, on the same left-to-right axis
       the stats charts use. */
    const step = niceStep(w / t.sx, 6);
    const first = Math.ceil(layout.min_x / step) * step;
    const marks: number[] = [];
    ctx.fillStyle = 'rgba(0, 255, 65, 0.09)';
    for (let tick = first; ; tick += step) {
      const x = atX(t, tick);
      if (x > w) break;
      if (x >= 0) {
        ctx.fillRect(x, 0, 1, h);
        marks.push(tick);
      }
    }
    // The axis strip, over the gridlines and under the tree.
    ctx.fillStyle = 'rgba(0, 6, 2, 0.9)';
    ctx.fillRect(0, 0, w, PAD_TOP - 5);
    ctx.font = "12px 'VT323', monospace";
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.34)';
    for (const tick of marks) ctx.fillText(tick.toLocaleString(), atX(t, tick) + 3, 2);

    // "Now": the right edge of every living run, marked so a tip that stops
    // short of it reads as a species that has not been seen since.
    const now_x = atX(t, layout.max_x);
    ctx.fillStyle = 'rgba(0, 255, 65, 0.16)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(now_x, y, 1, 2);

    // Pass 1: the right-angle drops. Under the runs, so a busy fork still reads
    // as branches off a spine rather than a lattice.
    for (const slot of layout.slots) {
      if (slot.parent_y === null) continue;
      const x = atX(t, slot.x);
      const y0 = atY(t, slot.parent_y);
      const y1 = atY(t, slot.y);
      const top = Math.min(y0, y1);
      const height = Math.abs(y1 - y0) + 1;
      if (x < -2 || x > w + 2 || top > h || top + height < 0) continue;
      ctx.fillStyle = tracked.has(slot.id) ? CYAN_DIM : slot.extinct ? EDGE_DIM : EDGE;
      ctx.fillRect(x, top, 1, height);
    }

    // Pass 2: the species themselves.
    for (const slot of layout.slots) {
      const y = atY(t, slot.y);
      if (y < -2 || y > h + 2) continue;
      const x0 = atX(t, slot.x);
      const x1 = atX(t, slot.x + slot.run_w);
      if (x1 < -2 || x0 > w + 2) continue;
      const is_tracked = tracked.has(slot.id);
      ctx.fillStyle = slot.id === hovered
        ? HOVER
        : is_tracked
          ? (slot.extinct ? CYAN_DIM : CYAN)
          : (slot.extinct ? GREEN_DIM : GREEN);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);

      /* A living tip gets a solid head and a dead one a cross-cut, so the
         extant frontier is readable at any zoom -- at 1px pitch the runs
         themselves blur into a field and colour alone cannot carry it. */
      if (!slot.extinct) {
        ctx.fillRect(x1 - 1, y - 1, 3, 3);
      } else if (x1 - x0 > 2) {
        ctx.fillRect(x1, y - 1, 1, 3);
      }
    }

    // Pass 3: the compressed-species counts, when the rows are far enough apart
    // to put a number between them.
    if (t.sy >= BADGE_PITCH) {
      ctx.font = "11px 'VT323', monospace";
      ctx.textBaseline = 'bottom';
      for (const slot of layout.slots) {
        if (!slot.collapsed) continue;
        const y = atY(t, slot.y);
        const x = atX(t, slot.x);
        if (y < 8 || y > h || x < -20 || x > w) continue;
        ctx.fillStyle = tracked.has(slot.id) ? CYAN : 'rgba(0, 255, 65, 0.62)';
        ctx.fillText(`+${slot.collapsed}`, x + 3, y - 1);
      }
    }

    // Pass 4: the hovered node's own drop, repainted on top so the branch it
    // came off is obvious while the tooltip is up.
    if (hovered) {
      const slot = layout.by_id.get(hovered);
      if (slot && slot.parent_y !== null) {
        const x = atX(t, slot.x);
        const y0 = atY(t, slot.parent_y);
        const y1 = atY(t, slot.y);
        ctx.fillStyle = HOVER;
        ctx.fillRect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
      }
      if (slot) {
        const x = atX(t, slot.x);
        const y = atY(t, slot.y);
        ctx.fillStyle = HOVER;
        ctx.fillRect(x - 2, y - 2, 5, 5);
      }
    }
  }, []);

  // Slot under the pointer, or null. Linear over the retained set, which is
  // ~600 nodes in a dense world -- cheaper than any index would be to keep
  // current across relayouts.
  const hit = useCallback((mx: number, my: number): PhyloSlot | null => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const { w, h } = sizeRef.current;
    const t = transformOf(layout, viewRef.current, w, h);
    const tol = Math.max(3, t.sy / 2);
    let best: PhyloSlot | null = null;
    let best_dy = Infinity;
    for (const slot of layout.slots) {
      const dy = Math.abs(atY(t, slot.y) - my);
      if (dy > tol || dy >= best_dy) continue;
      const x0 = atX(t, slot.x);
      const x1 = atX(t, slot.x + slot.run_w);
      if (mx < x0 - 3 || mx > x1 + 4) continue;
      best = slot;
      best_dy = dy;
    }
    return best;
  }, []);

  const relayout = useCallback(() => {
    if (!engine) return;
    const nodes = Phylogeny.retained();
    // A cleared record (world reset or load) restarts the species ids, so the
    // rows they were holding mean nothing any more.
    if (!nodes.length) memoryRef.current.reset();
    const layout = layoutPhylogeny(nodes, engine.env.total_ticks, memoryRef.current);
    layoutRef.current = layout;
    trackedRef.current = trackedSpeciesIds(engine);
    clampView(layout, viewRef.current, sizeRef.current.w, sizeRef.current.h);
    let extant = 0;
    for (const slot of layout.slots) if (!slot.extinct) extant++;
    const span = Math.round(layout.max_x - layout.min_x);
    setCounts(prev =>
      prev.nodes === layout.slots.length && prev.extant === extant && prev.span === span
        ? prev
        : { nodes: layout.slots.length, extant, span });
    setReady(true);
    draw();
  }, [engine, draw]);

  /* The repaint policy. `revision` is a number bumped on every structural
     change to the record, compared through useSyncExternalStore's Object.is --
     so this re-renders only when the tree actually moved, not on every engine
     emit. The wall-clock floor then keeps a world speciating several times a
     tick down to five relayouts a second. */
  const revision = useEngineValue(engine, () => Phylogeny.revision, 0);
  // Following a different line repaints too: it decides what is cyan.
  const followed = useEngineValue(engine, e => e.env.lineage.founder_species_id, 0);

  useEffect(() => {
    if (!engine) return;
    const since = performance.now() - lastLayoutRef.current;
    if (since >= REPAINT_MS) {
      lastLayoutRef.current = performance.now();
      relayout();
      return;
    }
    const timer = window.setTimeout(() => {
      lastLayoutRef.current = performance.now();
      relayout();
    }, REPAINT_MS - since);
    return () => window.clearTimeout(timer);
  }, [engine, revision, followed, relayout]);

  // Canvas backing size follows the box. Kept off the React render path: a
  // resize is a repaint, not a state change.
  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const measure = () => {
      const rect = box.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (w === sizeRef.current.w && h === sizeRef.current.h) return;
      sizeRef.current = { w, h };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      // The first measurement is also the first chance to fit the view.
      if (!lastSizeRef.current) {
        lastSizeRef.current = 1;
        viewRef.current = { zoom: 1, ox: 0, oy: 0 };
      }
      const layout = layoutRef.current;
      if (layout) clampView(layout, viewRef.current, w, h);
      draw();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [draw]);

  /* Wheel zoom, anchored on the pointer. A native listener because React
     registers onWheel passively at the root, where preventDefault is ignored
     and the panel would scroll behind the tree. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      e.preventDefault();
      const { w, h } = sizeRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const view = viewRef.current;
      const before = transformOf(layout, view, w, h);
      const at_x = (mx - PAD - view.ox) / before.sx;
      const at_y = (my - PAD_TOP - view.oy) / before.sy;
      view.zoom = clamp(view.zoom * (e.deltaY < 0 ? 1.25 : 0.8), 1, MAX_ZOOM);
      const after = transformOf(layout, view, w, h);
      view.ox = mx - PAD - at_x * after.sx;
      view.oy = my - PAD_TOP - at_y * after.sy;
      clampView(layout, view, w, h);
      draw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [draw]);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const drag = dragRef.current;
    if (drag) {
      const view = viewRef.current;
      view.ox += e.clientX - drag.x;
      view.oy += e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = true;
      clampView(layout, view, sizeRef.current.w, sizeRef.current.h);
      draw();
      return;
    }

    const slot = hit(mx, my);
    const id = slot?.id ?? 0;
    if (id === hoverRef.current) return;
    hoverRef.current = id;
    if (!slot) {
      setHover(null);
      draw();
      return;
    }
    const node = Phylogeny.get(slot.id);
    const t = transformOf(layout, viewRef.current, sizeRef.current.w, sizeRef.current.h);
    setHover({
      id: slot.id,
      name: node?.name ?? '???',
      cells: cellsFor(slot.id),
      extinct: slot.extinct,
      population: node && !slot.extinct
        ? (FossilRecord.extant_species[node.name]?.population ?? 0)
        : 0,
      peak: node?.peak_pop ?? 0,
      collapsed: slot.collapsed,
      birth: slot.x,
      end: slot.x + slot.w,
      tracked: trackedRef.current.has(slot.id),
      ax: clamp(atX(t, slot.x + slot.run_w), 0, sizeRef.current.w),
      ay: clamp(atY(t, slot.y), 0, sizeRef.current.h),
    });
    draw();
  };

  const onPointerLeave = () => {
    dragRef.current = null;
    if (!hoverRef.current) return;
    hoverRef.current = 0;
    setHover(null);
    draw();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };

  /* A click that did not pan. Opening the species in the lab is the primary
     action -- it is the one that works for an extinct node too, which is most
     of the tree. Shift-click hands the same species to the shared focus
     resolver, which centres the camera on a living member and follows it (and
     falls back to the fossil record when the lineage has nothing left). */
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag || drag.moved) return;
    const id = hoverRef.current;
    if (!id) return;
    const node = Phylogeny.get(id);
    if (!node) return;

    if (e.shiftKey) {
      applyFocus({ kind: 'species', name: node.name }, engine, {
        openLifeforms: onOpenLifeforms,
        // Unreachable for a species focus; the resolver only ever calls
        // openLifeforms on this branch.
        openEvolution: () => {},
        openPanel: () => {},
      });
      return;
    }

    /* Never hand the editor a live anatomy: serialize the extant case the way
       the Lifeforms picker does, and use the record's own flat snapshot for the
       extinct one. */
    const live = FossilRecord.extant_species[node.name];
    const cells = live?.anatomy ? live.anatomy.serialize().cells : node.cells;
    if (!cells?.length) return;
    onOpenInLab({ anatomy: { cells }, species_name: node.name }, node.name);
  };

  const resetView = () => {
    viewRef.current = { zoom: 1, ox: 0, oy: 0 };
    const layout = layoutRef.current;
    if (layout) clampView(layout, viewRef.current, sizeRef.current.w, sizeRef.current.h);
    draw();
  };

  return (
    <div className={styles.lineageTab} data-testid="lineage-tab">
      <div className={styles.lineageLegend}>
        <span className={styles.lineageCount} data-testid="lineage-counts">
          {counts.extant} living · {counts.nodes} on record · {counts.span.toLocaleString()} ticks
        </span>
        <span className={styles.lineageKeyItem}>
          <i className={styles.lineageSwatchLive} />living
        </span>
        <span className={styles.lineageKeyItem}>
          <i className={styles.lineageSwatchDead} />extinct
        </span>
        <span className={styles.lineageKeyItem}>
          <i className={styles.lineageSwatchFollow} />followed
        </span>
        <button
          className={styles.lineageReset}
          data-testid="lineage-reset-view"
          title="Fit the whole tree back in the frame"
          onClick={resetView}
        >
          FIT
        </button>
      </div>

      <div className={styles.lineageBox} ref={boxRef}>
        <canvas
          ref={canvasRef}
          className={styles.lineageCanvas}
          data-testid="lineage-canvas"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        />
        {ready && counts.nodes === 0 && (
          <p className={styles.lineageEmpty}>
            Nothing on record yet — the tree fills in as species branch off one another.
          </p>
        )}
        {hover && (
          <div
            className={styles.lineageTip}
            data-testid="lineage-tooltip"
            style={{
              left: `${hover.ax}px`,
              top: `${hover.ay}px`,
              /* Flip back over the anchor near the far edges, so the tooltip
                 never leaves the frame it belongs to. The thresholds are the
                 tooltip's own footprint (196px wide plus padding and offset),
                 not a guess -- one short of it and the card clips. */
              transform: `translate(${hover.ax > sizeRef.current.w - 224 ? '-100%' : '0'}, ${
                hover.ay > sizeRef.current.h - 130 ? '-100%' : '0'
              })`,
            }}
          >
            <div className={styles.lineageTipHead}>
              {hover.cells
                ? <OrganismThumb cells={hover.cells} size={30} decorated />
                : <span className={styles.lineageTipUnknown}>?</span>}
              <span className={hover.tracked ? styles.lineageTipNameFollowed : styles.lineageTipName}>
                {hover.name}
              </span>
            </div>
            <div className={styles.lineageTipRows}>
              {/* Both numbers on the first two rows are ticks, which is what
                  the axis above the tree is measured in. */}
              <span>arose</span>
              <b>{hover.birth.toLocaleString()}</b>
              <span>{hover.extinct ? 'died out' : 'alive'}</span>
              <b>{hover.extinct ? hover.end.toLocaleString() : `pop ${hover.population.toLocaleString()}`}</b>
              <span>peak pop</span>
              <b>{hover.peak.toLocaleString()}</b>
              {hover.collapsed > 0 && <>
                <span>via</span>
                <b>+{hover.collapsed.toLocaleString()} species</b>
              </>}
            </div>
            <div className={styles.lineageTipHint}>click: open in lab · shift: go there</div>
          </div>
        )}
      </div>

      <p className={styles.lineageFoot}>
        Time runs left to right. A drop is a speciation; <b>+n</b> on an edge counts the
        species compressed out of it. Drag to pan, scroll to zoom.
      </p>
    </div>
  );
};

export default LineageTab;
