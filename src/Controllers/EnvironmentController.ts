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
import type BodyCell from "../Organism/Cell/BodyCells/BodyCell";
import type { PredatorSpecies } from "../Organism/Predators";

/* The renderer, as this controller and its base class between them reach
   through it. The last three members mirror CanvasController's own (unexported)
   renderer shape verbatim, which is what keeps this `env` assignable to the
   base's. The real Renderer is not imported for the same reason EditorController
   does not import it: its highlightOrganism() takes a stricter organism shape
   than the base class declares, so the two structural views do not unify. */
interface EnvRendererLike {
    ctx: CanvasRenderingContext2D | null;
    cell_size: number;
    renderCell(idx: number): void;
    addToRender(idx: number): void;
    clearAllHighlights(clear_to_highlight?: boolean): void;
    highlightOrganism(org: RenderOrganismLike): void;
    highlightCell(idx: number): void;
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
    /* Scalar accessors rather than a cell object: the grid stores typed arrays
       and builds a view only on demand (see GridMap). `owner` is renarrowed
       from the render-facing RenderOrganismLike to the real Organism, which
       this file calls die() on and hands out as the current selection --
       legal because Organism satisfies that shape and is what is stored. */
    grid_map: {
        xyToColRow(x: number, y: number): [number, number];
        indexAt(col: number, row: number): number;
        stateAt(col: number, row: number): CellState | null;
        ownerAt(col: number, row: number): Organism | null;
        colOf(idx: number): number;
        rowOf(idx: number): number;
        xOf(idx: number): number;
        yOf(idx: number): number;
        dishTierOf(idx: number): number;
    };
    num_rows: number;
    num_cols: number;
    total_ticks: number;
    /* Pan/zoom notification: the env owns the viewport-sized overlay
       canvases and re-aims their camera when the view moves. */
    onCameraMoved(): void;
    /* The cursor overlay's own layer: cleared and set to world coordinates
       by the env, null when there is nothing to paint on (no canvas mounted,
       headless, or no camera yet). */
    cursorLayer(): CanvasRenderingContext2D | null;
    /* Set by Engine after it builds the environment, so absent for the window
       between construction and that assignment -- performModeAction() guards on
       it explicitly. */
    engine?: EnvEngineLike;
    /* Keys are "col,row". dropRadiation() creates it when missing rather than
       assuming the environment brought one -- so the change signal that goes
       with it is optional for the same reason. */
    radiation_map?: Set<string>;
    markRadiationChanged?(): void;
    changeCell(c: number, r: number, state: CellState, owner: BodyCell | null): void;
    addOrganism(organism: Organism): void;
    followOrganism(org: Organism): void;
    meteorStrike(col: number, row: number, radius: number): void;
    releasePredator(def: PredatorSpecies, col: number, row: number, radius: number): number;
}

/* Modes where the cursor overlay draws a brush_size-radius footprint. Meteor
   and predator release only fire once per click (see performModeAction), but
   share the reticle so their footprint -- blast radius, pack scatter -- is
   previewed like any other brush. The predator reticle is a lower bound: the
   release floors the scatter at PREDATOR_MIN_SPREAD so a tiny brush still has
   room for a whole pack. */
const BRUSH_MODES: number[] = [Modes.FoodDrop, Modes.WallDrop, Modes.InvincibleWallDrop, Modes.RadiationDrop, Modes.ClickKill, Modes.SeedLife, Modes.MeteorStrike, Modes.ReleasePredator, Modes.Eraser];

// Seed Life paints sparsely: each brush cell has this chance of spawning a
// random organism per paint tick, so a drag lays down scattered life rather
// than a solid wall of bodies. Attempts are also capped per tick.
const SEED_LIFE_DENSITY = 0.02;
const SEED_LIFE_MAX_PER_TICK = 6;

/* Zoom floor for centerOn(): how close the camera gets when something asks to
   be looked at. Tuned for the notification log's "go to the subject" click,
   where the subject is often a single organism. */
const FOCUS_MIN_SCALE = 2;

