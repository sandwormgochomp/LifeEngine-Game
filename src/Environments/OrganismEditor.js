import Environment from './Environment';
import Organism from '../Organism/Organism';
import GridMap from '../Grid/GridMap';
import Renderer from '../Rendering/Renderer';
import CellStates from '../Organism/Cell/CellStates';
import EditorController from "../Controllers/EditorController";
import Species from '../Stats/Species';
import RandomOrganismGenerator from '../Organism/RandomOrganismGenerator';
import Notifier from '../Utils/Notifier';

class OrganismEditor extends Environment{
    constructor() {
        super();
        this.is_active = true;
        this.cell_size = 10;
        // The editor canvas lives in a React panel that mounts on demand;
        // renderer and controller run canvas-less until bindCanvas is called.
        this.renderer = new Renderer(null, null, this.cell_size);
        this.controller = new EditorController(this);
        this.grid_map = new GridMap(31, 31, this.cell_size);
        this.setDefaultOrg();
    }

    bindCanvas(canvas, container) {
        this.renderer.bindCanvas(canvas, container);
        this.controller.setCanvas(canvas);
        this.renderFull();
    }

    releaseCanvas() {
        this.renderer.bindCanvas(null, null);
        this.controller.setCanvas(null);
    }

    update() {
        if (this.is_active){
            this.renderer.renderHighlights();
        }
    }

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        this.renderFull();
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    addCellToOrg(c, r, state, applyColor = false) {
        var center = this.grid_map.getCenter();
        var loc_c = c - center[0];
        var loc_r = r - center[1];
        var prev_cell = this.organism.anatomy.getLocalCell(loc_c, loc_r)
        
        var color_val = applyColor ? this.controller.custom_color : null;

        if (prev_cell != null) {
            var new_cell = this.organism.anatomy.replaceCell(state, prev_cell.loc_col, prev_cell.loc_row, false);
            if (applyColor) new_cell.custom_color = color_val;
            this.changeCell(c, r, state, new_cell);
        }
        else if (this.organism.anatomy.canAddCellAt(loc_c, loc_r) || this.organism.anatomy.cells.length === 0){
            var new_cell = this.organism.anatomy.addDefaultCell(state, loc_c, loc_r);
            if (applyColor) new_cell.custom_color = color_val;
            this.changeCell(c, r, state, new_cell);
        }
        this.organism.species = new Species(this.organism.anatomy, null, 0);
    }

    paintCell(c, r, color) {
        var center = this.grid_map.getCenter();
        var loc_c = c - center[0];
        var loc_r = r - center[1];
        var cell = this.organism.anatomy.getLocalCell(loc_c, loc_r);
        if (cell != null) {
            cell.custom_color = color;
            this.changeCell(c, r, cell.state, cell);
            this.organism.species = new Species(this.organism.anatomy, null, 0);
        }
    }

    removeCellFromOrg(c, r) {
        var center = this.grid_map.getCenter();
        var loc_c = c - center[0];
        var loc_r = r - center[1];
        if (loc_c == 0 && loc_r == 0){
            Notifier.notify("Cannot remove center cell");
            return;
        }
        var prev_cell = this.organism.anatomy.getLocalCell(loc_c, loc_r)
        if (prev_cell != null) {
            if (this.organism.anatomy.removeCell(loc_c, loc_r)) {
                this.changeCell(c, r, CellStates.empty, null);
                this.organism.species = new Species(this.organism.anatomy, null, 0);
            }
        }
    }

    setOrganismToCopyOf(orig_org) {
        this.grid_map.fillGrid(CellStates.empty);
        var center = this.grid_map.getCenter();
        this.organism = new Organism(center[0], center[1], this, orig_org);
        this.organism.updateGrid();
    }
    
    getCopyOfOrg() {
        var new_org = new Organism(0, 0, null, this.organism);
        return new_org;
    }

    clear() {
        this.grid_map.fillGrid(CellStates.empty);
    }

    setDefaultOrg() {
        this.clear();
        var center = this.grid_map.getCenter();
        this.organism = new Organism(center[0], center[1], this, null);
        this.organism.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
    }

    createRandom() {
        this.grid_map.fillGrid(CellStates.empty);

        this.organism = RandomOrganismGenerator.generate(this);
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
    }

    resetWithRandomOrgs(env, numOrganisms=50) {
        env.reset(false);

        let size = Math.ceil(8);

        for (let i=0; i<numOrganisms; i++) {
            let newOrganism = RandomOrganismGenerator.generate(this);
            newOrganism.species = new Species(newOrganism.anatomy, null, 0);
            var col = Math.floor(size + (Math.random() * (env.grid_map.cols-(size*2)) ) );
            var row = Math.floor(size + (Math.random() * (env.grid_map.rows-(size*2)) ) );
            env.controller.dropOrganism(newOrganism, col, row);
        }
    }
}

export default OrganismEditor;