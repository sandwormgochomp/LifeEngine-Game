import Environment from './Environment';
import Organism from '../Organism/Organism';
import GridMap from '../Grid/GridMap';
import Renderer from '../Rendering/Renderer';
import CellStates from '../Organism/Cell/CellStates';
import EditorController from "../Controllers/EditorController";
import Species from '../Stats/Species';
import RandomOrganismGenerator from '../Organism/RandomOrganismGenerator';
import Directions from '../Organism/Directions';
import Notifier from '../Utils/Notifier';

// Cell sizes the editor canvas can render at; the grid is rebuilt to whatever
// number of cells fits the bound canvas at the current size.
const ZOOM_LEVELS = [8, 11, 14, 18, 24];
const DEFAULT_ZOOM = 2;
const HISTORY_LIMIT = 100;
// Snapshots are JSON strings; giant organisms (Bob is ~10k cells) make each
// one megabytes, so the stack is also bounded by total size, not just count.
const HISTORY_CHAR_LIMIT = 8_000_000;

class OrganismEditor extends Environment{
    constructor() {
        super();
        this.is_active = true;
        this.zoom_index = DEFAULT_ZOOM;
        this.cell_size = ZOOM_LEVELS[this.zoom_index];
        // The editor canvas lives in a React panel that mounts on demand;
        // renderer and controller run canvas-less until bindCanvas is called.
        this.renderer = new Renderer(null, null, this.cell_size);
        this.controller = new EditorController(this);
        this.grid_map = new GridMap(21, 21, this.cell_size);
        // Undo history: strokes push the pre-mutation snapshot (beginStroke on
        // mousedown, committed by the first actual change of the stroke).
        this.history = [];
        this.redo_stack = [];
        this.pending_snapshot = null;
        this.setDefaultOrg();
    }

    bindCanvas(canvas, container) {
        this.renderer.bindCanvas(canvas, container);
        this.controller.setCanvas(canvas);
        this.rebuildGrid();
    }

    releaseCanvas() {
        this.renderer.bindCanvas(null, null);
        this.controller.setCanvas(null);
    }

    // Size the grid to the canvas container (odd dimensions keep the
    // organism's center cell visually centered), then shrink the canvas to
    // exactly the grid so there is no dead margin and CSS can center it.
    rebuildGrid() {
        var container = this.renderer.container;
        var w = (container && container.clientWidth) || this.renderer.width || 310;
        var h = (container && container.clientHeight) || this.renderer.height || 310;
        var cols = Math.max(5, Math.floor(w / this.cell_size));
        var rows = Math.max(5, Math.floor(h / this.cell_size));
        if (cols % 2 === 0) cols--;
        if (rows % 2 === 0) rows--;
        this.grid_map.resize(cols, rows, this.cell_size);
        if (this.renderer.canvas)
            this.renderer.fillShape(rows * this.cell_size, cols * this.cell_size);
        this.grid_map.fillGrid(CellStates.empty);
        var center = this.grid_map.getCenter();
        if (this.organism) {
            this.organism.c = center[0];
            this.organism.r = center[1];
            this.organism.updateGrid();
        }
        this.renderFull();
    }

    setZoom(index) {
        this.zoom_index = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
        this.cell_size = ZOOM_LEVELS[this.zoom_index];
        this.renderer.cell_size = this.cell_size;
        this.rebuildGrid();
    }

    zoomIn() { this.setZoom(this.zoom_index + 1); }
    zoomOut() { this.setZoom(this.zoom_index - 1); }
    canZoomIn() { return this.zoom_index < ZOOM_LEVELS.length - 1; }
    canZoomOut() { return this.zoom_index > 0; }

    // Largest zoom at which the whole organism (plus a small margin) is visible
    zoomToFit() {
        var ext = 1;
        for (var cell of this.organism.anatomy.cells)
            ext = Math.max(ext, Math.abs(cell.loc_col), Math.abs(cell.loc_row));
        var needed = ext * 2 + 5;
        var dim = Math.min(this.renderer.width || 310, this.renderer.height || 310);
        for (var i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
            if (i === 0 || Math.floor(dim / ZOOM_LEVELS[i]) >= needed) {
                this.setZoom(i);
                return;
            }
        }
    }

    update() {
        if (this.is_active){
            if (this.needs_render)
                this.renderFull();
            this.renderer.renderHighlights();
        }
    }

