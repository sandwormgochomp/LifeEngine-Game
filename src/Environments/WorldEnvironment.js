import Environment from './Environment';
import Renderer from '../Rendering/Renderer';
import drawOrganismDecorations from '../Rendering/DecorationRenderer';
import GridMap from '../Grid/GridMap';
import Organism from '../Organism/Organism';
import CellStates from '../Organism/Cell/CellStates';
import EnvironmentController from '../Controllers/EnvironmentController';
import Hyperparams from '../Hyperparameters.js';
import FossilRecord from '../Stats/FossilRecord';
import WorldConfig from '../WorldConfig';
import SerializeHelper from '../Utils/SerializeHelper';
import Species from '../Stats/Species';

// Glow overlay tuning. The scratch canvas renders at 1/DOWNSCALE resolution
// and is upscaled with smoothing, so a bigger divisor diffuses the halo more.
// SPREAD widens each cell before that blur; ALPHA sets peak intensity.
const GLOW_DOWNSCALE = 6;
const GLOW_SPREAD = 1.5;
const GLOW_ALPHA = 0.1;

class WorldEnvironment extends Environment{
    constructor(cell_size, canvas, container, glow_canvas=null, deco_canvas=null) {
        super();
        this.container = container;
        this.renderer = new Renderer(canvas, container, cell_size);
        this.renderer.env = this;
        // Glow is a separate compositing pass: organisms are drawn flat onto a
        // scratch canvas, then blitted once with a blur filter onto an overlay
        // canvas that shares the world's pan/zoom transform. Per-cell canvas
        // shadows don't work here: neighboring cells overpaint each other's
        // spill, and incremental rendering leaves trails.
        this.glow_canvas = glow_canvas;
        this.glow_ctx = glow_canvas ? glow_canvas.getContext('2d') : null;
        this.glow_scratch = document.createElement('canvas');
        this.glow_scratch_ctx = this.glow_scratch.getContext('2d');
        // Decorations (outlines, connective tissue) overflow their cells'
        // pixel boxes, so they live on their own overlay that is cleared and
        // fully repainted when the world changes — the dirty-rect world
        // canvas would clip and smear them.
        this.deco_canvas = deco_canvas;
        this.deco_ctx = deco_canvas ? deco_canvas.getContext('2d') : null;
        this.syncOverlaySizes();
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.radiation_map = new Set();
        this.day_timer = 0;
        this.is_night = false;
        FossilRecord.setEnv(this);
    }

    update() {
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }

        // Update active explosions
        var remaining_explosions = [];
        for (var exp of this.active_explosions) {
            exp.ticks--;
            if (exp.ticks <= 0) {
                var cell = this.grid_map.cellAt(exp.col, exp.row);
                if (cell && cell.state === CellStates.explosion) {
                    this.changeCell(exp.col, exp.row, CellStates.empty, null);
                }
            } else {
                remaining_explosions.push(exp);
            }
        }
        this.active_explosions = remaining_explosions;

        // Update active projectiles
        var remaining_projectiles = [];
        for (var proj of this.active_projectiles) {
            // Clear current pos
            var current_cell = this.grid_map.cellAt(proj.col, proj.row);
            // Move projectile
            proj.col += proj.dir_col;
            proj.row += proj.dir_row;
            proj.ticks++;
            
            var target_cell = this.grid_map.cellAt(proj.col, proj.row);
            var hit = false;
            
            if (target_cell) {
                if (target_cell.state === CellStates.wall || target_cell.state === CellStates.invincible_wall) {
                    hit = true;
                    if (target_cell.state === CellStates.wall) {
                        if (typeof target_cell.durability !== 'undefined') {
                            target_cell.durability -= 5;
                            if (target_cell.durability <= 0) {
                                this.changeCell(target_cell.col, target_cell.row, CellStates.empty, null);
                            }
                        } else {
                            this.changeCell(target_cell.col, target_cell.row, CellStates.empty, null);
                        }
                    }
                } else if (target_cell.owner && target_cell.owner !== proj.owner) {
                    hit = true;
                    target_cell.owner.takeDamage(5); // Projectile deals 5 damage
                }
            } else {
                hit = true; // Off screen
            }
            
            if (!hit && proj.ticks < 50) { // Max range 50
                remaining_projectiles.push(proj);
                if (this.renderer.ctx) {
                    this.renderer.ctx.fillStyle = '#d2691e';
                    this.renderer.ctx.fillRect(proj.col * this.renderer.cell_size + this.renderer.cell_size/4, proj.row * this.renderer.cell_size + this.renderer.cell_size/4, this.renderer.cell_size/2, this.renderer.cell_size/2);
                }
            }
        }
        this.active_projectiles = remaining_projectiles;
        
