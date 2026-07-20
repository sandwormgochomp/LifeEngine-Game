import CanvasController from "./CanvasController";
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import Directions from "../Organism/Directions";

class EditorController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        // Draw with a cell selected is the default: a fresh editor never
        // swallows clicks the way the old None mode did.
        this.mode = Modes.Edit;
        this.edit_cell_type = CellStates.common;
        this.highlight_org = false;
        this.custom_color = '#ff00ff';
    }

    setCanvas(canvas) {
        super.setCanvas(canvas);
        if (canvas) {
            // wipe the ghost preview when the pointer leaves the canvas
            canvas.addEventListener('mouseleave', () => this.env.renderFull());
        }
    }

    mouseDown() {
        this.env.beginStroke();
        this.editOrganism(true);
    }

    mouseMove() {
        if (this.left_click || this.right_click)
            this.editOrganism(false);
        else
            this.renderGhost();
    }

    mouseUp(){}

    updateMouseLocation(offsetX, offsetY) {
        super.updateMouseLocation(offsetX, offsetY);
        // the editor draws its own ghost preview instead of the generic
        // yellow cell highlight
        this.env.renderer.cells_to_highlight.clear();
    }

    getCurLocalCell(){
        var center = this.env.grid_map.getCenter();
        return this.env.organism.anatomy.getLocalCell(this.mouse_c - center[0], this.mouse_r - center[1]);
    }

    // is_click distinguishes a fresh mousedown from a drag: rotating an eye in
    // place only happens on a click, otherwise dragging over it would spin it.
    editOrganism(is_click) {
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
    renderGhost() {
        var renderer = this.env.renderer;
        if (!renderer.ctx || this.mouse_c == null)
            return;
        this.env.renderFull();
        var cell = this.env.grid_map.cellAt(this.mouse_c, this.mouse_r);
        if (cell == null)
            return;
        var loc_cell = this.getCurLocalCell();
        var ctx = renderer.ctx;
        var color = null;
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

    loadOrg(org) {
        this.env.loadRawOrg(org);
    }
}

export default EditorController;
