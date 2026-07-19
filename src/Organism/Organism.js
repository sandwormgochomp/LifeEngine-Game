import CellStates from "./Cell/CellStates";
import Neighbors from "../Grid/Neighbors";
import Hyperparams from "../Hyperparameters";
import Directions from "./Directions";
import Anatomy from "./Anatomy";
import Brain from "./Perception/Brain";
import FossilRecord from "../Stats/FossilRecord";
import SerializeHelper from "../Utils/SerializeHelper";
import Observation from "./Perception/Observation";

class Organism {
    constructor(col, row, env, parent=null) {
        this.c = col;
        this.r = row;
        this.env = env;
        this.lifetime = 0;
        this.food_collected = 0;
        this.living = true;
        this.anatomy = new Anatomy(this)
        this.direction = Directions.down; // direction of movement
        this.rotation = Directions.up; // direction of rotation
        this.can_rotate = Hyperparams.rotationEnabled;
        this.move_count = 0;
        this.move_range = 4;
        this.ignore_brain_for = 0;
        this.mutability = 5;
        this.damage = 0;
        this.poison_ticks = 0;
        this.poison_duration = 10;
        this.healer_food_cost = Hyperparams.healerFoodCost;
        this.brain = new Brain(this);
        this.brain_triggered_heal = false;
        this.hibernating = false;
        if (parent != null) {
            this.inherit(parent);
        }
    }

    inherit(parent) {
        this.move_range = parent.move_range;
        this.mutability = parent.mutability;
        this.healer_food_cost = parent.healer_food_cost;
        this.poison_duration = parent.poison_duration;
        this.species = parent.species;
        for (var c of parent.anatomy.cells){
            //deep copy parent cells
            if (c.state === CellStates.pheromone) {
                let dummy_c = { state: CellStates.common, loc_col: c.loc_col, loc_row: c.loc_row, custom_color: c.custom_color };
                this.anatomy.addInheritCell(dummy_c);
            } else {
                this.anatomy.addInheritCell(c);
            }
        }
        if(parent.anatomy.is_mover && parent.anatomy.has_eyes) {
            this.brain.copy(parent.brain);
        }
    }

    // amount of food required before it can reproduce
    foodNeeded() {
        return this.anatomy.is_mover ? this.anatomy.cells.length + Hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
    }

    lifespan() {
        return this.anatomy.cells.length * Hyperparams.lifespanMultiplier;
    }

    maxHealth() {
        return this.anatomy.cells.length;
    }