        // Day/Night Cycle
        this.day_timer++;
        if (this.day_timer > 3600) { // 1 minute at 60 ticks per second
            this.day_timer = 0;
            this.setNightMode(!this.is_night);
        }

        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    setNightMode(isNight) {
        this.is_night = Boolean(isNight);
        this.day_timer = 0;
        var night_filter = this.is_night ? "brightness(0.3) hue-rotate(180deg) saturate(0.5)" : "none";

        if (this.renderer && this.renderer.canvas) this.renderer.canvas.style.filter = night_filter;
        if (this.deco_canvas) this.deco_canvas.style.filter = night_filter;
        if (this.glow_canvas) this.glow_canvas.style.filter = night_filter;

        var container = this.container || (this.renderer ? this.renderer.container : null);
        if (container) {
            container.style.filter = "none";
            container.style.backgroundColor = this.is_night ? '#000000' : '#05050A';
        }

        if (this.engine && typeof this.engine.notify === 'function') {
            this.engine.notify();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
        this.controller.renderCursorOverlay();
        this.renderDecorations();
        this.renderGlow();
    }

    syncOverlaySizes() {
        if (this.deco_canvas) {
            this.deco_canvas.width = this.renderer.width;
            this.deco_canvas.height = this.renderer.height;
            this.deco_dirty = true;
        }
        if (!this.glow_canvas) return;
        this.glow_canvas.width = this.renderer.width;
        this.glow_canvas.height = this.renderer.height;
        // The scratch is rendered small: upscaling it with image smoothing
        // produces the soft halo for free, where a per-frame blur() filter at
        // full resolution dragged the whole app down.
        this.glow_scratch.width = Math.max(1, Math.ceil(this.renderer.width / GLOW_DOWNSCALE));
        this.glow_scratch.height = Math.max(1, Math.ceil(this.renderer.height / GLOW_DOWNSCALE));
        this.glow_dirty = true;
    }

    renderDecorations() {
        if (!this.deco_ctx || WorldConfig.headless) return;
        // Like glow, only repaint when the world changed; pan/zoom move the
        // overlay via its CSS transform instead.
        if (!this.deco_dirty) return;
        this.deco_dirty = false;
        drawOrganismDecorations(this.deco_ctx, this);
    }

    renderGlow() {
        if (!this.glow_ctx || WorldConfig.headless) return;
        // Only re-composite when the world changed (changeCell/addOrganism);
        // pan and zoom move the overlay via its CSS transform instead.
        if (!this.glow_dirty) return;
        this.glow_dirty = false;

        var w = this.renderer.width;
        var h = this.renderer.height;
        var cs = this.renderer.cell_size / GLOW_DOWNSCALE;
        var margin = cs * (GLOW_SPREAD - 1) / 2;

        var sctx = this.glow_scratch_ctx;
        sctx.clearRect(0, 0, this.glow_scratch.width, this.glow_scratch.height);
        for (var org of this.organisms) {
            for (var body_cell of org.anatomy.cells) {
                var cell = org.getRealCell(body_cell);
                if (cell == null) continue;
                sctx.fillStyle = body_cell.custom_color || body_cell.state.color;
                sctx.fillRect(
                    cell.x / GLOW_DOWNSCALE - margin,
                    cell.y / GLOW_DOWNSCALE - margin,
                    cs * GLOW_SPREAD,
                    cs * GLOW_SPREAD
                );
            }
        }

        var gctx = this.glow_ctx;
        gctx.clearRect(0, 0, w, h);
        gctx.globalAlpha = GLOW_ALPHA;
        gctx.imageSmoothingEnabled = true;
        gctx.drawImage(this.glow_scratch, 0, 0, this.glow_scratch.width, this.glow_scratch.height, 0, 0, w, h);
        gctx.globalAlpha = 1;
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.deco_dirty = true;
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause) {
                if (this.controller && this.controller.control_panel) {
                    this.controller.control_panel.setPaused(true);
                }
            }
            else if (WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset();
            }
        }
    }

    OriginOfLife() {
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
    }

    addOrganism(organism) {
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count) 
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        this.glow_dirty = true;
        this.deco_dirty = true;
        if(state == CellStates.wall || state == CellStates.invincible_wall)
            this.walls.push(this.grid_map.cellAt(c, r));
    }

    // Enclose the world in a circular dish of invincible wall: life lives
    // inside the circle, everything outside is dead "glass". Survives resets
    // because fillGrid preserves walls unless clear_walls_on_reset is set.
    // Cells are flagged so the renderer can draw the glass as page-background
    // (hiding the rectangular canvas) with a lit rim ring at the dish edge.
    buildPetriDish() {
        var cx = (this.grid_map.cols - 1) / 2;
        var cy = (this.grid_map.rows - 1) / 2;
        // Inset radius by 4 cells so the full 3-tier glass rim and shadow fit comfortably
        // inside the canvas grid without being cut off on top, bottom, left or right.
        var radius = Math.min(this.grid_map.cols, this.grid_map.rows) / 2 - 4;
        for (var c = 0; c < this.grid_map.cols; c++) {
            for (var r = 0; r < this.grid_map.rows; r++) {
                var cell = this.grid_map.cellAt(c, r);
                var dx = c - cx;
                var dy = r - cy;
                var dist = Math.hypot(dx, dy);
                if (dist < radius - 0.5) {
                    cell.dish_glass = false;
                    cell.dish_tier = 0;
                    continue;
                }
                cell.dish_glass = true;
                var angle = Math.atan2(dy, dx);
                // Angle light factor: 1.0 at top-left (-135 deg), -1.0 at bottom-right (45 deg)
                var light = -Math.cos(angle - Math.PI * 0.75);

                if (dist < radius + 0.5) {
                    cell.dish_tier = 1; // Inner Lip
                } else if (dist < radius + 1.8) {
                    cell.dish_tier = 2; // Main Rim
                } else if (dist < radius + 2.8) {
                    cell.dish_tier = 3; // Outer Shadow Rim
                } else {
                    cell.dish_tier = 4; // Void
                }
                cell.dish_light = light;

                if (cell.owner != null)
                    cell.owner.die();
                if (cell.state !== CellStates.invincible_wall)
                    this.changeCell(c, r, CellStates.invincible_wall, null);
            }
        }
        this.renderFull();
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && (wcell.state == CellStates.wall || wcell.state == CellStates.invincible_wall)) {
                wcell.dish_glass = false;
                wcell.dish_rim = false;
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
            }
        }
        this.renderFull();
    }

    clearOrganisms() {
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }
    
    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                if (this.grid_map.cellAt(c, r).state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    // Destructive: callers are responsible for confirming with the user first
    reset(reset_life=true) {
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.day_timer = 0;
        this.is_night = false;
        this.renderer.canvas.style.filter = "none";
        if (this.deco_canvas)
            this.deco_canvas.style.filter = "none";
        this.deco_dirty = true;
        this.radiation_map.clear();
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        cell_size = Number(cell_size);
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
        this.syncOverlaySizes();
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow();
        this.syncOverlaySizes();
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms){
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }
        // Saved worlds carry dish walls but not the glass flags; re-flag them
        if (WorldConfig.petri_dish)
            this.buildPetriDish();

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

export default WorldEnvironment;

