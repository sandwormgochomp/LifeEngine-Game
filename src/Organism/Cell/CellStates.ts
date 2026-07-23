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
        drawOrgCellPatch(ctx, computeOrgCellPatch(this, cell, size, env));
    }
}

/* An organism body cell reduced to plain paint data. Renderer.renderCells
   batches the dirty set by paint phase (all backdrops, then bodies grouped by
   color, then corner erases, then dots) so the canvas sees long runs of the
   same fillStyle instead of five switches per cell; renderOrganismCell above
   draws one patch alone through the same helpers, so both paths paint
   identical pixels from this single computation. */
export interface OrgCellPatch {
    x: number;
    y: number;
    sz: number;
    color: string;   // body fill: the owner's custom color or the state color
    corner: number;  // erased-corner square size in px
    corners: number; // erase mask: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right
    dot: boolean;    // highlight dot, only on larger cells
}

export const ORG_CELL_DOT_STYLE = 'rgba(255, 255, 255, 0.25)';

export function emptyBackdropColor(): string {
    return (CellStates.empty && CellStates.empty.color) || '#05050A';
}

export function computeOrgCellPatch(state: CellState, cell: RenderCellLike, size: number, env?: RenderEnvLike): OrgCellPatch {
    var x = Math.floor(cell.x);
    var y = Math.floor(cell.y);
    var sz = Math.floor(size);

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

    // Outer corners are erased where NONE of the adjacent orthogonal or
    // diagonal cells belong to the same organism
    var c = sz >= 12 ? 3 : (sz >= 6 ? 2 : 1);
    var corners = 0;
    if (!hasN && !hasW && !hasNW) corners |= 1;
    if (!hasN && !hasE && !hasNE) corners |= 2;
    if (!hasS && !hasW && !hasSW) corners |= 4;
    if (!hasS && !hasE && !hasSE) corners |= 8;

    return {
        x, y, sz,
        color: (cell.cell_owner && cell.cell_owner.custom_color) || state.color,
        corner: c,
        corners,
        dot: sz >= 6,
    };
}

export function drawOrgCellCorners(ctx: CanvasRenderingContext2D, p: OrgCellPatch): void {
    if (p.corners & 1) ctx.fillRect(p.x, p.y, p.corner, p.corner);
    if (p.corners & 2) ctx.fillRect(p.x + p.sz - p.corner, p.y, p.corner, p.corner);
    if (p.corners & 4) ctx.fillRect(p.x, p.y + p.sz - p.corner, p.corner, p.corner);
    if (p.corners & 8) ctx.fillRect(p.x + p.sz - p.corner, p.y + p.sz - p.corner, p.corner, p.corner);
}

// Crisp pixel art highlight dot in top-left; caller sets ORG_CELL_DOT_STYLE
export function drawOrgCellDot(ctx: CanvasRenderingContext2D, p: OrgCellPatch): void {
    var hlSize = Math.max(1, Math.floor(p.sz * 0.2));
    var hlOffset = Math.max(1, Math.floor(p.sz * 0.22));
    ctx.fillRect(p.x + hlOffset, p.y + hlOffset, hlSize, hlSize);
}

// The single-cell path: same phases the batched passes run, one patch at a time
export function drawOrgCellPatch(ctx: CanvasRenderingContext2D, p: OrgCellPatch): void {
    // Wipe any cursor overlay / brush preview artifacts on this cell first
    ctx.fillStyle = emptyBackdropColor();
    ctx.fillRect(p.x, p.y, p.sz, p.sz);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.sz, p.sz);
    if (p.corners) {
        ctx.fillStyle = emptyBackdropColor();
        drawOrgCellCorners(ctx, p);
    }
    if (p.dot) {
        ctx.fillStyle = ORG_CELL_DOT_STYLE;
        drawOrgCellDot(ctx, p);
    }
}

/* The inherited CellState.render. Renderer's batching keys on it: a state
   whose render IS this function draws either a flat rect or an organism
   patch, both batchable; a state that overrides it (Food, Eye, the walls'
   glass) must go through its own renderer. */
