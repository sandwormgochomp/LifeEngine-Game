import Environment from './Environment';
import Organism from '../Organism/Organism';
import type { OrganismEnv, SerializedOrganism } from '../Organism/Organism';
import GridMap from '../Grid/GridMap';
import Renderer from '../Rendering/Renderer';
import CellStates from '../Organism/Cell/CellStates';
import type { CellState, LivingCellName, RenderCellOwnerLike } from '../Organism/Cell/CellStates';
import EditorController from "../Controllers/EditorController";
import Species from '../Stats/Species';
import RandomOrganismGenerator from '../Organism/RandomOrganismGenerator';
import type { GeneratorEnv } from '../Organism/RandomOrganismGenerator';
import Directions from '../Organism/Directions';
import Notifier from '../Utils/Notifier';
import drawOrganismDecorations from '../Rendering/DecorationRenderer';
import type BodyCell from '../Organism/Cell/BodyCells/BodyCell';
import type { SerializedBodyCell } from '../Organism/Anatomy';
/* Type-only, so it adds no runtime edge between the two environments. */
import type WorldEnvironment from "./WorldEnvironment";

/* One serialized body cell as the transform callbacks below mutate it. Exactly
   SerializedAnatomy's cell shape, except that `direction` -- which that shape's
   index signature would otherwise type `unknown` -- is spelled out as the
   optional number only EyeCell carries.

   Deliberately NOT narrowed with `instanceof EyeCell`: transformOrganism walks
   the output of Organism.serialize(), so these are plain save-format objects,
   not BodyCell instances. An instanceof check would be false for every cell and
   would silently stop rotating eyes -- a behavior change, not an annotation. */
interface TransformableCell extends SerializedBodyCell {
    direction?: number;
}


// Cell sizes the editor canvas can render at; the grid is rebuilt to whatever
// number of cells fits the bound canvas at the current size.
const ZOOM_LEVELS = [8, 11, 14, 18, 24];
const DEFAULT_ZOOM = 2;
const HISTORY_LIMIT = 100;
// Snapshots are JSON strings; giant organisms (~10k cells) make each one
// megabytes, so the stack is also bounded by total size, not just count.
const HISTORY_CHAR_LIMIT = 8_000_000;

class OrganismEditor extends Environment{
    /* No initializers on any declaration below: useDefineForClassFields is
       false and these must stay bare declarations so that the constructor
       assignments remain the only writes. */
    is_active: boolean;
    zoom_index: number;
    cell_size: number;
    renderer: Renderer;
    controller: EditorController;
    grid_map: GridMap;
    history: string[];
    redo_stack: string[];
    pending_snapshot: string | null;
    /* Assigned by setDefaultOrg(), the last statement of the constructor, and
       reassigned by setOrganismToCopyOf()/createRandom(). The definite
       assignment assertion is what rebuildGrid()'s `if (this.organism)` guard
       is defensive about: rebuildGrid is only reachable from bindCanvas() and
       setZoom(), both of which run after construction. */
    organism!: Organism;
    /* Written by renderFull() before its early return, so the constructor does
       set it. */
    needs_render!: boolean;
    /* Genuinely absent for a real window: renderFull() assigns it only *after*
       the `if (!this.renderer.ctx) return;` guard, and during construction the
       editor has no canvas bound -- so it stays undefined until the first
       renderFull() that runs with a bound context. Hence `| undefined` rather
       than a definite-assignment `!`. */
    organisms: Organism[] | undefined;
    /* Watches the canvas container so the grid follows layout changes; null
       whenever no canvas is bound, and on platforms without ResizeObserver. */
    resize_observer: ResizeObserver | null;

