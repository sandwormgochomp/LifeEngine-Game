import CanvasController from "./CanvasController";
import Organism from '../Organism/Organism';
import type { OrganismEnv } from '../Organism/Organism';
import Modes from "./ControlModes";
import CellStates from "../Organism/Cell/CellStates";
import type { CellState, RenderOrganismLike } from "../Organism/Cell/CellStates";
import Neighbors from "../Grid/Neighbors";
import FossilRecord from "../Stats/FossilRecord";
import WorldConfig from "../WorldConfig";
import Hyperparams from "../Hyperparameters";
import Perlin from "../Utils/Perlin";
import RandomOrganismGenerator from "../Organism/RandomOrganismGenerator";
import type { GeneratorEnv } from "../Organism/RandomOrganismGenerator";
import Species from "../Stats/Species";
import type Cell from "../Organism/Cell/GridCell";
import type BodyCell from "../Organism/Cell/BodyCells/BodyCell";

/* A grid cell as this controller reaches through it. GridCell declares its
   `owner` as RenderOrganismLike, which models only what the renderer needs;
   this file calls die() on it and hands it out as the current selection, so the
   owner is renarrowed to the real Organism here. Narrowing a member of a class
   type is legal because Organism satisfies RenderOrganismLike, and it keeps
   this shape assignable to the base controller's own view of a cell. Collapses
   when GridCell itself can name Organism without closing an import cycle. */
interface ControllerCell extends Cell {
    owner: Organism | null;
}

/* The renderer, as this controller and its base class between them reach
   through it. The last three members mirror CanvasController's own (unexported)
   renderer shape verbatim, which is what keeps this `env` assignable to the
   base's. The real Renderer is not imported for the same reason EditorController
   does not import it: its highlightOrganism() takes a stricter organism shape
   than the base class declares, so the two structural views do not unify. */
interface EnvRendererLike {
    ctx: CanvasRenderingContext2D | null;
    cell_size: number;
    renderCell(cell: Cell): void;
    addToRender(cell: Cell): void;
    clearAllHighlights(clear_to_highlight?: boolean): void;
    highlightOrganism(org: RenderOrganismLike): void;
    highlightCell(cell: Cell): void;
}

/* Only the one method reached through here is declared, so that the controller
   layer does not depend on Engine's full surface. */
interface EnvEngineLike {
    emitChange(force?: boolean): void;
}

/* The slice of WorldEnvironment this controller drives. Still structural,
   though WorldEnvironment is now typed: this file sits inside the controller
   layer's mutual stand-in chain (CanvasController <-> ControlPanel <->
   EnvironmentController), and naming the class here only relocates the
   mismatch. The chain has to be untangled as a unit. */
interface EnvControllerEnvLike {
    renderer: EnvRendererLike;
    grid_map: {
        xyToColRow(x: number, y: number): [number, number];
        cellAt(col: number, row: number): ControllerCell | null;
    };
    num_rows: number;
    num_cols: number;
    total_ticks: number;
    /* Both overlay canvases are optional constructor arguments of
       WorldEnvironment and stay null when the React layer does not supply
       them. */
    glow_canvas: HTMLCanvasElement | null;
    deco_canvas: HTMLCanvasElement | null;
    /* Set by Engine after it builds the environment, so absent for the window
       between construction and that assignment -- performModeAction() guards on
       it explicitly. */
    engine?: EnvEngineLike;
    /* Keys are "col,row". dropRadiation() creates it when missing rather than
       assuming the environment brought one. */
    radiation_map?: Set<string>;
    clearWalls(): void;
    changeCell(c: number, r: number, state: CellState, owner: BodyCell | null): void;
    addOrganism(organism: Organism): void;
}

// Modes where the click affects a brush_size-radius area
const BRUSH_MODES: number[] = [Modes.FoodDrop, Modes.WallDrop, Modes.InvincibleWallDrop, Modes.RadiationDrop, Modes.ClickKill, Modes.SeedLife];

// Seed Life paints sparsely: each brush cell has this chance of spawning a
// random organism per paint tick, so a drag lays down scattered life rather
// than a solid wall of bodies. Attempts are also capped per tick.
const SEED_LIFE_DENSITY = 0.02;
const SEED_LIFE_MAX_PER_TICK = 6;

const MODE_CURSORS: Record<number, string> = {
    [Modes.Drag]: 'grab',
    [Modes.ClickKill]: 'not-allowed',
    [Modes.Select]: 'pointer',
    [Modes.Clone]: 'copy',
    [Modes.None]: 'default',
};