    reproduce() {
        //produce mutated child
        //check nearby locations (is there room and a direct path)
        var org = new Organism(0, 0, this.env, this);
        if(Hyperparams.rotationEnabled){
            org.rotation = Directions.getRandomDirection();
        }
        var prob = this.mutability;
        if (Hyperparams.useGlobalMutability){
            prob = Hyperparams.globalMutability;
        }
        else {
            //mutate the mutability
            if (Math.random() <= 0.5)
                org.mutability++;
            else{ 
                org.mutability--;
                if (org.mutability < 1)
                    org.mutability = 1;
            }
        } 
        if (this.in_radiation) {
            prob *= 5; // Boost mutability while in radiation zone
        }
        var mutated = false;
        if (Math.random() * 100 <= prob) {
            if (org.anatomy.is_mover && Math.random() * 100 <= 10) { 
                if (org.anatomy.has_eyes) {
                    org.brain.mutate();
                }
                org.move_range += Math.floor(Math.random() * 4) - 2;
                if (org.move_range <= 0){
                    org.move_range = 1;
                };
                
            }
            else {
                mutated = org.mutate();
            }
        }

        var direction = Directions.getRandomScalar();
        var direction_c = direction[0];
        var direction_r = direction[1];
        var offset = (Math.floor(Math.random() * 3));
        var basemovement = this.anatomy.birth_distance;
        var new_c = this.c + (direction_c*basemovement) + (direction_c*offset);
        var new_r = this.r + (direction_r*basemovement) + (direction_r*offset);

        if (org.isClear(new_c, new_r, org.rotation, true) && 
            org.isStraightPath(new_c, new_r, this.c, this.r, this) && 
            this.env.canAddOrganism())
        {
            org.c = new_c;
            org.r = new_r;
            this.env.addOrganism(org);
            org.updateGrid();
            if (mutated) {
                FossilRecord.addSpecies(org, this.species);
            }
            else {
                org.species.addPop();
            }
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    mutate() {
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(Hyperparams.addProb)) {
            let branch = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType();//branch.state;
            let growth_direction = Neighbors.all[Math.floor(Math.random() * Neighbors.all.length)]
            let c = branch.loc_col+growth_direction[0];
            let r = branch.loc_row+growth_direction[1];
            if (this.anatomy.canAddCellAt(c, r)){
                added = true;
                this.anatomy.addRandomizedCell(state, c, r);
            }
        }
        if (this.calcRandomChance(Hyperparams.changeProb)){
            let cell = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType();
            this.anatomy.replaceCell(state, cell.loc_col, cell.loc_row);
            changed = true;
        }
        if (this.calcRandomChance(Hyperparams.removeProb)){
            if(this.anatomy.cells.length > 1) {
                let cell = this.anatomy.getRandomCell();
                removed = this.anatomy.removeCell(cell.loc_col, cell.loc_row);
            }
        }
        return added || changed || removed;
    }

    calcRandomChance(prob) {
        return (Math.random() * 100) < prob;
    }

    attemptMove() {
        var direction = Directions.scalars[this.direction];
        var direction_c = direction[0];
        var direction_r = direction[1];
        var new_c = this.c + direction_c;
        var new_r = this.r + direction_r;
        if (this.isClear(new_c, new_r)) {
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.c = new_c;
            this.r = new_r;
            this.updateGrid();
            return true;
        }
        return false;
    }

    attemptRotate() {
        if(!this.can_rotate){
            this.direction = Directions.getRandomDirection();
            this.move_count = 0;
            return true;
        }
        var new_rotation = Directions.getRandomDirection();
        if(this.isClear(this.c, this.r, new_rotation)){
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.rotation = new_rotation;
            this.direction = Directions.getRandomDirection();
            this.updateGrid();
            this.move_count = 0;
            return true;
        }
        return false;
    }

    changeDirection(dir) {
        this.direction = dir;
        this.move_count = 0;
    }

    // assumes either c1==c2 or r1==r2, returns true if there is a clear path from point 1 to 2
    isStraightPath(c1, r1, c2, r2, parent){
        if (c1 == c2) {
            if (r1 > r2){
                var temp = r2;
                r2 = r1;
                r1 = temp;
            }
            for (var i=r1; i!=r2; i++) {
                var cell = this.env.grid_map.cellAt(c1, i)
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
        else {
            if (c1 > c2){
                var temp = c2;
                c2 = c1;
                c1 = temp;
            }
            for (var i=c1; i!=c2; i++) {
                var cell = this.env.grid_map.cellAt(i, r1);
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
    }

    isPassableCell(cell, parent){
        return cell != null && (cell.state == CellStates.empty || cell.owner == this || cell.owner == parent || cell.state == CellStates.food);
    }

    isClear(col, row, rotation=this.rotation) {
        for(var loccell of this.anatomy.cells) {
            var cell = this.getRealCell(loccell, col, row, rotation);
            if (cell==null) {
                return false;
            }
            if (cell.owner==this || cell.state==CellStates.empty || (!Hyperparams.foodBlocksReproduction && cell.state==CellStates.food)){
                continue;
            }
            return false;
        }
        return true;
    }

    harm() {
        this.takeDamage(1);
    }

    takeDamage(amount) {
        this.damage += amount;
        if (this.damage >= this.maxHealth() || Hyperparams.instaKill) {
            this.die();
        }
    }

    heal() {
        if (this.damage > 0) {
            this.damage--;
        }
    }

    die() {
        this.living = false;
        var explosive_cells = [];
        for (var cell of this.anatomy.cells) {
            if (cell.state == CellStates.explosive) {
                explosive_cells.push(cell);
            }
        }
        for (var exp_cell of explosive_cells) {
            exp_cell.explode();
        }
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            var current_cell = this.env.grid_map.cellAt(real_c, real_r);
            if (current_cell && current_cell.owner === this) {
                this.env.changeCell(real_c, real_r, CellStates.food, null);
            }
        }
        this.species.decreasePop();
    }

    updateGrid() {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, cell.state, cell);
        }
    }

    shoot() {
        if (this.food_collected >= 2) {
            this.food_collected -= 2;
            var dir = Directions.scalars[this.direction];
            var spawn_c = this.c + dir[0];
            var spawn_r = this.r + dir[1];
            
            // push projectile to env
            if (this.env.active_projectiles !== undefined) {
                this.env.active_projectiles.push({
                    col: spawn_c,
                    row: spawn_r,
                    dir_col: dir[0],
                    dir_row: dir[1],
                    ticks: 0,
                    owner: this
                });
            }
        }
    }

    buildWall() {
        if (this.food_collected >= 5) {
            this.food_collected -= 5;
            // Opposite direction
            var op_dir = this.direction + 2;
            if (op_dir > 3) op_dir -= 4;
            var dir = Directions.scalars[op_dir];
            
            var target_c = this.c + dir[0];
            var target_r = this.r + dir[1];
            
            var target_cell = this.env.grid_map.cellAt(target_c, target_r);
            if (target_cell && target_cell.state === CellStates.empty) {
                this.env.changeCell(target_c, target_r, CellStates.wall, null);
            }
        }
    }

    emitPheromoneSignal(state_to_emit) {
        var max_dist = Hyperparams.lookRange * 2;
        for (var other_org of this.env.organisms) {
            if (other_org === this || !other_org.living) continue;
            if (other_org.species === this.species) {
                var dx = this.c - other_org.c;
                var dy = this.r - other_org.r;
                var dist = Math.abs(dx) + Math.abs(dy);
                if (dist <= max_dist) {
                    var best_dir = -1;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        best_dir = dx > 0 ? Directions.right : Directions.left;
                    } else {
                        best_dir = dy > 0 ? Directions.down : Directions.up;
                    }
                    var dummy_cell = { state: state_to_emit, owner: this };
                    var obs = new Observation(dummy_cell, dist, best_dir);
                    other_org.brain.observe(obs);
                }
            }
        }
    }

    update() {
        this.lifetime++;
        
        // Radiation check
        this.in_radiation = false;
        if (this.env.radiation_map && this.env.radiation_map.has(this.c + "," + this.r)) {
            this.in_radiation = true;
            if (this.lifetime % 20 === 0) {
                this.takeDamage(1);
                if (!this.living) return false;
            }
        }

        if (this.lifetime > this.lifespan()) {
            this.die();
            return this.living;
        }
        if (this.poison_ticks > 0) {
            this.poison_ticks--;
            this.harm();
            if (!this.living) return false;
        }
        if (this.damage > 0) {
            this.emitPheromoneSignal(CellStates.pheromone);
        }
        
        // Brain acts first to allow hibernation
        var changed_dir = false;
        this.hibernating = false; // Reset hibernation each tick
        if (this.anatomy.is_mover && this.ignore_brain_for == 0 && this.anatomy.has_eyes) {
            this.brain.updateState();
            changed_dir = this.brain.decide();
        }
        
        if (this.hibernating) {
            // Spend much less food while hibernating
            // Skip moving and cell functions
            return this.living;
        }
        
        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }
        
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living)
                return this.living
        }
        
        if (this.anatomy.is_mover) {
            this.move_count++;
            if (this.ignore_brain_for > 0) {
                this.ignore_brain_for --;
            }
            var moved = this.attemptMove();
            if ((this.move_count > this.move_range && !changed_dir) || !moved){
                var rotated = this.attemptRotate();
                if (!rotated) {
                    this.changeDirection(Directions.getRandomDirection());
                    if (changed_dir)
                        this.ignore_brain_for = this.move_range + 1;
                }
            }
        }
        return this.living;
    }

    getRealCell(local_cell, c=this.c, r=this.r, rotation=this.rotation){
        var real_c = c + local_cell.rotatedCol(rotation);
        var real_r = r + local_cell.rotatedRow(rotation);
        return this.env.grid_map.cellAt(real_c, real_r);
    }

    isNatural() {
        let found_center = false;
        if (this.anatomy.cells.length === 0) {
            return false;
        }
        for (let i=0; i<this.anatomy.cells.length; i++) {
            let cell = this.anatomy.cells[i];
            for (let j=i+1; j<this.anatomy.cells.length; j++) {
                let toCompare = this.anatomy.cells[j];
                if (cell.loc_col === toCompare.loc_col && cell.loc_row === toCompare.loc_row) {
                    return false;
                }
            }
            if (cell.loc_col === 0 && cell.loc_row === 0) {
                found_center = true;
            }
        }
        return found_center;
    }

    serialize() {
        let org = SerializeHelper.copyNonObjects(this);
        org.anatomy = this.anatomy.serialize();
        if (this.anatomy.is_mover && this.anatomy.has_eyes)
            org.brain = this.brain.serialize();
        org.species_name = this.species.name;
        return org;
    }

    loadRaw(org) {
        SerializeHelper.overwriteNonObjects(org, this);
        this.anatomy.loadRaw(org.anatomy)
        if (org.brain)
            this.brain.load(org.brain)
    }

}

export default Organism;
