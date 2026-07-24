import Cell from "../Organism/Cell/GridCell";
import type GridMap from "../Grid/GridMap";
import type { RenderEnvLike, OrgCellPatch } from "../Organism/Cell/CellStates";
import CellStates, {
    BASE_CELL_RENDER,
    ORG_CELL_DOT_STYLE,
    computeOrgCellPatch,
    drawOrgCellCorners,
    drawOrgCellDot,
    emptyBackdropColor,
} from "../Organism/Cell/CellStates";

/* Models only what the renderer reaches through. The body cells are opaque
   here -- they are only ever handed straight back to getRealCellIndex() -- so
   this deliberately stays looser than the real Organism/Anatomy. */
interface RendererOrganismLike {
    anatomy: { cells: unknown[] };
    getRealCellIndex(org_cell: unknown): number;
}

/* Anatomy's chameleon flag. RenderOrganismLike (shared with CellStates) models
   only what CellState.render needs, so this one extra flag is read through a
   widening cast rather than by broadening the shared shape. */
type AnatomyWithChameleon = { has_chameleon?: boolean };

function isChameleon(owner: { anatomy?: unknown } | null): boolean {
    if (!owner || !owner.anatomy) return false;
    return Boolean((owner.anatomy as AnatomyWithChameleon).has_chameleon);
}

// The part of the world (in canvas px) actually on screen; see updateView()
interface ViewRect { x0: number; y0: number; x1: number; y1: number; }

/* Full-grid repaints only cull to the view above this many cells. Below it a
   full pass is fast enough (~60ms at 84k cells) that pre-painting the whole
   canvas is the better trade: pan and zoom then never have stale cells to
   reveal. Above it the full pass is a multi-hundred-ms freeze (317ms at
   Epic's 468k, 1.5s at 2.1M), so those worlds paint the view and defer the
   rest to the pan/zoom promotion path. */
const FULL_GRID_CULL_MIN_CELLS = 120_000;

/* Cells are tracked by their linear grid index, never by a Cell object: the
   grid stores typed arrays and hands out fresh views on demand, so two views
   of one cell are equal in content but not identity, and a Set of them would
   fill with duplicates. See GridCell. */
type CellIndex = number;

// Renderer controls access to a canvas. There is one renderer for each canvas.
// The canvas may be bound after construction (and unbound) for canvases owned
// by React components that mount and unmount; render calls are no-ops while
// no canvas is bound.
class Renderer {
    cell_size: number;
    cells_to_render: Set<CellIndex>;
    cells_to_highlight: Set<CellIndex>;
    highlighted_cells: Set<CellIndex>;
    height: number;
    width: number;
    /* Assigned by bindCanvas(), which the constructor calls. */
    canvas!: HTMLCanvasElement | null;
    container!: HTMLElement | null;
    ctx!: CanvasRenderingContext2D | null;
    /* Both bolted on from outside by the owning environment right after it
       builds its grid: every cell index this renderer holds indexes into that
       one map. `env` additionally carries the neighbour probe the organism
       patch computation needs, and the editor's renderer never gets one. */
    grid_map: GridMap | null;
    env?: RenderEnvLike;
    /* One reusable view, handed to the bespoke per-cell renderers (Food, the
       walls' glass, Eye) so the slow path allocates nothing per cell. Safe to
       share because render() reads it and returns -- nothing retains it, and
       the neighbour probe underneath goes through the grid's scalar accessors
       rather than asking for more views. */
    private scratch: Cell | null;
    /* Culling state. `view` is the on-screen part of the canvas in canvas px,
       or null when culling is off (no env to repaint revealed cells from --
       i.e. the editor's renderer -- or no canvas on screen). A dirty cell
       outside the view is skipped and flagged stale instead of drawn;
       updateView() repaints stale cells when pan/zoom brings them back. */
    view: ViewRect | null;

    constructor(canvas: HTMLCanvasElement | null, container: HTMLElement | null, cell_size: number) {
        this.cell_size = cell_size;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
        this.height = 0;
        this.width = 0;
        this.grid_map = null;
        this.scratch = null;
        this.view = null;
        this.bindCanvas(canvas, container);
    }

