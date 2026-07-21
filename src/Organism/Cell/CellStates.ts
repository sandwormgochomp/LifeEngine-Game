/* The names of every cell state. These strings are the join between the two
   parallel cell hierarchies -- CellState (identity and rendering, here) and
   BodyCell (behaviour, in ./BodyCells) -- which BodyCellFactory bridges by
   keying a constructor map on them. They are also persisted in saved worlds,
   so they are part of the save format and cannot be renamed freely. */
export type CellName =
    | 'empty' | 'food' | 'wall' | 'mouth' | 'producer' | 'mover' | 'killer'
    | 'armor' | 'eye' | 'healer' | 'explosive' | 'explosion' | 'invincible_wall'
    | 'poison' | 'pheromone' | 'common' | 'parasite' | 'chameleon' | 'shooter';

/* The subset an organism can actually be built from: everything except the
   environmental states (empty/food/wall/explosion/invincible_wall). Only these
   have a corresponding BodyCell class, so keeping them a distinct type is what
   lets BodyCellFactory's map be exhaustive instead of partial. */
export type LivingCellName =
    | 'mouth' | 'producer' | 'mover' | 'killer' | 'armor' | 'eye' | 'healer'
    | 'explosive' | 'poison' | 'pheromone' | 'common' | 'parasite'
    | 'chameleon' | 'shooter';

/* Structural shapes for what render() reaches through, rather than importing
   GridCell / BodyCell / Organism. Those sit above this file in the dependency
   order and importing them would knot the graph for no benefit -- rendering
   only ever touches these few members, and the real classes satisfy these
   shapes structurally once they are converted. */
export interface RenderOrganismLike {
    anatomy?: { getLocalCell(col: number, row: number): unknown } | null;
}

export interface RenderCellOwnerLike {
    custom_color?: string | null;
    org?: RenderOrganismLike | null;
    loc_col: number;
    loc_row: number;
    getAbsoluteDirection(): number;
}

export interface RenderCellLike {
    x: number;
    y: number;
    col?: number;
    row?: number;
    owner?: RenderOrganismLike | null;
    cell_owner?: RenderCellOwnerLike | null;
    /* Bolted on by WorldEnvironment.buildPetriDish for the dish rim, and read
       back by InvincibleWall.render. */
    dish_glass?: boolean;
    dish_tier?: number;
    dish_light?: number;
}

export interface RenderEnvLike {
    grid_map?: { cellAt(col: number, row: number): RenderCellLike | null } | null;
}

/* Generic over its own name so that a CellState<LivingCellName> proves, in the
   type system, that its .name is a valid BodyCellFactory key. */
class CellState<N extends CellName = CellName> {
    name: N;
    color: string;

