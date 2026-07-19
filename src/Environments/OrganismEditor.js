const Environment = require('./Environment');
const Organism = require('../Organism/Organism');
const GridMap = require('../Grid/GridMap');
const Renderer = require('../Rendering/Renderer');
const CellStates = require('../Organism/Cell/CellStates');
const EditorController = require("../Controllers/EditorController");
const Species = require('../Stats/Species');
const RandomOrganismGenerator = require('../Organism/RandomOrganismGenerator')

class OrganismEditor extends Environment{
    constructor() {
        super();
        this.is_active = true;
        this.cell_size = 10;
        this.renderer = new Renderer('editor-canvas', 'editor-env', this.cell_size);
        this.controller = new EditorController(this, this.renderer.canvas);
        this.grid_map = new GridMap(31, 31, this.cell_size);
        this.is_fullscreen = false;
        this.setDefaultOrg();
    }

    toggleFullscreen() {
        this.is_fullscreen = !this.is_fullscreen;
        let editor_tab = $('div.tab#editor');
        
        var org_data = this.organism.serialize();
        
        if (this.is_fullscreen) {
            editor_tab.addClass('fullscreen-editor-mode');
            let w = window.innerWidth - 350; 
            let h = window.innerHeight - 150;
            let cols = Math.max(5, Math.floor(w / this.cell_size));
            let rows = Math.max(5, Math.floor(h / this.cell_size));
            if (cols % 2 === 0) cols--;
            if (rows % 2 === 0) rows--;
            
            this.grid_map = new GridMap(cols, rows, this.cell_size);
            $('#editor-env').css({
                width: (cols * this.cell_size) + 'px', 
                height: (rows * this.cell_size) + 'px',
                'flex-shrink': '0',
                'flex-grow': '0',
                'margin': '10px'
            });
            this.renderer.canvas.width = cols * this.cell_size;
            this.renderer.canvas.height = rows * this.cell_size;
        } else {
            editor_tab.removeClass('fullscreen-editor-mode');
            this.grid_map = new GridMap(31, 31, this.cell_size);
            $('#editor-env').css({width: '310px', height: '310px'});
            this.renderer.canvas.width = 310;
            this.renderer.canvas.height = 310;
        }
        
        this.clear();
        var center = this.grid_map.getCenter();
        this.organism = new Organism(center[0], center[1], this);
        this.organism.loadRaw(org_data);
        this.organism.c = center[0];
        this.organism.r = center[1];
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        if (org_data.species_name) {
            this.organism.species.name = org_data.species_name;
        }
        this.organism.updateGrid();
        this.renderFull();
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
        
        var color_val = applyColor ? $('#cell-color-picker').val() : null;

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
            alert("Cannot remove center cell");
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
        this.controller.updateDetails();
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

    resetWithRandomOrgs(env) {
        let reset_confirmed = env.reset(true, false);
        if (!reset_confirmed) return;
        let numOrganisms = parseInt($('#num-random-orgs').val());

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

module.exports = OrganismEditor;