    // Deferred to the next frame: updateGrid() calls this once per organism
    // cell, and rendering inline froze the tab for huge organisms (the ~10k
    // cell Bob preset meant ~10k full-canvas redraws).
    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        this.needs_render = true;
    }

    renderFull() {
        this.needs_render = false;
        if (!this.renderer.ctx) return;
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.renderDecorations();
    }

    // Faint grid lines plus a marker on the (immovable) center cell, so empty
    // space reads as editable cells rather than a void.
    renderDecorations() {
        var ctx = this.renderer.ctx;
        var cs = this.cell_size;
        var w = this.grid_map.cols * cs;
        var h = this.grid_map.rows * cs;
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var c = 0; c <= this.grid_map.cols; c++) {
            ctx.moveTo(c * cs + 0.5, 0);
            ctx.lineTo(c * cs + 0.5, h);
        }
        for (var r = 0; r <= this.grid_map.rows; r++) {
            ctx.moveTo(0, r * cs + 0.5);
            ctx.lineTo(w, r * cs + 0.5);
        }
        ctx.stroke();
        var center = this.grid_map.getCenter();
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.35)';
        ctx.strokeRect(center[0] * cs + 0.5, center[1] * cs + 0.5, cs - 1, cs - 1);
    }

    // ---- Undo history ----

    snapshot() {
        return JSON.stringify(this.organism.serialize());
    }

    beginStroke() {
        this.pending_snapshot = this.snapshot();
    }

    // Called by mutations; the first change of a stroke records it, the rest
    // fold into the same undo entry.
    commitStroke() {
        if (this.pending_snapshot == null) return;
        this.history.push(this.pending_snapshot);
        var total = 0;
        for (var snap of this.history) total += snap.length;
        while (this.history.length > HISTORY_LIMIT ||
               (this.history.length > 1 && total > HISTORY_CHAR_LIMIT)) {
            total -= this.history[0].length;
            this.history.shift();
        }
        this.redo_stack.length = 0;
        this.pending_snapshot = null;
    }

    canUndo() { return this.history.length > 0; }
    canRedo() { return this.redo_stack.length > 0; }

    undo() {
        if (!this.canUndo()) return;
        this.redo_stack.push(this.snapshot());
        this.restoreSnapshot(this.history.pop());
    }

    redo() {
        if (!this.canRedo()) return;
        this.history.push(this.snapshot());
        this.restoreSnapshot(this.redo_stack.pop());
    }

    restoreSnapshot(snap) {
        this.loadRawOrg(JSON.parse(snap), false);
    }

    // ---- Species identity ----

    // Rebuild the species for a changed anatomy but keep the working name, so
    // edits don't shuffle the name out from under the user.
    refreshSpecies() {
        var prev_name = this.organism.species ? this.organism.species.name : null;
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        if (prev_name) this.organism.species.name = prev_name;
    }

    renameSpecies(name) {
        if (this.organism.species && name)
            this.organism.species.name = name;
    }

    // ---- Anatomy mutations ----

    addCellToOrg(c, r, state) {
        var center = this.grid_map.getCenter();
        var loc_c = c - center[0];
        var loc_r = r - center[1];
        var prev_cell = this.organism.anatomy.getLocalCell(loc_c, loc_r);

        if (prev_cell != null) {
            if (prev_cell.state === state) return;
            this.commitStroke();
            var new_cell = this.organism.anatomy.replaceCell(state, prev_cell.loc_col, prev_cell.loc_row, false);
            this.changeCell(c, r, state, new_cell);
        }
        else if (this.organism.anatomy.canAddCellAt(loc_c, loc_r) || this.organism.anatomy.cells.length === 0){
            this.commitStroke();
            var new_cell = this.organism.anatomy.addDefaultCell(state, loc_c, loc_r);
            this.changeCell(c, r, state, new_cell);
        }
        else {
            return;
        }
        this.refreshSpecies();
    }

    paintCell(c, r, color) {
        var center = this.grid_map.getCenter();
        var loc_c = c - center[0];
        var loc_r = r - center[1];
        var cell = this.organism.anatomy.getLocalCell(loc_c, loc_r);
        if (cell != null && cell.custom_color !== color) {
            this.commitStroke();
            cell.custom_color = color;
            this.changeCell(c, r, cell.state, cell);
            this.refreshSpecies();
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
                this.commitStroke();
                this.changeCell(c, r, CellStates.empty, null);
                this.refreshSpecies();
            }
        }
    }

    // ---- Whole-organism operations ----

    // Load a serialized organism into the editor, centered and upright.
    // record=false is used by undo/redo restores.
    loadRawOrg(raw, record = true) {
        if (record) this.beginStroke();
        this.clear();
        this.organism.loadRaw(raw);
        var center = this.grid_map.getCenter();
        this.organism.c = center[0];
        this.organism.r = center[1];
        this.organism.rotation = Directions.up;
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        if (raw.species_name)
            this.organism.species.name = raw.species_name;
        if (record) this.commitStroke();
        this.renderFull();
    }

    transformOrganism(transform_cell) {
        var raw = this.organism.serialize();
        for (var cell of raw.anatomy.cells)
            transform_cell(cell);
        this.loadRawOrg(raw);
    }

    rotateOrganism() {
        this.transformOrganism((cell) => {
            var c = cell.loc_col, r = cell.loc_row;
            cell.loc_col = -r;
            cell.loc_row = c;
            // eyes carry a direction; keep them pointing the same way relative to the body
            if (cell.direction != null)
                cell.direction = Directions.rotateRight(cell.direction);
        });
    }

    flipOrganism() {
        this.transformOrganism((cell) => {
            cell.loc_col = -cell.loc_col;
            if (cell.direction === Directions.left) cell.direction = Directions.right;
            else if (cell.direction === Directions.right) cell.direction = Directions.left;
        });
    }

    clearOrganism() {
        this.beginStroke();
        this.setDefaultOrg();
        this.commitStroke();
    }

    randomOrganism() {
        this.beginStroke();
        this.createRandom();
        this.commitStroke();
    }

    setOrganismToCopyOf(orig_org) {
        if (this.organism) this.beginStroke();
        this.grid_map.fillGrid(CellStates.empty);
        var center = this.grid_map.getCenter();
        this.organism = new Organism(center[0], center[1], this, orig_org);
        this.organism.updateGrid();
        this.commitStroke();
        this.renderFull();
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
        this.renderFull();
    }

    createRandom() {
        this.grid_map.fillGrid(CellStates.empty);

        this.organism = RandomOrganismGenerator.generate(this);
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        this.renderFull();
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