    /* The shared view, re-aimed at `idx`. Never returned to a caller that
       could hold it past the current statement. */
    private viewAt(idx: CellIndex): Cell {
        var map = this.grid_map!;
        if (!this.scratch || this.scratch.map !== map)
            this.scratch = new Cell(map, idx);
        else
            this.scratch.idx = idx;
        return this.scratch;
    }

    bindCanvas(canvas: HTMLCanvasElement | null, container: HTMLElement | null): void {
        this.canvas = canvas;
        this.container = container;
        this.ctx = canvas ? canvas.getContext("2d") : null;
        if (canvas)
            this.fillWindow();
    }

    fillWindow(): void {
        if (this.container) {
            this.fillShape(this.container.clientHeight || window.innerHeight, this.container.clientWidth || window.innerWidth);
        } else {
            this.fillShape(window.innerHeight, window.innerWidth);
        }
    }

    fillShape(height: number, width: number): void {
        this.canvas!.width = width;
        this.canvas!.height = height;
        this.height = this.canvas!.height;
        this.width = this.canvas!.width;
    }

    /* fillRect takes (x, y, width, height); the height and width arguments were
       transposed here. On a square canvas that is invisible, which is how it
       survived -- the bug only shows on a non-square one, where it clears a
       square of the wrong dimension and leaves a strip of the canvas untouched. */
    clear(): void {
        this.ctx!.fillStyle = 'white';
        this.ctx!.fillRect(0, 0, this.width, this.height);
    }

    /* Recompute the visible rect from the live layout: gBCR sees both the
       CSS pan/zoom transform and the centered-inline canvas position, so
       nothing here duplicates the controller's math. When the view moved,
       stale cells in the newly revealed strips are promoted back into the
       dirty set. Called once per renderCells/renderFullGrid, not per cell. */
    updateView(): void {
        const grid_map = this.grid_map;
        if (!this.canvas || !this.container || !grid_map || !this.env) {
            this.view = null;
            return;
        }
        const cr = this.canvas.getBoundingClientRect();
        if (cr.width === 0 || this.canvas.width === 0) {
            this.view = null;
            return;
        }
        const scale = cr.width / this.canvas.width;
        const vr = this.container.getBoundingClientRect();
        const pad = this.cell_size; // one cell of margin against rounding
        const nv: ViewRect = {
            x0: Math.max(0, (vr.left - cr.left) / scale - pad),
            y0: Math.max(0, (vr.top - cr.top) / scale - pad),
            x1: Math.min(this.width, (vr.right - cr.left) / scale + pad),
            y1: Math.min(this.height, (vr.bottom - cr.top) / scale + pad),
        };
        const ov = this.view;
        this.view = nv;
        if (!ov || (nv.x0 === ov.x0 && nv.y0 === ov.y0 && nv.x1 === ov.x1 && nv.y1 === ov.y1))
            return;
        /* Promote stale cells in the newly visible region: nv minus ov as up
           to four strips, so the work scales with what the pan/zoom actually
           revealed, never with the world or the stale population. */
        const strips: ViewRect[] = [];
        if (nv.x0 < ov.x0) strips.push({ x0: nv.x0, x1: Math.min(nv.x1, ov.x0), y0: nv.y0, y1: nv.y1 });
        if (nv.x1 > ov.x1) strips.push({ x0: Math.max(nv.x0, ov.x1), x1: nv.x1, y0: nv.y0, y1: nv.y1 });
        const mx0 = Math.max(nv.x0, ov.x0), mx1 = Math.min(nv.x1, ov.x1);
        if (mx0 < mx1) {
            if (nv.y0 < ov.y0) strips.push({ x0: mx0, x1: mx1, y0: nv.y0, y1: Math.min(nv.y1, ov.y0) });
            if (nv.y1 > ov.y1) strips.push({ x0: mx0, x1: mx1, y0: Math.max(nv.y0, ov.y1), y1: nv.y1 });
        }
        const cs = this.cell_size;
        const stale = grid_map.stale_flags;
        for (const s of strips) {
            const c0 = Math.max(0, Math.floor(s.x0 / cs));
            const c1 = Math.min(grid_map.cols - 1, Math.floor((s.x1 - 0.001) / cs));
            const r0 = Math.max(0, Math.floor(s.y0 / cs));
            const r1 = Math.min(grid_map.rows - 1, Math.floor((s.y1 - 0.001) / cs));
            for (let c = c0; c <= c1; c++) {
                const base = c * grid_map.rows;
                for (let r = r0; r <= r1; r++) {
                    if (stale[base + r])
                        this.addToRender(base + r);
                }
            }
        }
    }