    constructor(name: N) {
        this.name = name;
        this.color = 'black';
    }

    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number, env?: RenderEnvLike): void {
        if (cell.cell_owner && cell.cell_owner.custom_color) {
            ctx.fillStyle = cell.cell_owner.custom_color;
        } else {
            ctx.fillStyle = this.color;
        }

        if (size > 2 && (cell.owner || cell.cell_owner)) {
            this.renderOrganismCell(ctx, cell, size, env);
        } else {
            ctx.fillRect(cell.x, cell.y, size, size);
        }
    }

    renderOrganismCell(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number, env?: RenderEnvLike): void {
        var x = Math.floor(cell.x);
        var y = Math.floor(cell.y);
        var sz = Math.floor(size);

        // Wipe any cursor overlay / brush preview artifacts on this cell first
        ctx.fillStyle = (CellStates.empty && CellStates.empty.color) || '#05050A';
        ctx.fillRect(x, y, sz, sz);

        var org = cell.owner || (cell.cell_owner ? cell.cell_owner.org : null);
        var hasN = false, hasS = false, hasE = false, hasW = false;
        var hasNW = false, hasNE = false, hasSW = false, hasSE = false;

        if (env && env.grid_map && cell.col !== undefined && cell.row !== undefined) {
            var grid_map = env.grid_map;
            var col = cell.col, row = cell.row;
            var isSameOrg = function(c: number, r: number): boolean {
                var target = grid_map.cellAt(c, r);
                return Boolean(target && (target.owner === org || (target.cell_owner && target.cell_owner.org === org)));
            };
            hasN  = isSameOrg(col, row - 1);
            hasS  = isSameOrg(col, row + 1);
            hasE  = isSameOrg(col + 1, row);
            hasW  = isSameOrg(col - 1, row);
            hasNW = isSameOrg(col - 1, row - 1);
            hasNE = isSameOrg(col + 1, row - 1);
            hasSW = isSameOrg(col - 1, row + 1);
            hasSE = isSameOrg(col + 1, row + 1);
        } else if (cell.cell_owner && org && org.anatomy) {
            var anatomy = org.anatomy;
            var lc = cell.cell_owner.loc_col, lr = cell.cell_owner.loc_row;
            hasN  = Boolean(anatomy.getLocalCell(lc, lr - 1));
            hasS  = Boolean(anatomy.getLocalCell(lc, lr + 1));
            hasE  = Boolean(anatomy.getLocalCell(lc + 1, lr));
            hasW  = Boolean(anatomy.getLocalCell(lc - 1, lr));
            hasNW = Boolean(anatomy.getLocalCell(lc - 1, lr - 1));
            hasNE = Boolean(anatomy.getLocalCell(lc + 1, lr - 1));
            hasSW = Boolean(anatomy.getLocalCell(lc - 1, lr + 1));
            hasSE = Boolean(anatomy.getLocalCell(lc + 1, lr + 1));
        }

        // Fill solid cell body for the organism
        if (cell.cell_owner && cell.cell_owner.custom_color) {
            ctx.fillStyle = cell.cell_owner.custom_color;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(x, y, sz, sz);

        ctx.fillStyle = (CellStates.empty && CellStates.empty.color) || '#05050A';

        // 2. Erase outer corners (where NONE of the adjacent orthogonal or diagonal cells belong to the same organism)
        var c = sz >= 12 ? 3 : (sz >= 6 ? 2 : 1);
        if (!hasN && !hasW && !hasNW) ctx.fillRect(x, y, c, c);                        // Top-Left outer corner
        if (!hasN && !hasE && !hasNE) ctx.fillRect(x + sz - c, y, c, c);                // Top-Right outer corner
        if (!hasS && !hasW && !hasSW) ctx.fillRect(x, y + sz - c, c, c);                // Bottom-Left outer corner
        if (!hasS && !hasE && !hasSE) ctx.fillRect(x + sz - c, y + sz - c, c, c);        // Bottom-Right outer corner

        // Restore cell color for highlight
        if (cell.cell_owner && cell.cell_owner.custom_color) {
            ctx.fillStyle = cell.cell_owner.custom_color;
        } else {
            ctx.fillStyle = this.color;
        }

        // Crisp pixel art highlight dot in top-left (only on larger cells)
        if (sz >= 6) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            var hlSize = Math.max(1, Math.floor(sz * 0.2));
            var hlOffset = Math.max(1, Math.floor(sz * 0.22));
            ctx.fillRect(x + hlOffset, y + hlOffset, hlSize, hlSize);
        }
    }
}

class Empty extends CellState<'empty'> {
    constructor() {
        super('empty');
        this.color = '#05050A';
    }
}
class Food extends CellState<'food'> {
    constructor() {
        super('food');
        this.color = '#34593C';
    }
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number): void {
        ctx.fillStyle = (CellStates.empty && CellStates.empty.color) || '#05050A';
        ctx.fillRect(cell.x, cell.y, size, size);
        ctx.fillStyle = this.color;
        if (size > 3) {
            ctx.beginPath();
            ctx.arc(cell.x + size / 2, cell.y + size / 2, (size / 2) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(cell.x, cell.y, size, size);
        }
    }
}
class Wall extends CellState<'wall'> {
    constructor() {
        super('wall');
    }
}
class Mouth extends CellState<'mouth'> {
    constructor() {
        super('mouth');
    }
}
class Producer extends CellState<'producer'> {
    constructor() {
        super('producer');
    }
}
class Mover extends CellState<'mover'> {
    constructor() {
        super('mover');
    }
}
class Killer extends CellState<'killer'> {
    constructor() {
        super('killer');
    }
}
class Armor extends CellState<'armor'> {
    constructor() {
        super('armor');
    }
}
class Healer extends CellState<'healer'> {
    constructor() {
        super('healer');
    }
}
class Explosive extends CellState<'explosive'> {
    constructor() {
        super('explosive');
    }
}
class Explosion extends CellState<'explosion'> {
    constructor() {
        super('explosion');
    }
}
class InvincibleWall extends CellState<'invincible_wall'> {
    constructor() {
        super('invincible_wall');
    }
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number): void {
        // Petri-dish glass (flagged by WorldEnvironment.buildPetriDish):
        // 16-bit retro pixel-art shaded glass dish with top-left specular highlights
        if (cell.dish_glass) {
            var tier = cell.dish_tier || 0;
            var light = cell.dish_light || 0;

            if (tier === 1) {
                // Inner Glass Lip
                ctx.fillStyle = light > 0.35 ? '#2A8570' : (light > -0.35 ? '#16423A' : '#0A201B');
            } else if (tier === 2) {
                // Main Glass Rim
                ctx.fillStyle = light > 0.35 ? '#52F0CB' : (light > -0.35 ? '#247867' : '#144238');
            } else if (tier === 3) {
                // Outer Shadow Rim
                ctx.fillStyle = light > 0.35 ? '#1C5247' : (light > -0.35 ? '#0E2E28' : '#071814');
            } else {
                // Outer Void
                ctx.fillStyle = '#05050A';
            }
            ctx.fillRect(cell.x, cell.y, size, size);

            // Add pixel specular highlight corner on the main rim at the top-left
            if (tier === 2 && light > 0.6 && size >= 4) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.fillRect(cell.x, cell.y, Math.max(1, Math.floor(size * 0.35)), Math.max(1, Math.floor(size * 0.35)));
            }
            return;
        }
        super.render(ctx, cell, size);
    }
}
class Eye extends CellState<'eye'> {
    slit_color: string;

