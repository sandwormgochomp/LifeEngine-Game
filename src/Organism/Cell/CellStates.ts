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
    dish_active?: boolean;
}

/* The neighbour probe computeOrgCellPatch needs, and nothing else. Scalar
   accessors rather than cellAt(): the grid stores its cells as typed arrays and
   only materializes a view object on demand, so asking it for eight neighbour
   objects to read one field off each would allocate eight throwaway views per
   organism cell drawn. GridMap satisfies this structurally. */
export interface RenderEnvLike {
    grid_map?: {
        indexAt(col: number, row: number): number;
        ownerOf(idx: number): RenderOrganismLike | null;
        cellOwnerOf(idx: number): RenderCellOwnerLike | null;
    } | null;
}

/* Generic over its own name so that a CellState<LivingCellName> proves, in the
   type system, that its .name is a valid BodyCellFactory key. */
class CellState<N extends CellName = CellName> {
    name: N;
    color: string;
    /* This state's index in CellStates.all, which is what the grid stores per
       cell (one byte instead of an eight-byte pointer). Assigned by
       defineLists(); -1 until then, and only for a state built outside the
       registry, which nothing does. `empty` must keep index 0 so that a
       freshly zeroed grid reads as empty without being written. */
    id: number;

    constructor(name: N) {
        this.name = name;
        this.color = 'black';
        this.id = -1;
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
            var i = grid_map.indexAt(c, r);
            if (i < 0) return false;
            if (grid_map.ownerOf(i) === org) return true;
            var co = grid_map.cellOwnerOf(i);
            return Boolean(co && co.org === org);
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
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number): void {
        if (cell.dish_active) {
            var light = cell.dish_light || 0;
            var dither = ((cell.col || 0) + (cell.row || 0)) % 2 === 0;
            if (light < 0) {
                // Deep navy shadow dithered into glass floor
                if (light < -0.3) {
                    ctx.fillStyle = dither ? '#020509' : '#040810';
                } else {
                    ctx.fillStyle = dither ? '#040810' : '#08121d';
                }
            } else if (light > 0.05) {
                // Opposing wall glow / caustics dithered into glass floor
                if (light > 0.15) {
                    ctx.fillStyle = dither ? '#0b242b' : '#091c24';
                } else {
                    ctx.fillStyle = dither ? '#091c24' : '#0a141d';
                }
            } else {
                // Translucent glass-floor dark blue
                ctx.fillStyle = '#0a141d';
            }
        } else {
            // Default canvas background color for rectangular worlds
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(cell.x, cell.y, size, size);
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
/* Scorched ground, for the couple of ticks a blast leaves it behind (see
   EnvironmentEffects.detonate). Drawn as burning embers rather than the flat
   yellow square it used to be: a checkerboard of hot and cooling pixels, keyed
   to the cell grid so neighbouring cells interlock into one crackling field
   instead of tiling identically. The same dither the dish glass and the
   organism sprites use -- no gradients, nothing that needs alpha. */
class Explosion extends CellState<'explosion'> {
    // Cooling ember tone under the state's own hot yellow.
    ember_color: string;

    constructor() {
        super('explosion');
        this.ember_color = '#FF6B00';
    }
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number): void {
        ctx.fillStyle = this.color;
        ctx.fillRect(cell.x, cell.y, size, size);
        if (size < 3) return;
        var px = Math.max(1, Math.floor(size / 3));
        var steps = Math.floor(size / px);
        // Parity carries the cell's own grid position, so the checker runs
        // unbroken across a whole blast rather than restarting per cell.
        var parity = ((cell.col || 0) + (cell.row || 0)) & 1;
        ctx.fillStyle = this.ember_color;
        for (var i = 0; i < steps; i++) {
            for (var j = 0; j < steps; j++) {
                if (((i + j + parity) & 1) === 0) continue;
                ctx.fillRect(cell.x + i * px, cell.y + j * px, px, px);
            }
        }
    }
}
class InvincibleWall extends CellState<'invincible_wall'> {
    constructor() {
        super('invincible_wall');
    }
    render(ctx: CanvasRenderingContext2D, cell: RenderCellLike, size: number): void {
        // Petri-dish glass (flagged by WorldEnvironment.buildPetriDish):
        // 16-bit retro pixel-art glass dish -- clean 3D slate-blue beveled bezel outer ring
        // with glowing ice-cyan inner lip, specular highlights, and shadow shading.
        if (cell.dish_glass) {
            var tier = cell.dish_tier || 0;
            var light = cell.dish_light || 0;
            var dither = ((cell.col || 0) + (cell.row || 0)) % 2 === 0;

            if (tier === 1) {
                // Inner Glass Lip -- glowing ice-cyan edge meeting the dish floor.
                if (light > 0.7) {
                    ctx.fillStyle = dither ? '#FFFFFF' : '#B2F7FF'; // spec highlight
                } else if (light > 0.3) {
                    ctx.fillStyle = dither ? '#B2F7FF' : '#1f959c'; // bright reflection
                } else if (light < -0.3) {
                    ctx.fillStyle = dither ? '#0e4a4e' : '#0c242b'; // dark refraction shadow
                } else {
                    ctx.fillStyle = dither ? '#1f959c' : '#0e4a4e'; // mid tone
                }
            } else if (tier === 2) {
                // Main Bezel Rim -- glowing bright cyan/light-blue
                if (light > 0.7) {
                    ctx.fillStyle = dither ? '#FFFFFF' : '#D9F6FA'; // highlight
                } else if (light > 0.3) {
                    ctx.fillStyle = dither ? '#D9F6FA' : '#8FD0DA'; // light cyan
                } else if (light < -0.3) {
                    ctx.fillStyle = dither ? '#33616E' : '#2d5663'; // shadow
                } else {
                    ctx.fillStyle = dither ? '#8FD0DA' : '#33616E'; // mid tone cyan
                }
            } else if (tier === 3) {
                // Outer Bezel Frame -- dark steel outer frame sloping into the void
                if (light > 0.7) {
                    ctx.fillStyle = dither ? '#A9C5DE' : '#4E7092'; // steel highlight
                } else if (light > 0.3) {
                    ctx.fillStyle = dither ? '#4E7092' : '#23374A'; // mid steel
                } else if (light < -0.3) {
                    ctx.fillStyle = dither ? '#14202B' : '#1c2d3d'; // deep steel shadow
                } else {
                    ctx.fillStyle = dither ? '#23374A' : '#14202B'; // steel shadow
                }
            } else {
                // Outer Void
                ctx.fillStyle = '#05050A';
            }
            ctx.fillRect(cell.x, cell.y, size, size);
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
        /* `all` doubles as the grid's id -> state table (GridMap stores the id).
           `empty` first is load-bearing: a zeroed Uint8Array must read as an
           empty grid. Nothing persists an id, so the order is free to change
           as long as empty stays at 0. */
        for (var i = 0; i < this.all.length; i++)
            this.all[i].id = i;
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