    renderFullGrid(): void {
        if (!this.ctx || !this.grid_map) return;
        this.updateView();
        const map = this.grid_map;
        const total = map.size;
        if (this.view && total > FULL_GRID_CULL_MIN_CELLS) {
            // Big grid: paint the view now, defer the rest to pan/zoom
            // promotion. Culled here rather than through the dirty set so the
            // set never holds millions of off-screen cells.
            const v = this.view;
            const cs = this.cell_size;
            const stale = map.stale_flags;
            for (var c = 0; c < map.cols; c++) {
                const x = c * cs;
                const off_x = x + cs <= v.x0 || x >= v.x1;
                const base = c * map.rows;
                for (var r = 0; r < map.rows; r++) {
                    const y = r * cs;
                    if (off_x || y + cs <= v.y0 || y >= v.y1)
                        stale[base + r] = 1;
                    else
                        this.cells_to_render.add(base + r);
                }
            }
            this.renderCells();
            return;
        }
        map.stale_flags.fill(0);
        for (var i = 0; i < total; i++)
            this.renderCell(i);
    }

    /* Draws the dirty set in batched passes -- flat rects grouped by color,
       food backdrops+dots together, organism patches phase-by-phase (see
       OrgCellPatch) -- so the canvas sees runs of one fillStyle instead of
       several switches per cell. States with bespoke renderers (Food aside)
       and chameleon-translucent organisms take the one-cell path, which
       paints exactly what it always did. */
    renderCells(): void {
        if (!this.ctx || !this.grid_map) return;
        this.updateView();
        const ctx = this.ctx;
        const map = this.grid_map;
        const view = this.view;
        const cs = this.cell_size;
        const rows = map.rows;
        const stale = map.stale_flags;

        /* Batches carry the cell's pixel origin alongside its index: the
           column is one integer division away from the index, and paying it
           once here beats paying it again in every phase that draws the cell. */
        const flat = new Map<string, number[]>();  // color -> [x, y, ...]
        let foods: number[] | null = null;         // [x, y, ...]
        let patches: OrgCellPatch[] | null = null;
        let slow: CellIndex[] | null = null;

        for (const idx of this.cells_to_render) {
            const col = (idx / rows) | 0;
            const x = col * cs;
            const y = (idx - col * rows) * cs;
            if (view && (x + cs <= view.x0 || x >= view.x1 ||
                         y + cs <= view.y0 || y >= view.y1)) {
                stale[idx] = 1;
                continue;
            }
            stale[idx] = 0;
            const state = CellStates.all[map.state_ids[idx]];
            const owner = map.owners[idx];
            const cell_owner = map.cell_owners[idx];
            const is_org = Boolean(owner || cell_owner);
            if (isChameleon(owner)) {
                (slow ??= []).push(idx); // translucent: needs the globalAlpha path
            } else if (state.render !== BASE_CELL_RENDER) {
                if (state === CellStates.food && !is_org) {
                    (foods ??= []).push(x, y);
                } else {
                    (slow ??= []).push(idx);
                }
            } else if (cs > 2 && is_org) {
                (patches ??= []).push(computeOrgCellPatch(state, this.viewAt(idx), cs, this.env));
            } else {
                // Same resolution as the base render's plain-rect branch
                const color = (cell_owner && cell_owner.custom_color) || state.color;
                let arr = flat.get(color);
                if (!arr) flat.set(color, arr = []);
                arr.push(x, y);
            }
        }
        this.cells_to_render.clear();

        for (const [color, xy] of flat) {
            ctx.fillStyle = color;
            for (let i = 0; i < xy.length; i += 2)
                ctx.fillRect(xy[i], xy[i + 1], cs, cs);
        }

        if (foods) {
            ctx.fillStyle = emptyBackdropColor();
            for (let i = 0; i < foods.length; i += 2)
                ctx.fillRect(foods[i], foods[i + 1], cs, cs);
            ctx.fillStyle = CellStates.food.color;
            if (cs > 3) {
                const r = (cs / 2) * 0.8;
                ctx.beginPath();
                for (let i = 0; i < foods.length; i += 2) {
                    // moveTo starts a fresh subpath per pellet; without it the
                    // path would fill the region connecting the circles
                    ctx.moveTo(foods[i] + cs / 2 + r, foods[i + 1] + cs / 2);
                    ctx.arc(foods[i] + cs / 2, foods[i + 1] + cs / 2, r, 0, Math.PI * 2);
                }
                ctx.fill();
            } else {
                for (let i = 0; i < foods.length; i += 2)
                    ctx.fillRect(foods[i], foods[i + 1], cs, cs);
            }
        }

        if (patches) {
            const empty_color = emptyBackdropColor();
            ctx.fillStyle = empty_color;
            for (const p of patches)
                ctx.fillRect(p.x, p.y, p.sz, p.sz);
            const by_color = new Map<string, OrgCellPatch[]>();
            for (const p of patches) {
                let arr = by_color.get(p.color);
                if (!arr) by_color.set(p.color, arr = []);
                arr.push(p);
            }
            for (const [color, ps] of by_color) {
                ctx.fillStyle = color;
                for (const p of ps)
                    ctx.fillRect(p.x, p.y, p.sz, p.sz);
            }
            ctx.fillStyle = empty_color;
            for (const p of patches)
                if (p.corners) drawOrgCellCorners(ctx, p);
            ctx.fillStyle = ORG_CELL_DOT_STYLE;
            for (const p of patches)
                if (p.dot) drawOrgCellDot(ctx, p);
        }

        if (slow) {
            for (const idx of slow)
                this.renderCell(idx);
        }
    }

