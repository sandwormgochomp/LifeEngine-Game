const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');

class WorldEnvironment extends Environment{
    constructor(cell_size) {
        super();
        this.renderer = new Renderer('env-canvas', 'env', cell_size);
        this.renderer.env = this;
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
                this.renderer.ctx.fillStyle = '#d2691e';
                this.renderer.ctx.fillRect(proj.col * this.renderer.cell_size + this.renderer.cell_size/4, proj.row * this.renderer.cell_size + this.renderer.cell_size/4, this.renderer.cell_size/2, this.renderer.cell_size/2);
            }
        }
        this.active_projectiles = remaining_projectiles;
        
        // Day/Night Cycle
        this.day_timer++;
        if (this.day_timer > 3600) { // 1 minute at 60 ticks per second
            this.day_timer = 0;
            this.is_night = !this.is_night;
            var overlay = document.getElementById('env-canvas');
            if (this.is_night) {
                overlay.style.filter = "brightness(0.3) hue-rotate(180deg) saturate(0.5)"; // Blueish dark tint
            } else {
                overlay.style.filter = "none";
            }
        }

        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause)
                if (this.controller && this.controller.control_panel) {
                    this.controller.control_panel.setPaused(true);
                }
            else if(WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
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
        if(state == CellStates.wall || state == CellStates.invincible_wall)
            this.walls.push(this.grid_map.cellAt(c, r));
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && (wcell.state == CellStates.wall || wcell.state == CellStates.invincible_wall))
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
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

    reset(confirm_reset=true, reset_life=true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;

        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.active_explosions = [];
        this.active_projectiles = [];
        this.day_timer = 0;
        this.is_night = false;
        var overlay = document.getElementById('env-canvas');
        if (overlay) overlay.style.filter = "none";
        this.radiation_map.clear();
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
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
        var overrideCheckbox = document.getElementById('override-controls');
        if (overrideCheckbox && overrideCheckbox.checked)
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