    constructor() {
        super();
        this.is_active = true;
        this.zoom_index = DEFAULT_ZOOM;
        this.cell_size = ZOOM_LEVELS[this.zoom_index];
        // The editor canvas lives in a React panel that mounts on demand;
        // renderer and controller run canvas-less until bindCanvas is called.
        this.renderer = new Renderer(null, null, this.cell_size);
        /* EditorController describes its env's renderer structurally, and that
           stand-in and the real Renderer do not unify in either direction --
           EditorController.ts says as much where it declares them: its shape
           wants highlightOrganism(RenderOrganismLike) while Renderer's takes a
           shape with getRealCell(). Both views are of this same object, so the
           cast is a restatement, not a widening; it goes away when that
           stand-in collapses onto the real Renderer. */
        this.controller = new EditorController(this as unknown as EditorController['env']);
        this.grid_map = new GridMap(21, 21, this.cell_size);
        // Undo history: strokes push the pre-mutation snapshot (beginStroke on
        // mousedown, committed by the first actual change of the stroke).
        this.history = [];
        this.redo_stack = [];
        this.pending_snapshot = null;
        this.resize_observer = null;
        this.setDefaultOrg();
    }

    bindCanvas(canvas: HTMLCanvasElement, container: HTMLElement): void {
        this.renderer.bindCanvas(canvas, container);
        this.controller.setCanvas(canvas);
        this.observeResize(container);
        this.rebuildGrid();
    }

    releaseCanvas(): void {
        this.observeResize(null);
        this.renderer.bindCanvas(null, null);
        this.controller.setCanvas(null);
    }

    /* Rebuilding the grid was previously reachable only from bindCanvas() and
       setZoom(), so any layout change that resized the dock -- a window resize,
       a sibling panel opening -- left a grid sized for the old box until the
       user happened to zoom. Passing null detaches, which releaseCanvas() must
       do: the observer holds the container, and the React panel that owns it
       mounts and unmounts. */
    observeResize(container: HTMLElement | null): void {
        if (this.resize_observer) {
            this.resize_observer.disconnect();
            this.resize_observer = null;
        }
        if (!container || typeof ResizeObserver === 'undefined') return;
        this.resize_observer = new ResizeObserver(() => {
            /* ResizeObserver also fires once on observe(), and most resizes are
               smaller than a cell, so compare the grid the container would
               produce against the one already built and rebuild only on a real
               change -- rebuildGrid() repaints every cell.

               This cannot recurse: rebuildGrid() resizes the canvas, and the
               canvas is absolutely positioned inside the observed box, so it
               never feeds back into the container's own size. */
            var dims = this.gridDims();
            if (dims[0] === this.grid_map.cols && dims[1] === this.grid_map.rows) return;
            this.rebuildGrid();
        });
        this.resize_observer.observe(container);
    }

    // The cell counts that fill the canvas container, odd on both axes so the
    // organism's center cell stays visually centered. Split out from
    // rebuildGrid() so the resize observer can ask what the grid *would* be
    // without building it.
    //
    // The count rounds *up*: flooring left the canvas up to a cell short of the
    // container on each axis, and forcing the count odd took off another whole
    // cell, so the grid stopped short of the box edges and let the box's own
    // background show through as letterboxing. Rounding up instead means the
    // canvas is at worst one cell larger than the box, and .dockCanvasBox is
    // `overflow: hidden` around a centered canvas, so the overhang is clipped
    // symmetrically and the grid reaches all four edges.
    gridDims(): [number, number] {
        var container = this.renderer.container;
        var w = (container && container.clientWidth) || this.renderer.width || 310;
        var h = (container && container.clientHeight) || this.renderer.height || 310;
        var cols = Math.max(5, Math.ceil(w / this.cell_size));
        var rows = Math.max(5, Math.ceil(h / this.cell_size));
        if (cols % 2 === 0) cols++;
        if (rows % 2 === 0) rows++;
        return [cols, rows];
    }

