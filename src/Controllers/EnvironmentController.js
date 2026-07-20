import CanvasController from "./CanvasController";
import Organism from '../Organism/Organism';
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import Neighbors from "../Grid/Neighbors";
import FossilRecord from "../Stats/FossilRecord";
import WorldConfig from "../WorldConfig";
import Hyperparams from "../Hyperparameters";
import Perlin from "../Utils/Perlin";

// Modes where the click affects a brush_size-radius area
const BRUSH_MODES = [Modes.FoodDrop, Modes.WallDrop, Modes.InvincibleWallDrop, Modes.RadiationDrop, Modes.ClickKill];

const MODE_CURSORS = {
    [Modes.Drag]: 'grab',
    [Modes.ClickKill]: 'not-allowed',
    [Modes.Select]: 'pointer',
    [Modes.Clone]: 'copy',
    [Modes.None]: 'default',
};

class EnvironmentController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        this.mode = Modes.FoodDrop;
        this.org_to_clone = null;
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
        this.overlay_cells = new Set();
        this.defineZoomControls();
    }

    setCanvas(canvas) {
        super.setCanvas(canvas);
        this.pointer_inside = false;
        if (canvas) {
            canvas.addEventListener('mouseenter', () => this.pointer_inside = true);
            canvas.addEventListener('mouseleave', () => this.pointer_inside = false);
        }
    }

    // Pan and zoom are kept as numbers and written as a single transform.
    // Reading them back off the element instead would lose sub-pixel precision
    // to parseInt, and animating transform avoids the per-frame relayout that
    // top/left forces.
    applyView() {
        var transform = `translate(${this.pan_x}px, ${this.pan_y}px) scale(${this.scale})`;
        this.canvas.style.transform = transform;
        // the glow overlay canvas mirrors the world's pan/zoom
        if (this.env.glow_canvas)
            this.env.glow_canvas.style.transform = transform;
    }

    defineZoomControls() {
        const zoom_speed = 0.7;
        const MAX = 32;
        const MIN = Math.pow(2, -3);
        this.canvas.onwheel = (event) => {
            event.preventDefault();

            var sign = Math.sign(event.deltaY);
            var new_scale = Math.min(MAX, Math.max(MIN, this.scale * Math.pow(zoom_speed, sign)));

            // Keep the point under the cursor fixed. offsetX/offsetY come off
            // the event rather than this.mouse_x so that consecutive wheel
            // ticks without an intervening mousemove don't zoom toward a stale
            // point (the canvas moves under the cursor on every tick).
            this.pan_x += (this.canvas.width/2  - event.offsetX) * (new_scale - this.scale);
            this.pan_y += (this.canvas.height/2 - event.offsetY) * (new_scale - this.scale);

            this.scale = new_scale;
            this.applyView();
        };
    }

    resetView() {
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
        this.applyView();
    }

    /*
    Iterate over grid from 0,0 to env.num_cols,env.num_rows and create random walls using perlin noise to create a more organic shape.
    */
    randomizeWalls(thickness=1) {
        this.env.clearWalls();
        const noise_threshold = -0.017;
        let avg_noise = 0;
        let resolution = 20;
        Perlin.seed();

        for (let r = 0; r < this.env.num_rows; r++) {
            for (let c = 0; c < this.env.num_cols; c++) {
                let xval = c/this.env.num_cols*(resolution/this.env.renderer.cell_size*(this.env.num_cols/this.env.num_rows));
                let yval = r/this.env.num_rows*(resolution/this.env.renderer.cell_size*(this.env.num_rows/this.env.num_cols));
                let noise = Perlin.get(xval, yval);
                avg_noise += noise/(this.env.num_rows*this.env.num_cols);
                if (noise > noise_threshold && noise < noise_threshold + thickness/resolution) {
                    let cell = this.env.grid_map.cellAt(c, r);
                    if (cell != null) {
                        if(cell.owner != null) cell.owner.die();
                        this.env.changeCell(c, r, CellStates.wall, null);
                    }
                }
            }
        }
    }

    updateMouseLocation(offsetX, offsetY){
        super.updateMouseLocation(offsetX, offsetY);
    }

    mouseMove() {
        this.performModeAction();
    }

    mouseDown() {
        this.drag_anchor_x = this.client_x;
        this.drag_anchor_y = this.client_y;
        this.performModeAction();
    }

    mouseUp() {

    }

    performModeAction() {
        if (WorldConfig.headless && this.mode != Modes.Drag)
            return;
        var mode = this.mode;
        var right_click = this.right_click;
        var left_click = this.left_click;
        if (mode != Modes.None && (right_click || left_click)) {
            var cell = this.cur_cell;
            if (cell == null){
                return;
            }
            switch(mode) {
                case Modes.FoodDrop:
                    if (left_click){
                        this.dropCellType(cell.col, cell.row, CellStates.food, false, CellStates.wall);
                    }
                    else if (right_click){
                        this.dropCellType(cell.col, cell.row, CellStates.empty, false, CellStates.wall);
                    }
                    break;
                case Modes.WallDrop:
                        if (left_click){
                            this.dropCellType(cell.col, cell.row, CellStates.wall, true);
                        }
                        else if (right_click){
                            this.dropCellType(cell.col, cell.row, CellStates.empty, false, CellStates.food);
                        }
                        break;
                case Modes.InvincibleWallDrop:
                        if (left_click){
                            this.dropCellType(cell.col, cell.row, CellStates.invincible_wall, true);
                        }
                        else if (right_click){
                            this.dropCellType(cell.col, cell.row, CellStates.empty, false, CellStates.food);
                        }
                        break;
                case Modes.RadiationDrop:
                        if (left_click) {
                            this.dropRadiation(cell.col, cell.row, true);
                        } else if (right_click) {
                            this.dropRadiation(cell.col, cell.row, false);
                        }
                        break;
                case Modes.ClickKill:
                    if (left_click) {
                        this.killNearOrganisms();
                    }
                    break;

                case Modes.Select:
                    if (right_click) {
                        this.mode = Modes.None;
                        if (this.env && this.env.engine) {
                            this.env.engine.emitChange(true);
                        }
                    } else if (left_click) {
                        if (this.cur_org == null) {
                            this.cur_org = this.findNearOrganism();
                        }
                        if (this.cur_org != null){
                            this.control_panel.setEditorOrganism(this.cur_org);
                        }
                    }
                    break;

                case Modes.Clone:
                    if (right_click) {
                        this.mode = Modes.None;
                        this.org_to_clone = null;
                        if (this.env && this.env.engine) {
                            this.env.engine.emitChange(true);
                        }
                    } else if (left_click) {
                        if (this.org_to_clone != null){
                            this.dropOrganism(this.org_to_clone, this.mouse_c, this.mouse_r);
                        }
                    }
                    break;
                case Modes.Drag:
                    this.dragScreen();
                    break;
            }
        }
        else if (this.middle_click) {
            //drag on middle click
            this.dragScreen();
        }
    }

    dragScreen() {
        // Both the anchor and the current position are screen coords, so the
        // delta is the true mouse movement and the pan tracks it 1:1.
        this.pan_x += this.client_x - this.drag_anchor_x;
        this.pan_y += this.client_y - this.drag_anchor_y;

        this.drag_anchor_x = this.client_x;
        this.drag_anchor_y = this.client_y;

        this.applyView();
    }

    applyCursor() {
        if (!this.canvas) return;
        var cursor = MODE_CURSORS[this.mode] || 'crosshair';
        if (this.canvas.style.cursor !== cursor)
            this.canvas.style.cursor = cursor;
    }

    // Immediate-mode cursor feedback, drawn every frame after the cell pass:
    // brush modes show their exact footprint, clone mode shows a ghost of the
    // organism (red-tinted when the spot is blocked). Cells painted over are
    // re-rendered at the start of the next pass, so nothing smears.
    renderCursorOverlay() {
        var renderer = this.env.renderer;
        if (!renderer.ctx || WorldConfig.headless) return;
        this.applyCursor();
        for (var cell of this.overlay_cells)
            renderer.renderCell(cell);
        this.overlay_cells.clear();
        if (!this.pointer_inside || this.mouse_c == null)
            return;

        var ctx = renderer.ctx;
        var cs = renderer.cell_size;

        if (BRUSH_MODES.includes(this.mode)) {
            var is_kill = this.mode === Modes.ClickKill;
            ctx.fillStyle = is_kill ? 'rgba(255, 60, 60, 0.22)' : 'rgba(0, 255, 65, 0.14)';
            for (var loc of Neighbors.inRange(WorldConfig.brush_size)) {
                var brush_cell = this.env.grid_map.cellAt(this.mouse_c + loc[0], this.mouse_r + loc[1]);
                if (brush_cell == null) continue;
                ctx.fillRect(brush_cell.x, brush_cell.y, cs, cs);
                this.overlay_cells.add(brush_cell);
            }
            var b = WorldConfig.brush_size;
            ctx.strokeStyle = is_kill ? 'rgba(255, 60, 60, 0.7)' : 'rgba(0, 255, 65, 0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect((this.mouse_c - b) * cs + 0.5, (this.mouse_r - b) * cs + 0.5, (b * 2 + 1) * cs - 1, (b * 2 + 1) * cs - 1);
        }
        else if (this.mode === Modes.Clone && this.org_to_clone != null) {
            // Mirrors Organism.isClear for a fresh (rotation: up) copy
            var valid = true;
            for (var body_cell of this.org_to_clone.anatomy.cells) {
                var target = this.env.grid_map.cellAt(this.mouse_c + body_cell.loc_col, this.mouse_r + body_cell.loc_row);
                if (target == null ||
                    !(target.state === CellStates.empty || (!Hyperparams.foodBlocksReproduction && target.state === CellStates.food))) {
                    valid = false;
                    break;
                }
            }
            ctx.globalAlpha = 0.55;
            for (var body_cell of this.org_to_clone.anatomy.cells) {
                var target = this.env.grid_map.cellAt(this.mouse_c + body_cell.loc_col, this.mouse_r + body_cell.loc_row);
                if (target == null) continue;
                ctx.fillStyle = body_cell.custom_color || body_cell.state.color;
                ctx.fillRect(target.x, target.y, cs, cs);
                if (!valid) {
                    ctx.fillStyle = 'rgba(255, 60, 60, 0.6)';
                    ctx.fillRect(target.x, target.y, cs, cs);
                }
                this.overlay_cells.add(target);
            }
            ctx.globalAlpha = 1;
        }
    }

    dropOrganism(organism, col, row) {

        // close the organism and drop it in the world
        var new_org = new Organism(col, row, this.env, organism);

        if (new_org.isClear(col, row)) {
            let new_species = !FossilRecord.speciesIsExtant(new_org.species.name);
            if (new_org.species.extinct) {
                FossilRecord.resurrect(new_org.species);
            }
            else if (new_species) {
                FossilRecord.addSpeciesObj(new_org.species);
                new_org.species.start_tick = this.env.total_ticks;
                new_org.species.population = 0;
            }

            this.env.addOrganism(new_org);
            new_org.species.addPop();
            return true;
        }
        return false;
    }

    dropCellType(col, row, state, killBlocking=false, ignoreState=null) {
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            var c=col + loc[0];
            var r=row + loc[1];
            var cell = this.env.grid_map.cellAt(c, r);
            if (cell == null)
                continue;
            if (killBlocking && cell.owner != null){
                cell.owner.die();
            }
            else if (cell.owner != null) {
                continue;
            }
            if (state !== CellStates.empty) {
                if (ignoreState != null && (cell.state == ignoreState || cell.state == CellStates.invincible_wall || cell.state == CellStates.wall))
                    continue;
            }
            this.env.changeCell(c, r, state, null);
        }
    }

    dropRadiation(col, row, isAdding) {
        if (!this.env.radiation_map) this.env.radiation_map = new Set();
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            var c = col + loc[0];
            var r = row + loc[1];
            if (c >= 0 && c < this.env.num_cols && r >= 0 && r < this.env.num_rows) {
                var key = c + "," + r;
                let changed = false;
                if (isAdding) {
                    if (!this.env.radiation_map.has(key)) {
                        this.env.radiation_map.add(key);
                        changed = true;
                    }
                } else {
                    if (this.env.radiation_map.has(key)) {
                        this.env.radiation_map.delete(key);
                        changed = true;
                    }
                }
                if (changed) {
                    var cell = this.env.grid_map.cellAt(c, r);
                    if (cell) this.env.renderer.addToRender(cell);
                }
            }
        }
    }

    findNearOrganism() {
        let closest = null;
        let closest_dist = 100;
        for (let loc of Neighbors.inRange(WorldConfig.brush_size)){
            let c = this.cur_cell.col + loc[0];
            let r = this.cur_cell.row + loc[1];
            let cell = this.env.grid_map.cellAt(c, r);
            let dist = Math.abs(loc[0]) + Math.abs(loc[1]);
            if (cell != null && cell.owner != null) { 
                if (closest === null || dist < closest_dist) {
                    closest = cell.owner;
                    closest_dist = dist;
                }
            }
        }
        return closest;
    }

    killNearOrganisms() {
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            var c = this.cur_cell.col + loc[0];
            var r = this.cur_cell.row + loc[1];
            var cell = this.env.grid_map.cellAt(c, r);
            if (cell != null && cell.owner != null)
                cell.owner.die();
        }
    }


}

export default EnvironmentController;