class EnvironmentController extends CanvasController{
    /* Narrower than the base's env: this controller reaches through to the whole
       WorldEnvironment, not just the renderer and grid map. Assigned by the base
       constructor through super(), which the checker cannot see, hence the
       definite assignment assertion. */
    env!: EnvControllerEnvLike;
    /* Not declared by CanvasController -- each subclass owns its own mode set.
       Both mode and org_to_clone are also written from outside by the React
       HUD (App.tsx, EditorDock). */
    mode: number;
    org_to_clone: Organism | null;
    scale: number;
    pan_x: number;
    pan_y: number;
    /* Cells painted by the cursor overlay on the previous frame, re-rendered at
       the start of the next one so the overlay does not smear. */
    overlay_cells: Set<Cell>;
    /* Assigned by setCanvas(), which the base constructor always calls, hence
       the definite assignment assertion rather than `| undefined`. */
    pointer_inside!: boolean;

    constructor(env: EnvControllerEnvLike, canvas: HTMLCanvasElement | null) {
        super(env, canvas);
        this.mode = Modes.FoodDrop;
        this.org_to_clone = null;
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
        this.overlay_cells = new Set();
        this.defineZoomControls();
    }

    setCanvas(canvas: HTMLCanvasElement | null): void {
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
    /* The `!` on this.canvas here and in defineZoomControls: the base declares
       it nullable because the *editor's* controller genuinely binds and unbinds
       its canvas (OrganismEditor.bindCanvas/releaseCanvas). The world's canvas
       never is. It has exactly one construction site -- WorldEnvironment passes
       renderer.canvas, which came from Engine, which App hands a ref to a canvas
       it renders unconditionally -- and nothing ever unbinds it.
       Worth knowing: the constructor still accepts null and calls
       defineZoomControls() unconditionally, so a second, canvas-less
       construction site added later would throw here rather than degrade. */
    applyView(): void {
        var transform = `translate(${this.pan_x}px, ${this.pan_y}px) scale(${this.scale})`;
        this.canvas!.style.transform = transform;
        // the overlay canvases mirror the world's pan/zoom
        if (this.env.glow_canvas)
            this.env.glow_canvas.style.transform = transform;
        if (this.env.deco_canvas)
            this.env.deco_canvas.style.transform = transform;
    }

    defineZoomControls(): void {
        const zoom_speed = 0.7;
        const MAX = 32;
        const MIN = Math.pow(2, -3);
        this.canvas!.onwheel = (event: WheelEvent) => {
            event.preventDefault();

            var sign = Math.sign(event.deltaY);
            var new_scale = Math.min(MAX, Math.max(MIN, this.scale * Math.pow(zoom_speed, sign)));

            // Keep the point under the cursor fixed. offsetX/offsetY come off
            // the event rather than this.mouse_x so that consecutive wheel
            // ticks without an intervening mousemove don't zoom toward a stale
            // point (the canvas moves under the cursor on every tick).
            this.pan_x += (this.canvas!.width/2  - event.offsetX) * (new_scale - this.scale);
            this.pan_y += (this.canvas!.height/2 - event.offsetY) * (new_scale - this.scale);

            this.scale = new_scale;
            this.applyView();
        };
    }

    resetView(): void {
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
        this.applyView();
    }

    /*
    Iterate over grid from 0,0 to env.num_cols,env.num_rows and create random walls using perlin noise to create a more organic shape.
    */
    randomizeWalls(thickness: number = 1): void {
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

    updateMouseLocation(offsetX: number, offsetY: number): void {
        super.updateMouseLocation(offsetX, offsetY);
    }

    mouseMove(): void {
        this.performModeAction();
    }

    mouseDown(): void {
        this.drag_anchor_x = this.client_x;
        this.drag_anchor_y = this.client_y;
        this.performModeAction();
    }

    mouseUp(): void {

    }

    performModeAction(): void {
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

                case Modes.SeedLife:
                    if (left_click) {
                        this.seedRandomLife();
                    } else if (right_click) {
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
                            /* The base class only publishes the hover target
                               on a direct hit, so a click that snapped to a
                               nearby organism would send it to the editor
                               without ever tinting it. */
                            this.setHighlightedOrg(this.cur_org);
                        }
                        if (this.cur_org != null){
                            /* Engine builds the environment (and so this
                               controller) and then ControlPanel, whose
                               constructor calls setControlPanel(this) --
                               all synchronously. A pointer event can only
                               be dispatched on a later turn of the event
                               loop, so this is always set by then. */
                            this.control_panel!.setEditorOrganism(this.cur_org);
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

    dragScreen(): void {
        // Both the anchor and the current position are screen coords, so the
        // delta is the true mouse movement and the pan tracks it 1:1.
        this.pan_x += this.client_x - this.drag_anchor_x;
        this.pan_y += this.client_y - this.drag_anchor_y;

        this.drag_anchor_x = this.client_x;
        this.drag_anchor_y = this.client_y;

        this.applyView();
    }

    applyCursor(): void {
        if (!this.canvas) return;
        var cursor = MODE_CURSORS[this.mode] || 'crosshair';
        if (this.canvas.style.cursor !== cursor)
            this.canvas.style.cursor = cursor;
    }

    // Immediate-mode cursor feedback, drawn every frame after the cell pass:
    // brush modes show their exact footprint, clone mode shows a ghost of the
    // organism (red-tinted when the spot is blocked). Cells painted over are
    // re-rendered at the start of the next pass, so nothing smears.
    renderCursorOverlay(): void {
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

    dropOrganism(organism: Organism, col: number, row: number): boolean {

        // close the organism and drop it in the world
        /* The only cast in this file. Organism declares its own view of this same environment
           (OrganismEnv) and the two still cannot unify -- but no longer for any
           reason this cleanup can reach. A grid cell's `cell_owner` is
           RenderCellOwnerLike in GridCell and BodyCell in OrganismGridCell, and
           neither satisfies the other: BodyCell lacks getAbsoluteDirection,
           which lives on EyeCell alone. That is a GridCell-side variance
           problem, independent of Organism being typed. The cast stays until
           cell_owner has one type. */
        var new_org = new Organism(col, row, this.env as unknown as OrganismEnv, organism);

        if (new_org.isClear(col, row)) {
            /* Hoisted and checked rather than asserted seven times. The organism
               inherits its species from the `organism` argument, and every
               in-repo caller passes the editor's organism, which always has one
               -- but this is the one entry point the React layer can reach with
               an arbitrary object (EngineAPI types the parameter `unknown`), so
               the invariant is not enforceable from here. Refusing the drop
               matches the method's existing failure contract; the alternative
               is publishing a species-less organism into env.organisms, where
               update(), reproduce() and die() all dereference species blind. */
            const species = new_org.species;
            if (!species) {
                return false;
            }
            let new_species = !FossilRecord.speciesIsExtant(species.name);
            if (species.extinct) {
                FossilRecord.resurrect(species);
            }
            else if (new_species) {
                FossilRecord.addSpeciesObj(species);
                species.start_tick = this.env.total_ticks;
                species.population = 0;
            }

            this.env.addOrganism(new_org);
            species.addPop();
            return true;
        }
        return false;
    }

    dropCellType(col: number, row: number, state: CellState, killBlocking: boolean = false, ignoreState: CellState | null = null): void {
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

    dropRadiation(col: number, row: number, isAdding: boolean): void {
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

    findNearOrganism(): Organism | null {
        /* performModeAction() -- the only caller -- returns early when
           cur_cell is null, and nothing reassigns it in between. The
           checker cannot carry that narrowing across the call. */
        let closest: Organism | null = null;
        let closest_dist = 100;
        for (let loc of Neighbors.inRange(WorldConfig.brush_size)){
            let c = this.cur_cell!.col + loc[0];
            let r = this.cur_cell!.row + loc[1];
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

    killNearOrganisms(): void {
        /* performModeAction() -- the only caller -- returns early when
           cur_cell is null, and nothing reassigns it in between. The
           checker cannot carry that narrowing across the call. */
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            var c = this.cur_cell!.col + loc[0];
            var r = this.cur_cell!.row + loc[1];
            var cell = this.env.grid_map.cellAt(c, r);
            if (cell != null && cell.owner != null)
                cell.owner.die();
        }
    }

    // Scatter freshly generated random organisms across the brush footprint.
    // Each candidate cell has a small chance of spawning; dropOrganism refuses
    // spots that aren't clear, so overlapping bodies never stack. The world
    // env doubles as the generator env -- its grid_map carries getCenter, the
    // one method RandomOrganismGenerator needs beyond Organism's own view.
    seedRandomLife(): void {
        /* performModeAction() -- the only caller -- returns early when
           cur_cell is null, and nothing reassigns it in between. */
        var gen_env = this.env as unknown as GeneratorEnv;
        var spawned = 0;
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            if (spawned >= SEED_LIFE_MAX_PER_TICK) break;
            if (Math.random() > SEED_LIFE_DENSITY) continue;
            var c = this.cur_cell!.col + loc[0];
            var r = this.cur_cell!.row + loc[1];
            if (c < 0 || c >= this.env.num_cols || r < 0 || r >= this.env.num_rows)
                continue;
            var organism = RandomOrganismGenerator.generate(gen_env);
            organism.species = new Species(organism.anatomy, null, this.env.total_ticks);
            if (this.dropOrganism(organism, c, r))
                spawned++;
        }
    }


}

export default EnvironmentController;
