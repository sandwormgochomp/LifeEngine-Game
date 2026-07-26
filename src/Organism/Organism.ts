import CellStates from "./Cell/CellStates";
import type { CellState } from "./Cell/CellStates";
import Neighbors from "../Grid/Neighbors";
import Hyperparams from "../Hyperparameters";
import type { HyperparamsData } from "../Hyperparameters";
import Directions from "./Directions";
import type { Direction } from "./Directions";
import Anatomy from "./Anatomy";
import type { SerializedAnatomy } from "./Anatomy";
import Brain from "./Perception/Brain";
import type { BrainState } from "./Perception/Brain";
import FossilRecord from "../Stats/FossilRecord";
import Perf from "../Stats/Perf";
import type { PerfLike } from "../Stats/Perf";
import SerializeHelper from "../Utils/SerializeHelper";
import Observation from "./Perception/Observation";
import type BodyCell from "./Cell/BodyCells/BodyCell";
import type ExplosiveCell from "./Cell/BodyCells/ExplosiveCell";
import type Species from "../Stats/Species";
import type { OrganismSpriteSet } from "../Rendering/DecorationRenderer";
import type { Blast } from "../Rendering/ExplosionFx";

/* The grid as Organism and the body cells reach through it. Structural rather
   than a real GridMap import, for the same reason BodyCell.ts describes its
   organism structurally: OrganismEditor is passed here too.
 *
 * All scalar, all allocation-free. The grid stores typed arrays and builds a
 * cell object only when asked (GridMap.cellAt), and the per-cell simulation
 * loops -- which run once per body cell per organism per tick -- are exactly
 * where that object must not be built. Coordinate-taking accessors answer for
 * an off-grid location (null, or -1); the -Of accessors take an index that
 * indexAt has already vouched for.
 *
 * `owner` is renarrowed to the real Organism, and `cell_owner` to BodyCell,
 * from the wider render-facing shapes GridMap declares. Both narrowings are
 * sound -- those are the only values the engine ever stores -- and they are
 * what lets this file call die()/harm() on what it reads back. */
export interface OrganismGrid {
    indexAt(col: number, row: number): number;
    stateAt(col: number, row: number): CellState | null;
    ownerAt(col: number, row: number): Organism | null;
    foodAdjAt(col: number, row: number): number;
    stateOf(idx: number): CellState;
    ownerOf(idx: number): Organism | null;
    cellOwnerOf(idx: number): BodyCell | null;
    colOf(idx: number): number;
    rowOf(idx: number): number;
    /* Take hit points off a wall; true when it is spent. Used by the cells
       that chip at walls (killer, explosive). */
    damageWall(idx: number, amount: number): boolean;
}

/* Queued by shoot() and stepped by WorldEnvironment. */
export interface OrganismProjectile {
    col: number;
    row: number;
    dir_col: number;
    dir_row: number;
    ticks: number;
    owner: Organism;
}

/* The environment an Organism lives in. Deliberately structural rather than
   `WorldEnvironment`: OrganismEditor is also passed here, and it implements
   only grid_map and changeCell because its organism is never ticked. Naming the
   concrete class would make the editor's partial implementation a type error
   instead of the documented invariant it actually is. */
