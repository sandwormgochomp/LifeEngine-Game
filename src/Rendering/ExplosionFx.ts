/* The look of an organism detonating: the fuse blink, the flash frame, the
   dithered fireball, the shockwave ring and the debris.

   Everything here is drawn in *world pixels* onto whatever context the caller
   hands over -- the world canvas for WorldEnvironment (immediate mode, over
   cells it repaints next frame via markFxBounds), the preview canvas for the
   Organism Lab (which repaints in full every frame anyway). One module so the
   world and the Lab cannot drift, the same reason EnvironmentEffects exists.

   Two rules the art follows, both of which the rest of the game already keeps:
   every mark is an axis-aligned fillRect on integer pixels, and every
   "translucent" shade is a checkerboard dither rather than an alpha ramp --
   see the dish glass in CellStates and ditherStrand in DecorationRenderer.
   Nothing here uses a gradient, a blur or a radial fade.

   The animation is driven by the blast's own tick counters, not by wall clock:
   a blast is a simulation event (it lands damage on the tick its fuse runs
   out), so its picture advances with the simulation. That also makes every
   frame a pure function of (blast, phase) -- repeated render frames between two
   ticks draw identical pixels, so nothing shimmers, and a paused world holds
   one still frame instead of animating over a sim that has stopped. */

/* Ticks from the moment a doomed organism dies to the moment the charge goes
   off. The blast draws its telegraph over the last FUSE_TICKS - 1 of them (the
   arming tick is consumed by the same step that pushes the blast), so this is
   the beat of anticipation, in sim ticks. */
export const FUSE_TICKS = 5;

// Ticks the fireball, ring and debris play out over, after the charge lands.
export const BLAST_FX_TICKS = 8;

/* White-hot core through cooling rust. Indices are used as a temperature
   scale: a mark cools by stepping down this list, and a mark that steps off
   the end is simply not drawn -- which is how the fireball dissolves without
   ever painting a dark square over the world. */
const FIRE = ['#FFFFFF', '#FFF4C2', '#FFEA00', '#FFA51E', '#FF6B00', '#D22B14', '#7A1D12'];

/* Beyond this many simultaneous blasts, later ones still detonate (the fuse is
   simulation state, stepped in EnvironmentEffects) but stop being painted. A
   chain reaction in a dense world can arm dozens in one tick, and past a
   handful they overlap into one wall of fire anyway. */
const MAX_DRAWN_BLASTS = 24;

/* One armed charge. Purely numbers -- no organism reference -- so a pending
   blast can never keep a dead organism (or its species) alive, and so
   SerializeHelper's copyNonObjects skips the array wholesale, exactly as it
   already does for active_explosions.

   `body` is the doomed organism's footprint in grid cells, [col, row, ...],
   captured at death for the telegraph blink and shared by every charge in the
   same body (a predator bomber carries three), so a death allocates one array
   however many charges it holds. */
export interface Blast {
    col: number;
    row: number;
    radius: number;
    // Counts down FUSE_TICKS -> 0. Above zero the charge is still telegraphing.
    fuse: number;
    // Ticks since the charge landed; 0 on the tick it lands (the flash frame).
    age: number;
    body: number[];
    // Fixes this blast's debris scatter, so its picture is reproducible.
    seed: number;
}

// A new charge, armed but not yet lit. Callers push this onto env.active_blasts.
export function makeBlast(col: number, row: number, radius: number, body: number[]): Blast {
    return {
        col, row, radius,
        fuse: FUSE_TICKS,
        age: 0,
        body,
        seed: (Math.random() * 0x7fffffff) | 0,
    };
}

/* Deterministic 0..1 from a blast seed and a debris index: a couple of integer
   mixes, so a frame's scatter costs no allocation and never changes between
   two renders of the same tick. */