export const BASE_CELL_RENDER = CellState.prototype.render;

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
        // 16-bit retro pixel-art glass dish -- cool ice-blue shading with
        // dithered band transitions and specular light on BOTH edges (glass
        // catches light on the shadow side too, which is what sells it).
        if (cell.dish_glass) {
            var tier = cell.dish_tier || 0;
            // Checker dither nudges each cell's light up or down so the shade
            // bands around the ring break up into chunky 16-bit dithering
            // instead of hard color seams.
            var dither = ((cell.col || 0) + (cell.row || 0)) % 2 === 0;
            var light = (cell.dish_light || 0) + (dither ? 0.07 : -0.07);

            if (tier === 1) {
                // Inner Glass Lip -- pale refracted edge where glass meets the dish floor
                ctx.fillStyle = light > 0.35 ? '#8FD0DA' : (light > -0.35 ? '#33616E' : '#16303A');
            } else if (tier === 2) {
                // Main Glass Rim -- the glass body, near-white where the light hits
                ctx.fillStyle = light > 0.35 ? '#D9F6FA' : (light > -0.35 ? '#57A0B0' : '#204955');
            } else if (tier === 3) {
                // Outer Shadow Rim
                ctx.fillStyle = light > 0.35 ? '#2E5560' : (light > -0.35 ? '#11282F' : '#070F13');
            } else {
                // Outer Void
                ctx.fillStyle = '#05050A';
            }
            ctx.fillRect(cell.x, cell.y, size, size);

            if (tier === 2 && size >= 4) {
                // Pixel specular highlight corner on the lit (top-left) side of the rim
                if (light > 0.6) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                    ctx.fillRect(cell.x, cell.y, Math.max(1, Math.floor(size * 0.35)), Math.max(1, Math.floor(size * 0.35)));
                }
                // Faint rim-light on the shadow (bottom-right) side
                if (light < -0.7) {
                    var rl = Math.max(1, Math.floor(size * 0.3));
                    ctx.fillStyle = 'rgba(190, 230, 240, 0.35)';
                    ctx.fillRect(cell.x + size - rl, cell.y + size - rl, rl, rl);
                }
            }
            return;
        }

        // Painted "Glass" walls: translucent pixel-art panes instead of a flat
        // slab. Every layer repaints from the opaque backdrop first, so dirty-
        // cell re-renders never accumulate alpha. Self-contained per cell (no
        // neighbor reads) so a cell never goes stale when the brush paints or
        // erases next to it.
        var x = Math.floor(cell.x);
        var y = Math.floor(cell.y);
        var sz = Math.floor(size);
        if (sz <= 3) {
            ctx.fillStyle = '#5E93A3';
            ctx.fillRect(x, y, sz, sz);
            return;
        }
        // World background showing through the pane
        ctx.fillStyle = (CellStates.empty && CellStates.empty.color) || '#05050A';
        ctx.fillRect(x, y, sz, sz);
        ctx.fillStyle = 'rgba(126, 195, 214, 0.30)';
        ctx.fillRect(x, y, sz, sz);

        var px = Math.max(1, Math.floor(sz / 6)); // pixel-art unit
        // Lit top & left edges, shaded bottom & right edges
        ctx.fillStyle = 'rgba(215, 243, 250, 0.55)';
        ctx.fillRect(x, y, sz, px);
        ctx.fillRect(x, y, px, sz);
        ctx.fillStyle = 'rgba(8, 24, 32, 0.55)';
        ctx.fillRect(x, y + sz - px, sz, px);
        ctx.fillRect(x + sz - px, y, px, sz);

        // Stepped diagonal shine streak, top-right toward bottom-left
        if (sz >= 6) {
            ctx.fillStyle = 'rgba(235, 250, 253, 0.5)';
            var steps = Math.floor(sz / px);
            for (var i = 0; i < steps; i++) {
                var sx = x + sz - px * (i + 2);
                var sy = y + px * (i + 1);
                if (sx >= x + px && sy <= y + sz - px * 2)
                    ctx.fillRect(sx, sy, px, px);
            }
        }
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
