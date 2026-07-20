import CanvasController from "./CanvasController";
import Organism from '../Organism/Organism';
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import Neighbors from "../Grid/Neighbors";
import FossilRecord from "../Stats/FossilRecord";
import WorldConfig from "../WorldConfig";
import Perlin from "../Utils/Perlin";

class EnvironmentController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        this.mode = Modes.FoodDrop;
        this.org_to_clone = null;
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
        this.defineZoomControls();
    }

    // Pan and zoom are kept as numbers and written as a single transform.
    // Reading them back off the element instead would lose sub-pixel precision
    // to parseInt, and animating transform avoids the per-frame relayout that
    // top/left forces.
    applyView() {
        this.canvas.style.transform = `translate(${this.pan_x}px, ${this.pan_y}px) scale(${this.scale})`;
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