    renderCell(idx: CellIndex): void {
        const map = this.grid_map;
        /* Range-checked because this is where a stale index would become a
           crash: an index outlives the grid it came from across a resize, and
           the cursor overlay in particular carries a frame's worth of them
           over. Reading past a typed array yields undefined, so the state
           lookup below would fail with nothing pointing at the resize. */
        if (!map || idx < 0 || idx >= map.size) return;
        if (isChameleon(map.owners[idx])) {
            this.ctx!.globalAlpha = 0.4;
        }
        CellStates.all[map.state_ids[idx]].render(this.ctx!, this.viewAt(idx), this.cell_size, this.env);
        this.ctx!.globalAlpha = 1;
        // Radiation is not drawn here: the RadiationSmoke overlay renders the
        // zones as animated pixel smoke on its own layer, so the dirty-cell
        // world canvas never has a tint to paint or un-paint.
    }

    renderOrganism(org: RendererOrganismLike): void {
        if (!this.ctx) return;
        for(var org_cell of org.anatomy.cells) {
            var idx = org.getRealCellIndex(org_cell);
            if (idx >= 0)
                this.renderCell(idx);
        }
    }

    addToRender(idx: CellIndex): void {
        if (this.highlighted_cells.has(idx)){
            this.cells_to_highlight.add(idx);
        }
        this.cells_to_render.add(idx);
    }

    renderHighlights(): void {
        if (!this.ctx) return;
        for (var idx of this.cells_to_highlight) {
            this.renderCellHighlight(idx);
            this.highlighted_cells.add(idx);
        }
        this.cells_to_highlight.clear();

    }

    highlightOrganism(org: RendererOrganismLike): void {
        for(var org_cell of org.anatomy.cells) {
            var idx = org.getRealCellIndex(org_cell);
            if (idx >= 0)
                this.cells_to_highlight.add(idx);
        }
    }

    highlightCell(idx: CellIndex): void {
        this.cells_to_highlight.add(idx);
    }

    renderCellHighlight(idx: CellIndex, color="yellow"): void {
        if (!this.grid_map) return;
        this.renderCell(idx);
        this.ctx!.fillStyle = color;
        this.ctx!.globalAlpha = 0.5;
        this.ctx!.fillRect(this.grid_map.xOf(idx), this.grid_map.yOf(idx), this.cell_size, this.cell_size);
        this.ctx!.globalAlpha = 1;
        this.highlighted_cells.add(idx);
    }

    clearAllHighlights(clear_to_highlight=false): void {
        if (this.ctx) {
            for (var idx of this.highlighted_cells) {
                this.renderCell(idx);
            }
        }
        this.highlighted_cells.clear();
        if (clear_to_highlight) {
            this.cells_to_highlight.clear();
        }
    }
}

export default Renderer;