function hash01(seed: number, i: number): number {
    let h = (seed ^ (i * 0x9e3779b1)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ease-out: the front leaves fast and settles, which is what makes a blast
// read as a shove rather than a growing circle.
function easeOut(p: number): number {
    return 1 - (1 - p) * (1 - p);
}

/* The fuse telegraph: the doomed body, held in place and blinking.

   The corpse itself is already food on the grid by now (die() converts it the
   moment it dies), so this repaints the footprint on top -- which is exactly
   what sells the beat: the organism visibly *stays* for a moment, flashing,
   instead of popping. Two rects per cell: a bright rim with a darker core, so
   each cell reads as a chunky lit block rather than a flat square. */
function drawFuse(ctx: CanvasRenderingContext2D, b: Blast, cs: number): void {
    // 4, 2 and the final 1 flash; 3 is the dark beat between the first two.
    const flash = b.fuse === 1 || (b.fuse & 1) === 0;
    const rim = flash ? FIRE[0] : FIRE[4];
    const core = flash ? FIRE[2] : FIRE[5];
    const px = Math.max(1, Math.floor(cs / 5));
    const inner = cs - px * 2;
    for (let i = 0; i < b.body.length; i += 2) {
        const x = b.body[i] * cs;
        const y = b.body[i + 1] * cs;
        ctx.fillStyle = rim;
        ctx.fillRect(x, y, cs, cs);
        if (inner <= 0) continue;
        ctx.fillStyle = core;
        ctx.fillRect(x + px, y + px, inner, inner);
    }
}

/* The fireball, on the grid the world is drawn on: whole cells, so the blast
   reads as part of the world rather than a decal floating over it. Colour is
   temperature -- the front is white, everything behind it has been burning
   longer and has stepped down FIRE -- and the two coolest steps dissolve on a
   checkerboard keyed to the cell grid, so the fire breaks up into embers
   instead of fading uniformly. */
function drawFireball(ctx: CanvasRenderingContext2D, b: Blast, cs: number): void {
    const p = b.age / BLAST_FX_TICKS;
    const front = (b.radius + 1) * easeOut(p);
    if (front <= 0) return;
    const reach = Math.ceil(front);
    for (let dc = -reach; dc <= reach; dc++) {
        for (let dr = -reach; dr <= reach; dr++) {
            const d = Math.sqrt(dc * dc + dr * dr);
            if (d > front) continue;
            const col = b.col + dc;
            const row = b.row + dr;
            /* How far behind the front this cell sits, in FIRE steps, plus the
               blast's own age: the centre cools first and the leading edge
               stays hot, which is the shape of a real fireball and reads as
               outward motion even when the front has stopped growing. */
            const behind = (front - d) * 1.6;
            let ci = Math.floor(behind) + b.age - 1;
            // Dither the seam between two temperature bands: in the upper half
            // of a band, every other cell takes the next colour, so the ramp
            // steps through a checker rather than drawing contour rings.
            if (behind - Math.floor(behind) > 0.5 && ((col + row) & 1)) ci += 1;
            if (ci < 0 || ci >= FIRE.length) continue;
            if (ci >= FIRE.length - 2 && ((col + row + b.age) & 1)) continue;
            ctx.fillStyle = FIRE[ci];
            ctx.fillRect(col * cs, row * cs, cs, cs);
        }
    }
}

/* The shockwave: a one-cell-thick ring of dithered blocks that outruns the
   fireball and thins as it goes. Half the ring's cells are dropped on the cell
   grid's own checkerboard, and later frames drop three quarters, so it fades
   by getting sparser -- a dither fade, not an alpha one. */
function drawShockRing(ctx: CanvasRenderingContext2D, b: Blast, cs: number): void {
    const p = b.age / BLAST_FX_TICKS;
    const ring = (b.radius + 0.5) * (0.5 + 1.6 * easeOut(p));
    const reach = Math.ceil(ring + 1);
    const late = p > 0.55;
    ctx.fillStyle = FIRE[late ? 3 : 1];
    for (let dc = -reach; dc <= reach; dc++) {
        for (let dr = -reach; dr <= reach; dr++) {
            const d = Math.sqrt(dc * dc + dr * dr);
            if (d < ring - 0.55 || d > ring + 0.55) continue;
            const col = b.col + dc;
            const row = b.row + dr;
            if ((col + row) & 1) continue;
            if (late && ((col - row) & 2)) continue;
            ctx.fillRect(col * cs, row * cs, cs, cs);
        }
    }
}

/* How far a piece of debris can fly, as a multiple of (radius + 1.4) cells.
   The spread below picks somewhere in [0.7, 2.0] of that; the upper bound is
   what drawBlasts hands to `mark`, so every pixel debris can reach is a pixel
   the caller knows to repaint. */
const DEBRIS_REACH_MAX = 2.0;

/* Debris: chunky squares thrown clear of the crater, shrinking and cooling as
   they fly. Sub-cell and off-grid on purpose -- they are the one part of the
   effect that is not cell-aligned, which is what keeps the blast from looking
   like a shape the grid drew. Positions snap to whole pixels so they stay
   crisp under the canvas's pixelated upscale. */
function drawDebris(ctx: CanvasRenderingContext2D, b: Blast, cs: number): void {
    const p = b.age / BLAST_FX_TICKS;
    const travelled = easeOut(p);
    const cx = (b.col + 0.5) * cs;
    const cy = (b.row + 0.5) * cs;
    const n = Math.min(18, 6 + b.radius * 3);
    for (let i = 0; i < n; i++) {
        const angle = hash01(b.seed, i) * Math.PI * 2;
        const reach = (b.radius + 1.4) * cs * (0.7 + hash01(b.seed, i + 64) * (DEBRIS_REACH_MAX - 0.7));
        const ci = 1 + Math.floor(p * 4) + (i & 1);
        if (ci >= FIRE.length) continue;
        const dist = reach * travelled;
        const size = Math.max(1, Math.round(cs * (0.9 - 0.55 * p)));
        ctx.fillStyle = FIRE[ci];
        ctx.fillRect(
            Math.round(cx + Math.cos(angle) * dist - size / 2),
            Math.round(cy + Math.sin(angle) * dist - size / 2),
            size, size,
        );
    }
}

/* Paint every live blast. `mark`, when given, is handed the world-pixel bounds
   each blast painted into, so an immediate-mode caller can repaint those cells
   next frame and never smear (WorldEnvironment.markFxBounds); the Lab's
   preview repaints everything anyway and passes nothing. */
export function drawBlasts(
    ctx: CanvasRenderingContext2D,
    blasts: Blast[],
    cell_size: number,
    mark?: (x0: number, y0: number, x1: number, y1: number) => void,
): void {
    if (blasts.length === 0) return;
    const cs = Math.max(1, Math.floor(cell_size));
    const drawn = Math.min(blasts.length, MAX_DRAWN_BLASTS);
    for (let i = 0; i < drawn; i++) {
        const b = blasts[i];
        if (b.fuse > 0) {
            drawFuse(ctx, b, cs);
            if (mark) {
                for (let k = 0; k < b.body.length; k += 2)
                    mark(b.body[k] * cs, b.body[k + 1] * cs, (b.body[k] + 1) * cs, (b.body[k + 1] + 1) * cs);
            }
            continue;
        }
        if (b.age === 0) {
            /* The flash frame: one tick of overexposed white over the whole
               blast, cell-aligned. A single held frame is the oldest trick in
               the 16-bit book and it is what makes the hit land. */
            ctx.fillStyle = FIRE[0];
            const reach = Math.ceil(b.radius);
            for (let dc = -reach; dc <= reach; dc++) {
                for (let dr = -reach; dr <= reach; dr++) {
                    if (dc * dc + dr * dr > b.radius * b.radius) continue;
                    ctx.fillRect((b.col + dc) * cs, (b.row + dr) * cs, cs, cs);
                }
            }
        } else {
            drawFireball(ctx, b, cs);
            drawShockRing(ctx, b, cs);
        }
        drawDebris(ctx, b, cs);
        if (mark) {
            /* The debris flies furthest; the ring and fireball stay inside it.
               This has to be the *maximum* a piece can reach, not a typical
               one: a square painted outside the marked box is never repainted
               from the grid, so it would stay on the world canvas for good. */
            const reach = (b.radius + 1.4) * cs * DEBRIS_REACH_MAX + cs;
            const cx = (b.col + 0.5) * cs;
            const cy = (b.row + 0.5) * cs;
            mark(cx - reach, cy - reach, cx + reach, cy + reach);
        }
    }
}