export interface OrganismEnv {
    grid_map: OrganismGrid;
    /* The fourth argument is a *cell* owner, not an organism: GridMap.setCellOwner
       stores it as cell_owner and derives GridCell.owner from cell_owner.org.
       updateGrid() passes a BodyCell, every other call site passes null. This
       used to also admit BodyCellOrganism -- a shape no call site ever produced
       -- purely to stay assignable to BodyCell.ts's hand-written mirror of this
       class. That mirror is now an alias for Organism itself, so the union has
       shrunk to what the code actually passes. */
    changeCell(c: number, r: number, state: CellState, owner: BodyCell | null): void;
    organisms: Organism[];
    canAddOrganism(): boolean;
    addOrganism(organism: Organism): void;
    /* Absent on OrganismEditor, which never ticks its organism; shoot() probes
       for it explicitly. */
    active_projectiles?: OrganismProjectile[];
    /* Keys are "col,row". Absent on OrganismEditor; update() guards on it. */
    radiation_map?: Set<string>;
    /* Not touched by Organism itself -- declared because the body cells reach
       through this same env object (see BodyCellOrganism in BodyCell.ts). */
    active_explosions: { col: number; row: number; ticks: number }[];
    /* Charges armed by die(), burning down to a detonation a few ticks later;
       stepped by EnvironmentEffects.stepBlasts and drawn by ExplosionFx. */
    active_blasts: Blast[];
    is_night: boolean;
    /* Unimplemented feature marker: no environment in the codebase defines this
       method, so the `typeof === 'function'` guard in die() is always false and
       the call never executes. Declared optional to keep that in-progress call
       site intact and type-checking. */
    addDeathEffect?(org: Organism): void;
    /* Spatial index query for pheromone broadcasts. Optional because
       OrganismEditor lacks it -- but the editor never ticks its organism, so
       emitPheromoneSignal's fallback to the flat list is for the checker, not
       a path that runs. */
    getOrganismsNear?(c: number, r: number, radius: number): Organism[][];
    /* The tunable parameters an organism reads while ticking. Optional: the
       world and editor leave it unset, so their organisms fall back to the
       global Hyperparams singleton (see the constructor). PreviewEnvironment
       supplies a private defaults object instead, so a hover preview shows
       canonical behaviour regardless of the player's Evolution Controls. */
    hyperparams?: HyperparamsData;
    /* The profiler an organism records into while ticking. Optional: the world
       and editor leave it unset, so their organisms use the global Perf
       singleton. PreviewEnvironment injects a no-op sink so preview ticks never
       land in the real world's perf-panel buckets. */
    perf?: PerfLike;
    /* Lineage-tracking hooks (follow-a-lineage). Optional because only
       WorldEnvironment implements them: reproduce() and die() are also run by
       the editor and the Lab preview's mini-sim, and leaving the hooks off
       those environments is what keeps preview births/deaths out of the
       tracker -- the same gating argument Narrator makes, applied at the env
       seam instead of the sampling cadence, because a birth hook needs the
       parent and only reproduce() still knows it. */
    onOrganismBorn?(parent: Organism, child: Organism): void;
    onOrganismDied?(org: Organism): void;
}

export interface SerializedBrain {
    states: BrainState[];
}

/* Save format: whatever SerializeHelper.copyNonObjects leaves of an Organism --
   every non-object own property -- plus the three nested values serialize()
   attaches by hand. `brain` is only written for organisms that are movers with
   eyes, and `in_radiation` only exists once update() has run at least once,
   hence both optional. The index signature is what lets loadRaw's reflective
   overwriteNonObjects walk this shape. */
export interface SerializedOrganism {
    c: number;
    r: number;
    lifetime: number;
    food_collected: number;
    living: boolean;
    direction: number;
    rotation: number;
    can_rotate: boolean;
    move_count: number;
    move_range: number;
    ignore_brain_for: number;
    mutability: number;
    damage: number;
    poison_ticks: number;
    poison_duration: number;
    healer_food_cost: number;
    brain_triggered_heal: boolean;
    hibernating: boolean;
    in_radiation?: boolean;
    anatomy: SerializedAnatomy;
    brain?: SerializedBrain;
    species_name: string;
    [key: string]: unknown;
}