    // Resize the grid to fit the container, then size the canvas to exactly the
    // grid so CSS can center it.
    rebuildGrid(): void {
        var dims = this.gridDims();
        var cols = dims[0];
        var rows = dims[1];
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

    setZoom(index: number): void {
        this.zoom_index = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
        this.cell_size = ZOOM_LEVELS[this.zoom_index];
        this.renderer.cell_size = this.cell_size;
        this.rebuildGrid();
    }

    zoomIn(): void { this.setZoom(this.zoom_index + 1); }
    zoomOut(): void { this.setZoom(this.zoom_index - 1); }
    canZoomIn(): boolean { return this.zoom_index < ZOOM_LEVELS.length - 1; }
    canZoomOut(): boolean { return this.zoom_index > 0; }

    // Largest zoom at which the whole organism (plus a small margin) is visible
    zoomToFit(): void {
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

    update(): void {
        if (this.is_active){
            if (this.needs_render)
                this.renderFull();
            this.renderer.renderHighlights();
        }
    }

    // Deferred to the next frame: updateGrid() calls this once per organism
    // cell, and rendering inline froze the tab for huge organisms (a ~10k
    // cell organism meant ~10k full-canvas redraws).
    /* The owner parameter is widened past the base class's, which declares only
       `RenderCellOwnerLike | null`: the editor really does hand body cells
       through here. Widening a parameter in an override is sound, so no
       assertion is needed on the declaration -- only on the forward below,
       because RenderCellOwnerLike demands getAbsoluteDirection(), which of the
       body cells only EyeCell implements. Nothing downstream calls it for a
       non-eye cell: GridMap.setCellOwner only stores the value and reads .org,
       and CellState.render only reaches for it from EyeCell's own renderer. */
    changeCell(c: number, r: number, state: CellState, owner: RenderCellOwnerLike | BodyCell | null): void {
        super.changeCell(c, r, state, owner as RenderCellOwnerLike | null);
        this.needs_render = true;
    }

    /* Order matters, and differs from the world's. The world gives decorations
       their own overlay canvas stacked above the cells; the editor has a single
       canvas, so the three passes are layered by sequence instead: flat cells,
       then the grid over the flat empty-cell fill, then the organism sprite
       last so the artwork sits on top of the grid rather than under it.
       drawOrganismDecorations is told not to clear for the same reason -- on
       its own overlay the clear is what erases the previous frame, but here it
       would wipe the two passes below it (which is exactly what used to leave
       only sprite + grid on screen, with the grid drawn over everything). The
       full-grid pass repaints every cell opaquely, so it is the frame's clear. */
    renderFull(): void {
        this.needs_render = false;
        if (!this.renderer.ctx) return;
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.renderDecorations();
        this.organisms = [this.organism];
        /* Assigned on the line directly above, but the whole editor is what
           crosses the seam, so the checker cannot carry that narrowing into the
           argument. The cast also absorbs a second mismatch that predates this
           file: DecorationRenderer's cell shape declares rotatedCol/rotatedRow
           as returning `number`, while BodyCell's switches have no default arm
           and so return `number | undefined`. Spelled as the parameter type of
           the function itself rather than re-declaring its private interface. */
        /* verify_anatomy: the editor organism is the one whose cells change in
           place, so its sprite cache must be re-checked against the anatomy. */
        drawOrganismDecorations(this.renderer.ctx, this as unknown as Parameters<typeof drawOrganismDecorations>[1], false, true);
    }

    // Faint grid lines plus a marker on the (immovable) center cell, so empty
    // space reads as editable cells rather than a void.
    renderDecorations(): void {
        /* Only ever called from renderFull(), past its `if (!this.renderer.ctx)
           return;` guard. */
        var ctx = this.renderer.ctx!;
        var cs = this.cell_size;
        var w = this.grid_map.cols * cs;
        var h = this.grid_map.rows * cs;
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        /* The closing line of each axis sits at exactly the canvas dimension,
           so the usual +0.5 pixel-centering offset pushes it one half-pixel
           past the last row of pixels and it never rasterizes -- the grid drew
           a left and top border but no right or bottom one. Pull those two
           back inside the bitmap instead. */
        for (var c = 0; c <= this.grid_map.cols; c++) {
            var x = Math.min(c * cs + 0.5, w - 0.5);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (var r = 0; r <= this.grid_map.rows; r++) {
            var y = Math.min(r * cs + 0.5, h - 0.5);
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
        var center = this.grid_map.getCenter();
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.35)';
        ctx.strokeRect(center[0] * cs + 0.5, center[1] * cs + 0.5, cs - 1, cs - 1);
    }

    // ---- Undo history ----

    snapshot(): string {
        return JSON.stringify(this.organism.serialize());
    }

    // Idempotent within a stroke: the first call records the pre-mutation
    // snapshot, later calls fold into it (a whole slider drag is one entry)
    beginStroke(): void {
        if (this.pending_snapshot == null) this.pending_snapshot = this.snapshot();
    }

    // Called by mutations; the first change of a stroke records it, the rest
    // fold into the same undo entry.
    commitStroke(): void {
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

    canUndo(): boolean { return this.history.length > 0; }
    canRedo(): boolean { return this.redo_stack.length > 0; }

    undo(): void {
        // A stroke still in flight (e.g. a slider mid-drag) undoes as one entry
        this.commitStroke();
        if (!this.canUndo()) return;
        this.redo_stack.push(this.snapshot());
        /* pop() is `string | undefined`; the canUndo() guard above already
           proved the stack is non-empty, which the checker cannot follow. */
        this.restoreSnapshot(this.history.pop()!);
    }

    redo(): void {
        // An uncommitted stroke is a new edit; committing it voids the redo branch
        this.commitStroke();
        if (!this.canRedo()) return;
        this.history.push(this.snapshot());
        this.restoreSnapshot(this.redo_stack.pop()!);
    }

    restoreSnapshot(snap: string): void {
        this.loadRawOrg(JSON.parse(snap), false);
    }

    // ---- Species identity ----

    // Rebuild the species for a changed anatomy but keep the working name, so
    // edits don't shuffle the name out from under the user.
    refreshSpecies(): void {
        var prev_name = this.organism.species ? this.organism.species.name : null;
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        if (prev_name) this.organism.species.name = prev_name;
    }

    renameSpecies(name: string): void {
        // Accepts '' so the field can be cleared while typing a new name
        if (this.organism.species && name != null)
            this.organism.species.name = name;
    }

    // ---- Anatomy mutations ----

    /* `state` is narrowed to the living cell states: every path here feeds it
       to Anatomy, whose addDefaultCell/replaceCell require a CellState that
       proves it has a BodyCell class behind it. The editor palette only ever
       offers living states, and the parameter stays assignable to the wider
       CellState the controller declares because method parameters are
       bivariant. */
    addCellToOrg(c: number, r: number, state: CellState<LivingCellName>): void {
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

    paintCell(c: number, r: number, color: string): void {
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

    removeCellFromOrg(c: number, r: number): void {
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
    /* `raw` stays `unknown` and is asserted, not runtime-checked, at the two
       places it is read: the JS did no validation either, and adding a guard
       would change behavior on malformed saves. Same seam, and same treatment,
       as Organism.loadRaw(). */
    loadRawOrg(raw: unknown, record = true): void {
        if (record) this.beginStroke();
        this.clear();
        this.organism.loadRaw(raw);
        var center = this.grid_map.getCenter();
        this.organism.c = center[0];
        this.organism.r = center[1];
        this.organism.rotation = Directions.up;
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        if ((raw as SerializedOrganism).species_name)
            this.organism.species.name = (raw as SerializedOrganism).species_name;
        if (record) this.commitStroke();
        this.renderFull();
    }

    transformOrganism(transform_cell: (cell: TransformableCell) => void): void {
        var raw = this.organism.serialize();
        for (var cell of raw.anatomy.cells as TransformableCell[])
            transform_cell(cell);
        this.loadRawOrg(raw);
    }

    rotateOrganism(): void {
        this.transformOrganism((cell) => {
            var c = cell.loc_col, r = cell.loc_row;
            cell.loc_col = -r;
            cell.loc_row = c;
            // eyes carry a direction; keep them pointing the same way relative to the body
            if (cell.direction != null)
                cell.direction = Directions.rotateRight(cell.direction);
        });
    }

    flipOrganism(): void {
        this.transformOrganism((cell) => {
            cell.loc_col = -cell.loc_col;
            if (cell.direction === Directions.left) cell.direction = Directions.right;
            else if (cell.direction === Directions.right) cell.direction = Directions.left;
        });
    }

    clearOrganism(): void {
        this.beginStroke();
        this.setDefaultOrg();
        this.commitStroke();
    }

    randomOrganism(): void {
        this.beginStroke();
        this.createRandom();
        this.commitStroke();
    }

    setOrganismToCopyOf(orig_org: Organism): void {
        if (this.organism) this.beginStroke();
        this.grid_map.fillGrid(CellStates.empty);
        var center = this.grid_map.getCenter();
        /* The editor is a *partial* environment: of everything Organism reaches
           through it implements only grid_map and changeCell, because the
           organism it holds is never ticked -- nothing here calls update(),
           reproduce() or the cell functions, which are what would touch
           canAddOrganism/addOrganism/active_explosions/is_night. The cast
           states that gap rather than hiding it by making those members
           optional on OrganismEnv, where WorldEnvironment really does always
           supply them. Same at setDefaultOrg() below. */
        this.organism = new Organism(center[0], center[1], this as unknown as OrganismEnv, orig_org);
        this.organism.updateGrid();
        this.commitStroke();
        this.renderFull();
    }

    /* Dead code: nothing in src/ or tests/ calls this. Preserved rather than
       deleted, and it is the only place in the codebase that builds an Organism
       with a null environment -- which is why Organism.env is typed non-null and
       why the null needs asserting here. Any caller revived for this would hit
       an immediate null dereference through Organism.inherit -> Anatomy. */
    getCopyOfOrg(): Organism {
        var new_org = new Organism(0, 0, null as unknown as OrganismEnv, this.organism);
        return new_org;
    }

    clear(): void {
        this.grid_map.fillGrid(CellStates.empty);
    }

    setDefaultOrg(): void {
        this.clear();
        var center = this.grid_map.getCenter();
        // partial-environment cast: see setOrganismToCopyOf()
        this.organism = new Organism(center[0], center[1], this as unknown as OrganismEnv, null);
        this.organism.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        this.renderFull();
    }

    createRandom(): void {
        this.grid_map.fillGrid(CellStates.empty);

        // partial-environment cast: see setOrganismToCopyOf()
        this.organism = RandomOrganismGenerator.generate(this as unknown as GeneratorEnv);
        this.organism.updateGrid();
        this.organism.species = new Species(this.organism.anatomy, null, 0);
        this.renderFull();
    }

    resetWithRandomOrgs(env: WorldEnvironment, numOrganisms=50): void {
        env.reset(false);

        let size = Math.ceil(8);

        for (let i=0; i<numOrganisms; i++) {
            // partial-environment cast: see setOrganismToCopyOf()
            let newOrganism = RandomOrganismGenerator.generate(this as unknown as GeneratorEnv);
            newOrganism.species = new Species(newOrganism.anatomy, null, 0);
            var col = Math.floor(size + (Math.random() * (env.grid_map.cols-(size*2)) ) );
            var row = Math.floor(size + (Math.random() * (env.grid_map.rows-(size*2)) ) );
            env.controller.dropOrganism(newOrganism, col, row);
        }
    }
}

export default OrganismEditor;
