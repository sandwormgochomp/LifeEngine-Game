import CanvasController from "./CanvasController";
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import type { CellState, RenderOrganismLike } from "../Organism/Cell/CellStates";
import Directions from "../Organism/Directions";
import type Cell from "../Organism/Cell/GridCell";
import type GridMap from "../Grid/GridMap";

/* The renderer, as the editor and its base class between them reach through
   it. The last three members mirror CanvasController's own private shape for
   the renderer verbatim -- redeclaring them is what keeps this `env` assignable
   to the base's, since that shape is not exported. The real Renderer is not
   imported here because its highlightOrganism() takes a stricter organism
   shape than the base class declares, so the two structural views of it do not
   unify; both collapse onto the real class when CanvasController stops
   declaring its own. */
interface EditorRendererLike {
    ctx: CanvasRenderingContext2D | null;
    cells_to_highlight: Set<Cell>;
    clearAllHighlights(clear_to_highlight?: boolean): void;
    highlightOrganism(org: RenderOrganismLike): void;
    highlightCell(cell: Cell): void;
}

/* One of the organism's body cells, as handed back by Anatomy.getLocalCell().
   Anatomy and the BodyCell hierarchy are reached through structurally rather
   than imported: Anatomy is still untyped JS, and this collapses to the real
   BodyCell type once it converts. `direction` really only exists on EyeCell,
   but editOrganism only touches it after checking state === CellStates.eye, so
   it is declared required here rather than optional. */
interface EditorBodyCellLike {
    state: CellState;
    direction: number;
}

interface EditorAnatomyLike {
    getLocalCell(c: number, r: number): EditorBodyCellLike | null;
}

interface EditorOrganismLike {
    anatomy: EditorAnatomyLike;
}

/* The slice of OrganismEditor this controller drives. OrganismEditor is still
   untyped JS, so it is declared structurally; collapses to a real import once
   that module converts. */
interface EditorEnvLike {
    renderer: EditorRendererLike;
    grid_map: GridMap;
    organism: EditorOrganismLike;
    cell_size: number;
    renderFull(): void;
    beginStroke(): void;
    commitStroke(): void;
    addCellToOrg(c: number, r: number, state: CellState): void;
    paintCell(c: number, r: number, color: string): void;
    removeCellFromOrg(c: number, r: number): void;
    loadRawOrg(raw: unknown, record?: boolean): void;
}

class EditorController extends CanvasController{
    /* Narrower than the base's env: the editor reaches through to the whole
       OrganismEditor, not just the renderer and grid map. Assigned by the base
       constructor through super(), which the checker cannot see, hence the
       definite assignment assertion. */
    env!: EditorEnvLike;
    /* Not declared by CanvasController -- each subclass owns its own mode set.
       Both are also written from outside by the React editor dock. */
    mode: number;
    edit_cell_type: CellState | null;
    custom_color: string;

    constructor(env: EditorEnvLike, canvas?: HTMLCanvasElement | null) {
        super(env, canvas);
        // Draw with a cell selected is the default: a fresh editor never
        // swallows clicks the way the old None mode did.
        this.mode = Modes.Edit;
        this.edit_cell_type = CellStates.common;
        this.highlight_org = false;
        this.custom_color = '#ff00ff';
    }

    setCanvas(canvas: HTMLCanvasElement | null): void {
        super.setCanvas(canvas);
        if (canvas) {
            // wipe the ghost preview when the pointer leaves the canvas
            canvas.addEventListener('mouseleave', () => this.env.renderFull());
        }
    }

    mouseDown(): void {
        this.env.beginStroke();
        this.editOrganism(true);
    }

    mouseMove(): void {
        if (this.left_click || this.right_click)
            this.editOrganism(false);
        else
            this.renderGhost();
    }

    mouseUp(): void {}

    updateMouseLocation(offsetX: number, offsetY: number): void {
        super.updateMouseLocation(offsetX, offsetY);
        // the editor draws its own ghost preview instead of the generic
        // yellow cell highlight
        this.env.renderer.cells_to_highlight.clear();
        this.applyCursor();
    }

    applyCursor(): void {
        if (!this.canvas) return;
        var cursor = this.mode === Modes.Erase
            // little eraser block so erase mode reads instantly at the cursor
            ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect x='2' y='5' width='12' height='9' fill='%23ff5555' stroke='%23ffffff' stroke-width='1.5'/></svg>") 8 10, not-allowed`
            : 'crosshair';
        if (this.canvas.style.cursor !== cursor)
            this.canvas.style.cursor = cursor;
    }

    getCurLocalCell(): EditorBodyCellLike | null {
        var center = this.env.grid_map.getCenter();
        return this.env.organism.anatomy.getLocalCell(this.mouse_c - center[0], this.mouse_r - center[1]);
    }

    // is_click distinguishes a fresh mousedown from a drag: rotating an eye in
    // place only happens on a click, otherwise dragging over it would spin it.
    editOrganism(is_click: boolean): void {
        var loc_cell = this.getCurLocalCell();

        // right-click always erases, whatever the active tool
        if (this.right_click) {
            this.env.removeCellFromOrg(this.mouse_c, this.mouse_r);
            return;
        }
        if (!this.left_click)
            return;

        switch (this.mode) {
            case Modes.Erase:
                this.env.removeCellFromOrg(this.mouse_c, this.mouse_r);
                break;
            case Modes.Paint:
                if (loc_cell != null)
                    this.env.paintCell(this.mouse_c, this.mouse_r, this.custom_color);
                break;
            case Modes.Edit:
                if (this.edit_cell_type == null)
                    return;
                if (is_click && this.edit_cell_type == CellStates.eye && loc_cell != null && loc_cell.state == CellStates.eye) {
                    loc_cell.direction = Directions.rotateRight(loc_cell.direction);
                    this.env.commitStroke();
                    this.env.renderFull();
                }
                else {
                    this.env.addCellToOrg(this.mouse_c, this.mouse_r, this.edit_cell_type);
                }
                break;
        }
    }

    // Preview of what a click would do at the hovered cell
    renderGhost(): void {
        var renderer = this.env.renderer;
        if (!renderer.ctx || this.mouse_c == null)
            return;
        this.env.renderFull();
        var cell = this.env.grid_map.cellAt(this.mouse_c, this.mouse_r);
        if (cell == null)
            return;
        var loc_cell = this.getCurLocalCell();
        var ctx = renderer.ctx;
        var color: string | null = null;
        if (this.mode === Modes.Edit && this.edit_cell_type != null)
            color = this.edit_cell_type.color;
        else if (this.mode === Modes.Erase && loc_cell != null)
            color = '#ff3333';
        else if (this.mode === Modes.Paint && loc_cell != null)
            color = this.custom_color;
        if (color == null)
            return;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.fillRect(cell.x, cell.y, this.env.cell_size, this.env.cell_size);
        ctx.globalAlpha = 1;
    }

    loadOrg(org: unknown): void {
        this.env.loadRawOrg(org);
    }
}

export default EditorController;