class Organism {
    /* No initializers anywhere below: useDefineForClassFields is false and these
       must stay bare declarations, so that the constructor assignments remain
       the only writes. */
    c: number;
    r: number;
    env: OrganismEnv;
    /* Resolved once in the constructor: the env's injected params, or the global
       Hyperparams singleton when it supplies none. Every per-tick parameter read
       below goes through this so an injected copy (PreviewEnvironment's defaults)
       stays fully local to that organism. */
    hyperparams: HyperparamsData;
    /* Resolved once in the constructor: the env's injected profiler, or the
       global Perf singleton when it supplies none. update()'s probes go through
       this so a preview organism records into a no-op sink instead. */
    perf: PerfLike;
    lifetime: number;
    food_collected: number;
    living: boolean;
    anatomy: Anatomy;
    direction: number;
    /* One of the four cardinal directions rather than an arbitrary number, so
       that the defaultless switches in BodyCell.rotatedCol/rotatedRow are
       exhaustive over it and cannot return undefined. SerializedOrganism keeps
       this as a plain `number`, since a save file can hold anything. */
    rotation: Direction;
    can_rotate: boolean;
    move_count: number;
    move_range: number;
    ignore_brain_for: number;
    mutability: number;
    damage: number;
    poison_ticks: number;
    poison_duration: number;
    healer_food_cost: number;
    brain: Brain;
    brain_triggered_heal: boolean;
    hibernating: boolean;
    /* Genuinely absent for a real window: the constructor never assigns it.
       inherit() copies the parent's, FossilRecord.addSpecies and the editor /
       WorldEnvironment.loadRaw assign it from outside, but an organism built
       without a parent has no species until one of those runs -- and reproduce(),
       die() and serialize() all dereference it unguarded. `| undefined` rather
       than a definite-assignment `!` so that window stays visible. */
    species: Species | undefined;
    /* Assigned at the top of update(); reproduce() reads it (in boolean
       position) and can be reached before any update() has run. */
    in_radiation: boolean | undefined;
    /* Written from outside this class: DecorationRenderer.drawOrganismDecorations
       caches each organism's pre-rendered sprites here (commit 1814294), one
       slot per rotation. Nothing in Organism reads it -- do not delete it as
       dead. */
    _spriteCache?: OrganismSpriteSet | null;

    constructor(col: number, row: number, env: OrganismEnv, parent: Organism | null = null) {
        this.c = col;
        this.r = row;
        this.env = env;
        this.hyperparams = env.hyperparams ?? Hyperparams;
        this.perf = env.perf ?? Perf;
        this.lifetime = 0;
        this.food_collected = 0;
        this.living = true;
        this.anatomy = new Anatomy(this)
        this.direction = Directions.down; // direction of movement
        this.rotation = Directions.up; // direction of rotation
        this.can_rotate = this.hyperparams.rotationEnabled;
        this.move_count = 0;
        this.move_range = 4;
        this.ignore_brain_for = 0;
        this.mutability = 5;
        this.damage = 0;
        this.poison_ticks = 0;
        this.poison_duration = 10;
        this.healer_food_cost = this.hyperparams.healerFoodCost;
        this.brain = new Brain(this);
        this.brain_triggered_heal = false;
        this.hibernating = false;
        if (parent != null) {
            this.inherit(parent);
        }
    }

    inherit(parent: Organism): void {
        this.move_range = parent.move_range;
        this.mutability = parent.mutability;
        this.healer_food_cost = parent.healer_food_cost;
        this.poison_duration = parent.poison_duration;
        this.species = parent.species;
        for (var c of parent.anatomy.cells){
            //deep copy parent cells
            if (c.state === CellStates.pheromone) {
                /* Duck-typed stand-in, not a BodyCell: createInherited only reads
                   state/loc_col/loc_row and hands it to initInherit, which copies
                   scalars off it. Same pattern as Anatomy.loadRaw. */
                let dummy_c = { state: CellStates.common, loc_col: c.loc_col, loc_row: c.loc_row, custom_color: c.custom_color };
                this.anatomy.addInheritCell(dummy_c as unknown as BodyCell, false);
            } else {
                this.anatomy.addInheritCell(c, false);
            }
        }
        this.anatomy.checkTypeChange();
        if(parent.anatomy.is_mover && parent.anatomy.has_eyes) {
            this.brain.copy(parent.brain);
        }
    }