    constructor() {
        super('eye');
        this.slit_color = 'black';
    }
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number, env?: RenderEnvLike): void {
        super.render(ctx, cell, size, env);
        if(size <= 1)
            return;
        var half = size/2;
        var x = -(size)/8
        var y = -half;
        var h = size/2 + size/4;
        var w = size/4;
        ctx.translate(cell.x+half, cell.y+half);
        ctx.rotate((cell.cell_owner!.getAbsoluteDirection() * 90) * Math.PI / 180);
        ctx.fillStyle = this.slit_color;
        ctx.fillRect(x, y, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

class Poison extends CellState<'poison'> {
    constructor() {
        super('poison');
    }
}

class Pheromone extends CellState<'pheromone'> {
    constructor() {
        super('pheromone');
        this.color = 'magenta';
    }
}

class Common extends CellState<'common'> {
    constructor() {
        super('common');
        this.color = 'gray'; // Grey default color
    }
}

class Parasite extends CellState<'parasite'> {
    constructor() {
        super('parasite');
        this.color = '#800080'; // Dark purple
    }
}

class Chameleon extends CellState<'chameleon'> {
    constructor() {
        super('chameleon');
        this.color = '#20b2aa'; // Light sea green
    }
}

class Shooter extends CellState<'shooter'> {
    constructor() {
        super('shooter');
        this.color = '#d2691e'; // Chocolate/Orange
    }
}

export interface CellStatesRegistry {
    empty: Empty;
    food: Food;
    wall: Wall;
    mouth: Mouth;
    producer: Producer;
    mover: Mover;
    killer: Killer;
    armor: Armor;
    eye: Eye;
    healer: Healer;
    explosive: Explosive;
    explosion: Explosion;
    invincible_wall: InvincibleWall;
    poison: Poison;
    pheromone: Pheromone;
    common: Common;
    parasite: Parasite;
    chameleon: Chameleon;
    shooter: Shooter;
    all: CellState[];
    living: CellState<LivingCellName>[];
    defineLists(): void;
    getRandomName(): CellName;
    getRandomLivingType(): CellState<LivingCellName>;
}

const CellStates: CellStatesRegistry = {
    empty: new Empty(),
    food: new Food(),
    wall: new Wall(),
    mouth: new Mouth(),
    producer: new Producer(),
    mover: new Mover(),
    killer: new Killer(),
    armor: new Armor(),
    eye: new Eye(),
    healer: new Healer(),
    explosive: new Explosive(),
    explosion: new Explosion(),
    invincible_wall: new InvincibleWall(),
    poison: new Poison(),
    pheromone: new Pheromone(),
    common: new Common(),
    parasite: new Parasite(),
    chameleon: new Chameleon(),
    shooter: new Shooter(),
    /* Seeded empty and filled by defineLists() immediately below. They were
       previously absent until that call; declaring them here is what lets the
       literal satisfy CellStatesRegistry, and nothing can observe the empty
       arrays because defineLists() runs at module evaluation. */
    all: [],
    living: [],
    defineLists() {
        this.all = [this.empty, this.food, this.wall, this.mouth, this.producer, this.mover, this.killer, this.armor, this.eye, this.healer, this.explosive, this.explosion, this.invincible_wall, this.poison, this.pheromone, this.common, this.parasite, this.chameleon, this.shooter]
        this.living = [this.mouth, this.producer, this.mover, this.killer, this.armor, this.eye, this.healer, this.explosive, this.poison, this.pheromone, this.common, this.parasite, this.chameleon, this.shooter];
    },
    getRandomName: function(): CellName {
        return this.all[Math.floor(Math.random() * this.all.length)].name;
    },
    getRandomLivingType: function(): CellState<LivingCellName> {
        return this.living[Math.floor(Math.random() * this.living.length)];
    }
}

CellStates.defineLists();

export { CellState };
export default CellStates;