const MODE_CURSORS: Record<number, string> = {
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
    /* Which bestiary species a ReleasePredator click drops. Set by the React
       HUD when the player picks one out of the predator modal, and cleared
       alongside the mode when the tool is put away. */
    pending_predator: PredatorSpecies | null;
    /* Set when a canvas click loads an organism into the editor; consumed
       (and cleared) by the React layer (App.tsx) to open the lab dock.
       Distinguishes canvas sampling from the dock's own Reset/Random/preset
       loads, which also swap the editor organism. */
    pending_editor_open: boolean;
    scale: number;
    pan_x: number;
    pan_y: number;
    /* Assigned by setCanvas(), which the base constructor always calls, hence
       the definite assignment assertion rather than `| undefined`. */
    pointer_inside!: boolean;

    constructor(env: EnvControllerEnvLike, canvas: HTMLCanvasElement | null) {
        super(env, canvas);
        this.mode = Modes.None;
        this.org_to_clone = null;
        this.pending_predator = null;
        this.pending_editor_open = false;
        this.scale = 1;
        this.pan_x = 0;
        this.pan_y = 0;
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
        /* The overlays no longer mirror this transform: they are
           viewport-sized and bake the camera into their content. The env
           schedules their repaints and bridges the interim with its own CSS
           transform on each. */
        this.env.onCameraMoved();
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

    /* Put a world cell in the middle of the viewport. The inverse of the
       mapping overlayCamera() derives: a world pixel p lands at screen
       W/2 + pan_x - (W/2)*s + p*s, so pinning that to W/2 gives
       pan_x = s * (W/2 - p) -- the same algebra as the wheel handler's cursor
       anchoring above, solved for the pan instead of the delta.

       The zoom floor is the difference between "the camera moved" and "I can
       see what it moved to": a single organism centred at 1x is a few pixels in
       the middle of a hundred-cell world, which reads as nothing having
       happened. An already-closer view is left alone -- this only ever moves
       the camera towards the subject, never away from it. */
    centerOn(col: number, row: number): void {
        const cs = this.env.renderer.cell_size;
        this.scale = Math.max(this.scale, FOCUS_MIN_SCALE);
        this.pan_x = this.scale * (this.canvas!.width / 2 - (col + 0.5) * cs);
        this.pan_y = this.scale * (this.canvas!.height / 2 - (row + 0.5) * cs);
        // Not optional: applyView() is what tells the env the camera moved, and
        // the viewport-sized overlays re-aim off that. Writing the three fields
        // without it leaves the frost, smoke and floaties behind.
        this.applyView();
    }

    /*
    Iterate over grid from 0,0 to env.num_cols,env.num_rows and create random walls using perlin noise to create a more organic shape.
    The world bounds are left untouched: invincible walls (the petri dish glass
    among them) are never cleared or overwritten, so with the dish setting on
    the noise walls land only in the dish interior.
    */
    randomizeWalls(thickness: number = 1): void {
        const noise_threshold = -0.017;
        let resolution = 20;
        Perlin.seed();

        for (let r = 0; r < this.env.num_rows; r++) {
            for (let c = 0; c < this.env.num_cols; c++) {
                let idx = this.env.grid_map.indexAt(c, r);
                if (idx < 0) continue;
                let state = this.env.grid_map.stateAt(c, r);
                if (state == CellStates.invincible_wall || this.env.grid_map.dishTierOf(idx) !== 0) continue;

                let xval = c/this.env.num_cols*(resolution/this.env.renderer.cell_size*(this.env.num_cols/this.env.num_rows));
                let yval = r/this.env.num_rows*(resolution/this.env.renderer.cell_size*(this.env.num_rows/this.env.num_cols));
                let noise = Perlin.get(xval, yval);
                if (noise > noise_threshold && noise < noise_threshold + thickness/resolution) {
                    let owner = this.env.grid_map.ownerAt(c, r);
                    if(owner != null) owner.die();
                    this.env.changeCell(c, r, CellStates.wall, null);
                } else if (state == CellStates.wall) {
                    // A re-roll replaces the previous random layout: regular
                    // walls the new noise field misses are cleared in place
                    // rather than via clearWalls(), which would also take the
                    // dish glass with it.
                    this.env.changeCell(c, r, CellStates.empty, null);
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
        this.performModeAction(true);
    }

    mouseUp(): void {

    }

    /* Copies the organism under the cursor into the lab. Shared by the Select
       tool and the unarmed (Modes.None) left-click. */
    sampleOrganism(): void {
        if (this.cur_org == null) {
            this.cur_org = this.findNearOrganism();
            /* The base class only publishes the hover target on a direct hit,
               so a click that snapped to a nearby organism would send it to
               the editor without ever tinting it. */
            this.setHighlightedOrg(this.cur_org);
        }
        if (this.cur_org != null){
            this.pending_editor_open = true;
            /* Engine builds the environment (and so this controller) and then
               ControlPanel, whose constructor calls setControlPanel(this) --
               all synchronously. A pointer event can only be dispatched on a
               later turn of the event loop, so this is always set by then. */
            this.control_panel!.setEditorOrganism(this.cur_org);
            /* Persist the focus the hover state loses on the next mousemove:
               the click also starts following this organism's lineage. The
               editor gets a copy; the tracker keeps the live world organism.
               cur_org is the base class's render-facing view of what the grid
               stores, which is an Organism -- the same renarrowing this file's
               grid_map.ownerAt documents -- so the cast records that rather
               than changing the value. */
            this.env.followOrganism(this.cur_org as Organism);
            /* Force an emit so the dock opens now rather than on the next
               throttled sim-loop emit. */
            if (this.env && this.env.engine) {
                this.env.engine.emitChange(true);
            }
        }
    }

    /* Puts the active tool away, whichever it is, and clears any state armed
       alongside it. Shared by the universal right-click cancel and the Escape
       chain in App.tsx. */
    cancelMode(): void {
        this.mode = Modes.None;
        this.org_to_clone = null;
        this.pending_predator = null;
        if (this.env && this.env.engine) {
            this.env.engine.emitChange(true);
        }
    }

    performModeAction(from_mouse_down: boolean = false): void {
        // Headless disables the world tools, but middle-click pan still works.
        if (WorldConfig.headless && !this.middle_click)
            return;
        var mode = this.mode;
        var right_click = this.right_click;
        var left_click = this.left_click;
        if (right_click || left_click) {
            /* xyToColRow clamps to the grid, so the hovered coordinates are
               always on it and cur_idx is only negative before the first
               pointer event has set them. */
            if (this.cur_idx < 0){
                return;
            }
            /* Right-click is the universal cancel: it puts whatever tool is
               armed away and never performs a mode action. Gated to the
               mousedown so a right-drag doesn't re-fire it every mousemove;
               the return also swallows those drag frames. */
            if (right_click) {
                if (from_mouse_down && mode !== Modes.None) {
                    this.cancelMode();
                }
                return;
            }
            var cell_c = this.mouse_c;
            var cell_r = this.mouse_r;
            switch(mode) {
                case Modes.None:
                    /* Unarmed: a deliberate left-click samples the organism
                       under the cursor. Gated to the mousedown event so a
                       left-drag doesn't re-sample everything it crosses. */
                    if (left_click && from_mouse_down) {
                        this.sampleOrganism();
                    }
                    break;
                case Modes.FoodDrop:
                    if (left_click){
                        this.dropCellType(cell_c, cell_r, CellStates.food, false, CellStates.wall);
                    }
                    break;
                case Modes.WallDrop:
                        if (left_click){
                            this.dropCellType(cell_c, cell_r, CellStates.wall, true);
                        }
                        break;
                case Modes.InvincibleWallDrop:
                        if (left_click){
                            this.dropCellType(cell_c, cell_r, CellStates.invincible_wall, true);
                        }
                        break;
                case Modes.RadiationDrop:
                        if (left_click) {
                            this.dropRadiation(cell_c, cell_r, true);
                        }
                        break;
                case Modes.Eraser:
                    // One stroke clears every terrain layer -- food, walls,
                    // glass, radiation -- but never organisms; that stays the
                    // Kill tool's job.
                    if (left_click) {
                        this.dropCellType(cell_c, cell_r, CellStates.empty, false);
                        this.dropRadiation(cell_c, cell_r, false);
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
                    }
                    break;

                case Modes.MeteorStrike:
                    // One impact per click, not a drag-paint: gated to the
                    // mousedown so a held drag doesn't carpet-bomb the world.
                    if (left_click && from_mouse_down) {
                        this.env.meteorStrike(this.mouse_c, this.mouse_r, WorldConfig.brush_size);
                    }
                    break;

                case Modes.ReleasePredator:
                    /* One pack per click, like the meteor. The tool stays
                       armed afterwards so several packs (or several species)
                       can be seeded into one world. */
                    if (left_click && from_mouse_down && this.pending_predator) {
                        this.env.releasePredator(this.pending_predator, this.mouse_c, this.mouse_r, WorldConfig.brush_size);
                    }
                    break;

                case Modes.Select:
                    if (left_click) {
                        this.sampleOrganism();
                    }
                    break;

                case Modes.Clone:
                    if (left_click && this.org_to_clone != null) {
                        this.dropOrganism(this.org_to_clone, this.mouse_c, this.mouse_r);
                    }
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
    // organism (red-tinted when the spot is blocked). It paints its own layer
    // (WorldEnvironment.cursorLayer), which the env clears before handing it
    // over -- so nothing here touches the cells the life forms live on, and
    // nothing has to be repainted behind the pointer.
    renderCursorOverlay(): void {
        if (WorldConfig.headless) return;
        this.applyCursor();
        var ctx = this.env.cursorLayer();
        if (!ctx) return;
        if (!this.pointer_inside || this.mouse_c == null)
            return;

        var cs = this.env.renderer.cell_size;

        if (BRUSH_MODES.includes(this.mode)) {
            // Destructive brushes ring in red; Meteor reads as a blast reticle.
            var is_kill = this.mode === Modes.ClickKill || this.mode === Modes.MeteorStrike || this.mode === Modes.Eraser;
            var b = WorldConfig.brush_size;
            // Fill the disc, matching Neighbors.inRange -- which is the
            // footprint the tools actually stamp.
            var fill_limit = (b + 0.5) * (b + 0.5);
            ctx.fillStyle = is_kill ? 'rgba(255, 60, 60, 0.22)' : 'rgba(0, 255, 65, 0.14)';
            for (var i = -b; i <= b; i++) {
                for (var j = -b; j <= b; j++) {
                    if (i * i + j * j > fill_limit) continue;
                    var brush_idx = this.env.grid_map.indexAt(this.mouse_c + i, this.mouse_r + j);
                    if (brush_idx < 0) continue;
                    ctx.fillRect(this.env.grid_map.xOf(brush_idx), this.env.grid_map.yOf(brush_idx), cs, cs);
                }
            }
            ctx.strokeStyle = is_kill ? 'rgba(255, 60, 60, 0.7)' : 'rgba(0, 255, 65, 0.55)';
            ctx.lineWidth = 1;
            // Ring the disc: centre on the hovered cell, radius to the painted edge
            var centre_x = (this.mouse_c + 0.5) * cs;
            var centre_y = (this.mouse_r + 0.5) * cs;
            ctx.beginPath();
            ctx.arc(centre_x, centre_y, (b + 0.5) * cs, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (this.mode === Modes.Clone && this.org_to_clone != null) {
            // Mirrors Organism.isClear for a fresh (rotation: up) copy
            var valid = true;
            for (var body_cell of this.org_to_clone.anatomy.cells) {
                var target_state = this.env.grid_map.stateAt(this.mouse_c + body_cell.loc_col, this.mouse_r + body_cell.loc_row);
                if (target_state == null ||
                    !(target_state === CellStates.empty || (!Hyperparams.foodBlocksReproduction && target_state === CellStates.food))) {
                    valid = false;
                    break;
                }
            }
            ctx.globalAlpha = 0.55;
            for (var body_cell of this.org_to_clone.anatomy.cells) {
                var target = this.env.grid_map.indexAt(this.mouse_c + body_cell.loc_col, this.mouse_r + body_cell.loc_row);
                if (target < 0) continue;
                var tx = this.env.grid_map.xOf(target);
                var ty = this.env.grid_map.yOf(target);
                ctx.fillStyle = body_cell.custom_color || body_cell.state.color;
                ctx.fillRect(tx, ty, cs, cs);
                if (!valid) {
                    ctx.fillStyle = 'rgba(255, 60, 60, 0.6)';
                    ctx.fillRect(tx, ty, cs, cs);
                }
            }
            ctx.globalAlpha = 1;
        }
    }

    dropOrganism(organism: Organism, col: number, row: number): boolean {

        // close the organism and drop it in the world
        /* The only cast in this file. Organism declares its own view of this same environment
           (OrganismEnv) and the two still cannot unify -- but no longer for any
           reason this cleanup can reach. A grid cell's `cell_owner` is
           RenderCellOwnerLike in GridMap and BodyCell in OrganismGrid, and
           neither satisfies the other: BodyCell lacks getAbsoluteDirection,
           which lives on EyeCell alone. That is a grid-side variance
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
            var idx = this.env.grid_map.indexAt(c, r);
            if (idx < 0)
                continue;
            var owner = this.env.grid_map.ownerAt(c, r);
            if (killBlocking && owner != null){
                owner.die();
            }
            else if (owner != null) {
                continue;
            }
            if (state !== CellStates.empty) {
                var cur_state = this.env.grid_map.stateAt(c, r);
                if (ignoreState != null && (cur_state == ignoreState || cur_state == CellStates.invincible_wall || cur_state == CellStates.wall))
                    continue;
            }
            this.env.changeCell(c, r, state, null);
        }
    }

    dropRadiation(col: number, row: number, isAdding: boolean): void {
        if (!this.env.radiation_map) this.env.radiation_map = new Set();
        let any_changed = false;
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
                    any_changed = true;
                    var idx = this.env.grid_map.indexAt(c, r);
                    if (idx >= 0) this.env.renderer.addToRender(idx);
                }
            }
        }
        // One bump per brush stamp, not per cell: the smoke overlay only needs
        // to know that the map moved.
        if (any_changed && this.env.markRadiationChanged) this.env.markRadiationChanged();
    }

    findNearOrganism(): Organism | null {
        /* performModeAction() -- the only caller -- returns early when
           the pointer is off the grid, and nothing reassigns the hovered
           coordinates in between. */
        let closest: Organism | null = null;
        let closest_dist = 100;
        for (let loc of Neighbors.inRange(WorldConfig.brush_size)){
            let c = this.mouse_c + loc[0];
            let r = this.mouse_r + loc[1];
            let owner = this.env.grid_map.ownerAt(c, r);
            let dist = Math.abs(loc[0]) + Math.abs(loc[1]);
            if (owner != null) {
                if (closest === null || dist < closest_dist) {
                    closest = owner;
                    closest_dist = dist;
                }
            }
        }
        return closest;
    }

    killNearOrganisms(): void {
        /* performModeAction() -- the only caller -- returns early when
           the pointer is off the grid, and nothing reassigns the hovered
           coordinates in between. */
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            var c = this.mouse_c + loc[0];
            var r = this.mouse_r + loc[1];
            var owner = this.env.grid_map.ownerAt(c, r);
            if (owner != null)
                owner.die();
        }
    }

    // Scatter freshly generated random organisms across the brush footprint.
    // Each candidate cell has a small chance of spawning; dropOrganism refuses
    // spots that aren't clear, so overlapping bodies never stack. The world
    // env doubles as the generator env -- its grid_map carries getCenter, the
    // one method RandomOrganismGenerator needs beyond Organism's own view.
    seedRandomLife(): void {
        /* performModeAction() -- the only caller -- returns early when
           the pointer is off the grid, and nothing reassigns the hovered
           coordinates in between. */
        var gen_env = this.env as unknown as GeneratorEnv;
        var spawned = 0;
        for (var loc of Neighbors.inRange(WorldConfig.brush_size)){
            if (spawned >= SEED_LIFE_MAX_PER_TICK) break;
            if (Math.random() > SEED_LIFE_DENSITY) continue;
            var c = this.mouse_c + loc[0];
            var r = this.mouse_r + loc[1];
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
