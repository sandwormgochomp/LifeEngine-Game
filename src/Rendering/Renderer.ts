import type Cell from "../Organism/Cell/GridCell";
import type { RenderEnvLike } from "../Organism/Cell/CellStates";

/* The environment that owns this renderer. WorldEnvironment assigns it after
   construction (`this.renderer.env = this`) and OrganismEditor never does, so
   it stays optional -- and stays structural for the same reason: both classes
   construct a Renderer, so it cannot name either one. */
interface RendererEnvLike extends RenderEnvLike {
    radiation_map?: Set<string>;
}

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
       editor's renderer never gets one. */
    env?: RendererEnvLike;

    constructor(canvas: HTMLCanvasElement | null, container: HTMLElement | null, cell_size: number) {
        this.cell_size = cell_size;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
        this.height = 0;
        this.width = 0;
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

    renderFullGrid(grid: Cell[][]): void {
        if (!this.ctx) return;
        for (var col of grid) {
            for (var cell of col){
                this.renderCell(cell);
            }
        }
    }

    renderCells(): void {
        if (!this.ctx) return;
        for (var cell of this.cells_to_render) {
            this.renderCell(cell);
        }
        this.cells_to_render.clear();
    }

    renderCell(cell: Cell): void {
        if (cell.owner && cell.owner.anatomy && (cell.owner.anatomy as AnatomyWithChameleon).has_chameleon) {
            this.ctx!.globalAlpha = 0.4;
        }
        cell.state.render(this.ctx!, cell, this.cell_size, this.env);
        this.ctx!.globalAlpha = 1;

        if (this.env && this.env.radiation_map && this.env.radiation_map.has(cell.col + "," + cell.row)) {
            this.ctx!.fillStyle = 'rgba(0, 255, 0, 0.2)';
            this.ctx!.fillRect(cell.x, cell.y, this.cell_size, this.cell_size);
        }
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
