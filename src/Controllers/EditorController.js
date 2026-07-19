import CanvasController from "./CanvasController";
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import Directions from "../Organism/Directions";
import Hyperparams from "../Hyperparameters";
import Species from "../Stats/Species";
import FossilRecord from "../Stats/FossilRecord";

class EditorController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        this.mode = Modes.None;
        this.edit_cell_type = null;
        this.highlight_org = false;
        this.editing_state_index = 0;
        this.use_custom_color = false;
        this.custom_color = "#ff00ff";
    }

    mouseDown(e) {
        this.editOrganism();
    }

    mouseMove() {
        if (this.right_click || this.left_click)
            this.editOrganism();
    }



    mouseUp(){}

    getCurLocalCell(){
        return this.env.organism.anatomy.getLocalCell(this.mouse_c-this.env.organism.c, this.mouse_r-this.env.organism.r);
    }

    editOrganism() {
        if (this.mode != Modes.Edit && this.mode != Modes.Paint)
            return;
            
        var loc_cell = this.getCurLocalCell();
        var applyColor = this.mode === Modes.Paint ? this.use_custom_color : false;

        if (this.left_click){
            if (this.mode === Modes.Paint) {
                if (loc_cell == null) return; // Cannot paint empty space
                
                var color_val = applyColor ? this.custom_color : null;
                this.env.paintCell(this.mouse_c, this.mouse_r, color_val);
                return;
            }

            if (this.edit_cell_type == null) {
                // In Edit mode, if no cell type selected, do nothing
                return;
            }
            
            if(this.edit_cell_type == CellStates.eye && loc_cell != null && loc_cell.state == CellStates.eye) {
                loc_cell.direction = Directions.rotateRight(loc_cell.direction);
                this.env.renderFull();
            }
            else {
                this.env.addCellToOrg(this.mouse_c, this.mouse_r, this.edit_cell_type, applyColor);
            }
        }
        else if (this.right_click)
            this.env.removeCellFromOrg(this.mouse_c, this.mouse_r);
            
        // The React UI component should listen for these changes or poll to update its view.
    }

    loadOrg(org) {
        this.env.clear();
        this.env.organism.loadRaw(org);
        var center = this.env.grid_map.getCenter();
        this.env.organism.c = center[0];
        this.env.organism.r = center[1];
        this.env.organism.updateGrid();
        this.env.renderFull();
        this.env.organism.species = new Species(this.env.organism.anatomy, null, 0);
        if (org.species_name)
            this.env.organism.species.name = org.species_name;
    }
}

export default EditorController;
