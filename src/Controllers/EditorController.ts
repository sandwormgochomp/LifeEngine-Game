import CanvasController from "./CanvasController";
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import type { CellState, RenderOrganismLike } from "../Organism/Cell/CellStates";
import Directions from "../Organism/Directions";
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
    cells_to_highlight: Set<number>;
    clearAllHighlights(clear_to_highlight?: boolean): void;
    highlightOrganism(org: RenderOrganismLike): void;
    highlightCell(idx: number): void;
}

/* One of the organism's body cells, as handed back by Anatomy.getLocalCell().
   Kept structural rather than using the real BodyCell because `direction` only
   exists on EyeCell -- editOrganism touches it only after checking
   state === CellStates.eye, so declaring it required here encodes that guard.
   The real BodyCell cannot express it without making every cell optional. */
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

/* The slice of OrganismEditor this controller drives. Structural because it
   feeds EditorOrganismLike above, whose body cells are deliberately narrower
   than the real BodyCell. */
interface EditorEnvLike {
    renderer: EditorRendererLike;
    grid_map: GridMap;
    organism: EditorOrganismLike;
    cell_size: number;
    renderFull(): void;
    /* Where the organism's local (0,0) sits on the grid -- the centre plus the
       pan offset. Every grid <-> local conversion goes through it. */
    originOnGrid(): [number, number];
    panBy(dc: number, dr: number): void;
    beginStroke(): void;
    commitStroke(): void;
    addCellToOrg(c: number, r: number, state: CellState): void;
    paintCell(c: number, r: number, color: string): void;
    removeCellFromOrg(c: number, r: number): void;
    loadRawOrg(raw: unknown, record?: boolean): void;
    /* Set by Engine after construction, so absent for the window between
       construction and that assignment -- cancelTool() guards on it. */
    engine?: { emitChange(force?: boolean): void };
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

    /* Puts the active tool away; the dock un-highlights and canvas clicks
       become no-ops until a tool is picked again. edit_cell_type is kept so
       re-clicking a cell button re-arms cleanly. */
    cancelTool(): void {
        this.mode = Modes.None;
        if (this.env.engine) {
            this.env.engine.emitChange(true);
        }
    }

    mouseDown(): void {
        // right-click is the universal cancel, matching the world canvas
        if (this.right_click) {
            this.cancelTool();
            return;
        }
        /* Middle-drag pans, the same gesture and the same button as the world
           canvas -- and it must not open a stroke, or a pan would land in the
           undo history as an edit that changed nothing. */
        if (this.middle_click) {
            this.drag_anchor_x = this.client_x;
            this.drag_anchor_y = this.client_y;
            this.applyCursor();
            return;
        }
        this.env.beginStroke();
        this.editOrganism(true);
    }

    mouseMove(): void {
        if (this.middle_click)
            this.dragPan();
        else if (this.left_click)
            this.editOrganism(false);
        else
            this.renderGhost();
    }

    /* Drag the body under the pointer, a whole cell at a time.

       The remainder is kept rather than the anchor being reset to the current
       position: at 8px cells a slow drag would otherwise never accumulate a
       cell and the view would not move at all. Client coordinates, not
       offsetX/offsetY, because the canvas contents shift underneath the cursor
       -- the base class says as much where it captures them. */
    dragPan(): void {
        var cs = this.env.cell_size;
        if (!cs) return;
        var dc = Math.trunc((this.client_x - this.drag_anchor_x) / cs);
        var dr = Math.trunc((this.client_y - this.drag_anchor_y) / cs);
        if (!dc && !dr) return;
        this.drag_anchor_x += dc * cs;
        this.drag_anchor_y += dr * cs;
        this.env.panBy(dc, dr);
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
        // Grabbing while panning, so the gesture reads as moving the view
        // rather than as a tool that has stopped responding.
        var want = this.middle_click ? 'grabbing' : 'crosshair';
        if (this.canvas.style.cursor !== want)
            this.canvas.style.cursor = want;
    }

    getCurLocalCell(): EditorBodyCellLike | null {
        var center = this.env.originOnGrid();
        return this.env.organism.anatomy.getLocalCell(this.mouse_c - center[0], this.mouse_r - center[1]);
    }

    // is_click distinguishes a fresh mousedown from a drag: rotating an eye in
    // place only happens on a click, otherwise dragging over it would spin it.
    editOrganism(is_click: boolean): void {
        var loc_cell = this.getCurLocalCell();

        if (!this.left_click)
            return;

        switch (this.mode) {
            case Modes.Eraser:
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
        var idx = this.env.grid_map.indexAt(this.mouse_c, this.mouse_r);
        if (idx < 0)
            return;
        var loc_cell = this.getCurLocalCell();
        var ctx = renderer.ctx;
        var color: string | null = null;
        if (this.mode === Modes.Edit && this.edit_cell_type != null)
            color = this.edit_cell_type.color;
        else if (this.mode === Modes.Paint && loc_cell != null)
            color = this.custom_color;
        else if (this.mode === Modes.Eraser && loc_cell != null)
            color = '#ff3c3c';
        if (color == null)
            return;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.fillRect(this.env.grid_map.xOf(idx), this.env.grid_map.yOf(idx), this.env.cell_size, this.env.cell_size);
        ctx.globalAlpha = 1;
    }

    loadOrg(org: unknown): void {
        this.env.loadRawOrg(org);
    }
}

export default EditorController;
