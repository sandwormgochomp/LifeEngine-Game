import type Cell from "../Organism/Cell/GridCell";
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
   here -- they are only ever handed straight back to getRealCell() -- so this
   deliberately stays looser than the real Organism/Anatomy. */
interface RendererOrganismLike {
    anatomy: { cells: unknown[] };
    getRealCell(org_cell: unknown): Cell;
}

/* Anatomy's chameleon flag. RenderOrganismLike (shared with CellStates) models
   only what CellState.render needs, so this one extra flag is read through a
   widening cast rather than by broadening the shared shape. */
type AnatomyWithChameleon = { has_chameleon?: boolean };

// The part of the world (in canvas px) actually on screen; see updateView()
interface ViewRect { x0: number; y0: number; x1: number; y1: number; }

/* Full-grid repaints only cull to the view above this many cells. Below it a
   full pass is fast enough (~60ms at 84k cells) that pre-painting the whole
   canvas is the better trade: pan and zoom then never have stale cells to
   reveal. Above it the full pass is a multi-hundred-ms freeze (317ms at
   Epic's 468k, 1.5s at 2.1M), so those worlds paint the view and defer the
   rest to the pan/zoom promotion path. */
const FULL_GRID_CULL_MIN_CELLS = 120_000;

// Renderer controls access to a canvas. There is one renderer for each canvas.
// The canvas may be bound after construction (and unbound) for canvases owned
// by React components that mount and unmount; render calls are no-ops while
// no canvas is bound.
class Renderer {
    cell_size: number;
    cells_to_render: Set<Cell>;
    cells_to_highlight: Set<Cell>;
    highlighted_cells: Set<Cell>;
    height: number;
    width: number;
    /* Assigned by bindCanvas(), which the constructor calls. */
    canvas!: HTMLCanvasElement | null;
    container!: HTMLElement | null;
    ctx!: CanvasRenderingContext2D | null;
    /* Bolted on from outside by WorldEnvironment after construction; the
       editor's renderer never gets one. It stays structural because both
       classes construct a Renderer, so it cannot name either one. */
    env?: RenderEnvLike;
    /* Culling state. `view` is the on-screen part of the canvas in canvas px,
       or null when culling is off (no env to repaint revealed cells from --
       i.e. the editor's renderer -- or no canvas on screen). A dirty cell
       outside the view is skipped and flagged `stale` instead of drawn;
       updateView() repaints stale cells when pan/zoom brings them back. */
    view: ViewRect | null;