    // amount of food required before it can reproduce
    foodNeeded(): number {
        return this.anatomy.is_mover ? this.anatomy.cells.length + this.hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
    }

    lifespan(): number {
        return this.anatomy.cells.length * this.hyperparams.lifespanMultiplier;
    }

    maxHealth(): number {
        return this.anatomy.cells.length;
    }

    reproduce(): void {
        //produce mutated child
        //check nearby locations (is there room and a direct path)
        var org = new Organism(0, 0, this.env, this);
        if(this.hyperparams.rotationEnabled){
            org.rotation = Directions.getRandomDirection();
        }
        var prob = this.mutability;
        if (this.hyperparams.useGlobalMutability){
            prob = this.hyperparams.globalMutability;
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

        /* isClear takes three parameters; this call used to pass a fourth
           (`true`), which no version of isClear has ever read. Dropping it is a
           no-op -- JavaScript discards surplus arguments -- and it removes the
           only reason this call needed a cast. */
        if (org.isClear(new_c, new_r, org.rotation) &&
            org.isStraightPath(new_c, new_r, this.c, this.r, this) &&
            this.env.canAddOrganism())
        {
            org.c = new_c;
            org.r = new_r;
            this.env.addOrganism(org);
            org.updateGrid();
            if (mutated) {
                /* FossilRecord declares the ancestor as `Species | null`, but it
                   only forwards it to `new Species(...)`, whose own ancestor
                   field is `Species | null | undefined`. The cast reconciles the
                   two without touching the value passed. */
                FossilRecord.addSpecies(org, this.species as Species | null);
            }
            else {
                /* Copied from this organism by inherit() during construction, and
                   `this` is in env.organisms, which only holds organisms that
                   were given a species before being published. Guarding instead
                   would silently skip population accounting, which corrupts
                   extinction detection -- worse than failing loudly. */
                org.species!.addPop();
            }
            this.env.onOrganismBorn?.(this, org);
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    mutate(): boolean {
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(this.hyperparams.addProb)) {
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
        if (this.calcRandomChance(this.hyperparams.changeProb)){
            let cell = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType();
            this.anatomy.replaceCell(state, cell.loc_col, cell.loc_row);
            changed = true;
        }
        if (this.calcRandomChance(this.hyperparams.removeProb)){
            if(this.anatomy.cells.length > 1) {
                let cell = this.anatomy.getRandomCell();
                removed = this.anatomy.removeCell(cell.loc_col, cell.loc_row);
            }
        }
        return added || changed || removed;
    }

    calcRandomChance(prob: number): boolean {
        return (Math.random() * 100) < prob;
    }

    attemptMove(): boolean {
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

    attemptRotate(): boolean {
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

    changeDirection(dir: number): void {
        this.direction = dir;
        this.move_count = 0;
    }

    // assumes either c1==c2 or r1==r2, returns true if there is a clear path from point 1 to 2
    isStraightPath(c1: number, r1: number, c2: number, r2: number, parent: Organism): boolean {
        if (c1 == c2) {
            if (r1 > r2){
                var temp = r2;
                r2 = r1;
                r1 = temp;
            }
            for (var i=r1; i!=r2; i++) {
                if (!this.isPassableCell(c1, i, parent)){
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
                if (!this.isPassableCell(i, r1, parent)){
                    return false;
                }
            }
            return true;
        }
    }

    isPassableCell(col: number, row: number, parent: Organism): boolean {
        var grid = this.env.grid_map;
        var idx = grid.indexAt(col, row);
        if (idx < 0)
            return false;
        var state = grid.stateOf(idx);
        var owner = grid.ownerOf(idx);
        return state == CellStates.empty || owner == this || owner == parent || state == CellStates.food;
    }

    isClear(col: number, row: number, rotation: Direction = this.rotation): boolean {
        var grid = this.env.grid_map;
        for(var loccell of this.anatomy.cells) {
            var idx = grid.indexAt(col + loccell.rotatedCol(rotation), row + loccell.rotatedRow(rotation));
            if (idx < 0) {
                return false;
            }
            var state = grid.stateOf(idx);
            if (grid.ownerOf(idx)==this || state==CellStates.empty || (!this.hyperparams.foodBlocksReproduction && state==CellStates.food)){
                continue;
            }
            return false;
        }
        return true;
    }

    harm(): void {
        this.takeDamage(1);
    }

    takeDamage(amount: number): void {
        this.damage += amount;
        if (this.damage >= this.maxHealth() || this.hyperparams.instaKill) {
            this.die();
        }
    }

    heal(): void {
        if (this.damage > 0) {
            this.damage--;
        }
    }

    die(): void {
        this.living = false;
        if (this.env && typeof this.env.addDeathEffect === 'function') {
            this.env.addDeathEffect(this);
        }
        /* Only cells whose state is explosive land in here, and those are always
           ExplosiveCell instances -- the downcast is what the state check above
           already guarantees. */
        var explosive_cells: ExplosiveCell[] = [];
        for (var cell of this.anatomy.cells) {
            if (cell.state == CellStates.explosive) {
                explosive_cells.push(cell as ExplosiveCell);
            }
        }
        /* Charges are armed, not fired: each one detonates a few ticks later
           (EnvironmentEffects.stepBlasts), which is the fuse the telegraph
           blinks over. The footprint is captured once here and shared by every
           charge in this body -- a predator bomber carries three -- so a death
           allocates one array however many it holds, and none at all for the
           overwhelming majority of organisms, which carry no explosive at all. */
        if (explosive_cells.length > 0) {
            var body: number[] = [];
            for (var cell of this.anatomy.cells) {
                body.push(this.c + cell.rotatedCol(this.rotation), this.r + cell.rotatedRow(this.rotation));
            }
            for (var exp_cell of explosive_cells) {
                exp_cell.arm(body);
            }
        }
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            if (this.env.grid_map.ownerAt(real_c, real_r) === this) {
                this.env.changeCell(real_c, real_r, CellStates.food, null);
            }
        }
        /* Same invariant as reproduce(): die() is only reachable for organisms
           found through env.organisms or a grid cell's owner, both of which
           only ever contain published organisms. A guard here would desync
           Species.population. */
        this.species!.decreasePop();
        this.env.onOrganismDied?.(this);
    }

    updateGrid(): void {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, cell.state, cell);
        }
    }

    shoot(): void {
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

    buildWall(): void {
        if (this.food_collected >= 5) {
            this.food_collected -= 5;
            // Opposite direction
            var op_dir = this.direction + 2;
            if (op_dir > 3) op_dir -= 4;
            var dir = Directions.scalars[op_dir];

            var target_c = this.c + dir[0];
            var target_r = this.r + dir[1];

            if (this.env.grid_map.stateAt(target_c, target_r) === CellStates.empty) {
                this.env.changeCell(target_c, target_r, CellStates.wall, null);
            }
        }
    }

    emitPheromoneSignal(state_to_emit: CellState): void {
        var max_dist = this.hyperparams.lookRange * 2;
        /* Only the 3x3 block of index buckets around this organism can hold
           anything within max_dist; the flat all-organisms scan this replaces
           made a busy world's damage ticks scale with population squared. */
        var groups = this.env.getOrganismsNear
            ? this.env.getOrganismsNear(this.c, this.r, max_dist)
            : [this.env.organisms];
        for (var group of groups)
        for (var other_org of group) {
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
                    var obs = new Observation(state_to_emit, this, dist, best_dir);
                    other_org.brain.observe(obs);
                }
            }
        }
    }

    update(): boolean {
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
            /* Own bucket: this scans every organism in the world per damaged
               organism per tick, so it is the one section whose cost can grow
               with population squared -- it has to be separable from the rest
               of the organism loop to justify (or acquit) a spatial index. */
            var t = this.perf.begin();
            this.emitPheromoneSignal(CellStates.pheromone);
            this.perf.end('pheromone', t);
        }

        // Brain acts first to allow hibernation
        var changed_dir = false;
        this.hibernating = false; // Reset hibernation each tick
        if (this.anatomy.is_mover && this.ignore_brain_for == 0 && this.anatomy.has_eyes) {
            this.brain.updateState();
            changed_dir = this.brain.decide();
            /* decide() is the one call in this method that can kill its own
               organism: an `explode` action runs die() outright (Brain.decide),
               which is how a Cinderpod detonates. Without this guard the corpse
               fell straight through to reproduce() below and bred -- calling
               addPop() on the species die() had just fossilized, which left a
               species flagged extinct, absent from FossilRecord.extant_species,
               and carrying a living member. It also let the first cell in the
               loop further down run its function post mortem; that loop's own
               guard is checked after the call, not before it. */
            if (!this.living) return false;
        }

        if (this.hibernating) {
            // Spend much less food while hibernating
            // Skip moving and cell functions
            return this.living;
        }

        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }

        /* These spans accumulate across every organism this tick; Perf.commit()
           at the end of the engine tick folds them into one sample each. */
        var t_cells = this.perf.begin();
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living) {
                this.perf.end('org_cells', t_cells);
                return this.living;
            }
        }
        this.perf.end('org_cells', t_cells);

        if (this.anatomy.is_mover) {
            var t_move = this.perf.begin();
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
            this.perf.end('org_move', t_move);
        }
        return this.living;
    }

    /* The grid index this body cell currently occupies, or -1 if the organism
       hangs off the edge of the world. Callers that want the cell's contents
       ask the grid for the one field they need; the renderer, which is the
       only caller that wants pixels, asks for x/y off the same index. */
    getRealCellIndex(local_cell: BodyCell, c: number = this.c, r: number = this.r, rotation: Direction = this.rotation): number {
        var real_c = c + local_cell.rotatedCol(rotation);
        var real_r = r + local_cell.rotatedRow(rotation);
        return this.env.grid_map.indexAt(real_c, real_r);
    }

    // An organism is natural if no two cells share a coordinate and one sits
    // at the center. Uses a key set rather than the pairwise scan it replaced:
    // the UI polls this, and O(n^2) froze the tab on 10k-cell organisms.
    isNatural(): boolean {
        if (this.anatomy.cells.length === 0) {
            return false;
        }
        let found_center = false;
        let seen = new Set<string>();
        for (let cell of this.anatomy.cells) {
            let key = cell.loc_col + ',' + cell.loc_row;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            if (cell.loc_col === 0 && cell.loc_row === 0) {
                found_center = true;
            }
        }
        return found_center;
    }

    serialize(): SerializedOrganism {
        /* copyNonObjects reflects over arbitrary keys, so it takes and returns
           Record<string, unknown>; the casts on either side are the join between
           that dynamic walk and the declared save shape. */
        let org = SerializeHelper.copyNonObjects(this as unknown as Record<string, unknown>) as SerializedOrganism;
        org.anatomy = this.anatomy.serialize();
        if (this.anatomy.is_mover && this.anatomy.has_eyes)
            org.brain = this.brain.serialize();
        /* Serialised organisms are either the world's (published, so they have
           a species) or the editor's (seeded by setDefaultOrg from the editor's
           constructor). Guarding would emit a save with no species_name, which
           WorldEnvironment.loadRaw cannot recover from. */
        org.species_name = this.species!.name;
        return org;
    }

    loadRaw(org: unknown): void {
        /* Asserted, not runtime-checked: the JS did no validation either and
           adding a guard here would change behavior on malformed saves. */
        let raw = org as SerializedOrganism;
        SerializeHelper.overwriteNonObjects(raw, this as unknown as Record<string, unknown>);
        this.anatomy.loadRaw(raw.anatomy)
        if (raw.brain)
            this.brain.load(raw.brain)
    }

}

export default Organism;