    constructor(canvas: HTMLCanvasElement | null, container: HTMLElement | null, cell_size: number) {
        this.cell_size = cell_size;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
        this.height = 0;
        this.width = 0;
        this.view = null;
        this.bindCanvas(canvas, container);
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
        const grid_map = this.env && this.env.grid_map;
        if (!this.canvas || !this.container || !grid_map) {
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
        for (const s of strips) {
            const c0 = Math.max(0, Math.floor(s.x0 / cs));
            const c1 = Math.floor((s.x1 - 0.001) / cs);
            const r0 = Math.max(0, Math.floor(s.y0 / cs));
            const r1 = Math.floor((s.y1 - 0.001) / cs);
            for (let c = c0; c <= c1; c++) {
                for (let r = r0; r <= r1; r++) {
                    const cell = grid_map.cellAt(c, r) as Cell | null;
                    if (cell && cell.stale)
                        this.addToRender(cell);
                }
            }
        }
    }

    renderFullGrid(grid: Cell[][]): void {
        if (!this.ctx) return;
        this.updateView();
        const total = grid.length * (grid[0] ? grid[0].length : 0);
        if (this.view && total > FULL_GRID_CULL_MIN_CELLS) {
            // Big grid: paint the view now, defer the rest to pan/zoom
            // promotion. Culled here rather than through the dirty set so the
            // set never holds millions of off-screen cells.
            const v = this.view;
            const cs = this.cell_size;
            for (var col of grid) {
                for (var cell of col) {
                    if (cell.x + cs <= v.x0 || cell.x >= v.x1 ||
                        cell.y + cs <= v.y0 || cell.y >= v.y1)
                        cell.stale = true;
                    else
                        this.cells_to_render.add(cell);
                }
            }
            this.renderCells();
            return;
        }
        for (var col of grid) {
            for (var cell of col){
                cell.stale = false;
                this.renderCell(cell);
            }
        }
    }

    /* Draws the dirty set in batched passes -- flat rects grouped by color,
       food backdrops+dots together, organism patches phase-by-phase (see
       OrgCellPatch) -- so the canvas sees runs of one fillStyle instead of
       several switches per cell. States with bespoke renderers (Food aside)
       and chameleon-translucent organisms take the one-cell path, which
       paints exactly what it always did. */
    renderCells(): void {
        if (!this.ctx) return;
        this.updateView();
        const ctx = this.ctx;
        const view = this.view;
        const cs = this.cell_size;

        const flat = new Map<string, Cell[]>();
        let foods: Cell[] | null = null;
        let patches: OrgCellPatch[] | null = null;
        let slow: Cell[] | null = null;

        for (const cell of this.cells_to_render) {
            if (view && (cell.x + cs <= view.x0 || cell.x >= view.x1 ||
                         cell.y + cs <= view.y0 || cell.y >= view.y1)) {
                cell.stale = true;
                continue;
            }
            cell.stale = false;
            const state = cell.state;
            const is_org = Boolean(cell.owner || cell.cell_owner);
            if (cell.owner && cell.owner.anatomy && (cell.owner.anatomy as AnatomyWithChameleon).has_chameleon) {
                (slow ??= []).push(cell); // translucent: needs the globalAlpha path
            } else if (state.render !== BASE_CELL_RENDER) {
                if (state === CellStates.food && !is_org)
                    (foods ??= []).push(cell);
                else
                    (slow ??= []).push(cell);
            } else if (cs > 2 && is_org) {
                (patches ??= []).push(computeOrgCellPatch(state, cell, cs, this.env));
            } else {
                // Same resolution as the base render's plain-rect branch
                const color = (cell.cell_owner && cell.cell_owner.custom_color) || state.color;
                let arr = flat.get(color);
                if (!arr) flat.set(color, arr = []);
                arr.push(cell);
            }
        }
        this.cells_to_render.clear();

        for (const [color, cells] of flat) {
            ctx.fillStyle = color;
            for (const cell of cells)
                ctx.fillRect(cell.x, cell.y, cs, cs);
        }

        if (foods) {
            ctx.fillStyle = emptyBackdropColor();
            for (const f of foods)
                ctx.fillRect(f.x, f.y, cs, cs);
            ctx.fillStyle = CellStates.food.color;
            if (cs > 3) {
                const r = (cs / 2) * 0.8;
                ctx.beginPath();
                for (const f of foods) {
                    // moveTo starts a fresh subpath per pellet; without it the
                    // path would fill the region connecting the circles
                    ctx.moveTo(f.x + cs / 2 + r, f.y + cs / 2);
                    ctx.arc(f.x + cs / 2, f.y + cs / 2, r, 0, Math.PI * 2);
                }
                ctx.fill();
            } else {
                for (const f of foods)
                    ctx.fillRect(f.x, f.y, cs, cs);
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
            for (const cell of slow)
                this.renderCell(cell);
        }
    }

    renderCell(cell: Cell): void {
        if (cell.owner && cell.owner.anatomy && (cell.owner.anatomy as AnatomyWithChameleon).has_chameleon) {
            this.ctx!.globalAlpha = 0.4;
        }
        cell.state.render(this.ctx!, cell, this.cell_size, this.env);
        this.ctx!.globalAlpha = 1;
        // Radiation is not drawn here: the RadiationSmoke overlay renders the
        // zones as animated pixel smoke on its own layer, so the dirty-cell
        // world canvas never has a tint to paint or un-paint.
    }

    renderOrganism(org: RendererOrganismLike): void {
        if (!this.ctx) return;
        for(var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.renderCell(cell);
        }
    }

    addToRender(cell: Cell): void {
        if (this.highlighted_cells.has(cell)){
            this.cells_to_highlight.add(cell);
        }
        this.cells_to_render.add(cell);
    }

    renderHighlights(): void {
        if (!this.ctx) return;
        for (var cell of this.cells_to_highlight) {
            this.renderCellHighlight(cell);
            this.highlighted_cells.add(cell);
        }
        this.cells_to_highlight.clear();

    }

    highlightOrganism(org: RendererOrganismLike): void {
        for(var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.cells_to_highlight.add(cell);
        }
    }

    highlightCell(cell: Cell): void {
        this.cells_to_highlight.add(cell);
    }

    renderCellHighlight(cell: Cell, color="yellow"): void {
        this.renderCell(cell);
        this.ctx!.fillStyle = color;
        this.ctx!.globalAlpha = 0.5;
        this.ctx!.fillRect(cell.x, cell.y, this.cell_size, this.cell_size);
        this.ctx!.globalAlpha = 1;
        this.highlighted_cells.add(cell);
    }

    clearAllHighlights(clear_to_highlight=false): void {
        if (this.ctx) {
            for (var cell of this.highlighted_cells) {
                this.renderCell(cell);
            }
        }
        this.highlighted_cells.clear();
        if (clear_to_highlight) {
            this.cells_to_highlight.clear();
        }
    }
}

export default Renderer;
