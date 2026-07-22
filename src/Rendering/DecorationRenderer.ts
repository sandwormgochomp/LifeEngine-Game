// Organism decorations that intentionally spill outside their cells' pixel
// boxes: a shaded silhouette outline and diagonal connective tissue crossing
// cell corners. These cannot live on the world canvas: its renderer is
// dirty-rect per-cell, so overflow would be clipped whenever a neighbor
// redraws and would ghost when the organism moves. Instead they are drawn on
// a dedicated transparent overlay canvas that WorldEnvironment clears and
// fully repaints whenever the world changes, which makes overflowing artwork
// safe by construction.

/* These model only the members this renderer reaches through. They stay
   structural because the entry point is called with both a WorldEnvironment
   organism and, from OrganismEditor, the editor itself -- see the cast at
   OrganismEditor's drawOrganismDecorations call. */
interface DecoBodyCellLike {
    loc_col: number;
    loc_row: number;
    state: { name: string; color: string };
    custom_color?: string | null;
    direction?: number;
    rotatedCol?(rotation: number): number;
    rotatedRow?(rotation: number): number;
}

/* One organism's pre-rendered sprite plus the keys drawOrganismDecorations
   compares to decide whether the cache is still valid. */
export interface OrganismSpriteCache {
    canvas: HTMLCanvasElement;
    minCol: number;
    minRow: number;
    padding: number;
    sz: number;
    rotation: number;
    hash: string;
}

/* All four rotations of an organism's sprite, filled on demand. Movers cycle
   their rotation constantly; caching one rotation at a time meant every turn
   re-rendered the sprite from scratch, and at a few hundred movers that was
   the decoration pass's whole cost (measured >20ms per repaint at ~700
   organisms, almost all of it regeneration). Four slots make a turn a cache
   hit after the first cycle. Keyed by Directions' 0-3 rotation values. */
export interface OrganismSpriteSet {
    sz: number;
    hash: string;
    by_rotation: (OrganismSpriteCache | null)[];
}

interface DecoOrganismLike {
    c: number;
    r: number;
    rotation?: number;
    living?: boolean;
    anatomy?: { cells: DecoBodyCellLike[] } | null;
    /* Injected from here: drawOrganismDecorations caches each organism's
       rendered sprites on the organism instance itself. Organism.ts MUST
       declare this field when Organism.js converts, or that write stops
       type-checking. */
    _spriteCache?: OrganismSpriteSet | null;
}

interface DecoEnvLike {
    renderer: { cell_size: number; width: number; height: number };
    organisms: DecoOrganismLike[];
    /* The organism under the cursor, set by CanvasController. Renderer's own
       cell highlight paints on the world canvas, which this overlay covers, so
       the selection was invisible on any organism large enough to have a
       sprite -- the tint has to be applied here, to the sprite itself. */
    highlighted_org?: DecoOrganismLike | null;
}

const shade_cache = new Map<string, string>();
const NAMED_COLORS: Record<string, string> = {
    gray: '#808080',
    grey: '#808080',
    magenta: '#FF00FF',
    black: '#000000',
    white: '#FFFFFF',
};

// Multiply a css color's channels by factor. Unknown formats fall back to the
// original color so a bad custom_color never breaks the render pass.
function shade(color: string, factor: number): string {
    var key = color + '|' + factor;
    var cached = shade_cache.get(key);
    if (cached) return cached;

    var out = color;
    var hex = NAMED_COLORS[color] || color;
    if (typeof hex === 'string' && hex[0] === '#' && (hex.length === 4 || hex.length === 7)) {
        if (hex.length === 4)
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        var r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
        var g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
        var b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
        out = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    shade_cache.set(key, out);
    return out;
}

// A clean pixel-art diagonal connection with a sharp boundary line between colorA and colorB
function drawStrand(ctx: CanvasRenderingContext2D, px: number, py: number, dy: number, t: number, colorA: string, colorB: string): void {
    if (dy > 0) {
        // SE diagonal (down-right): clean diagonal boundary between Cell A (top-left) and Cell B (bottom-right)
        ctx.fillStyle = colorA;
        ctx.fillRect(px - t, py - t, t, t);
        ctx.fillRect(px - t, py, t, t);
        ctx.fillRect(px, py - t, t, t);

        ctx.fillStyle = colorB;
        ctx.fillRect(px, py, t, t);
    } else {
        // NE diagonal (up-right): clean diagonal boundary between Cell A (bottom-left) and Cell B (top-right)
        ctx.fillStyle = colorA;
        ctx.fillRect(px - t, py, t, t);
        ctx.fillRect(px - t, py - t, t, t);
        ctx.fillRect(px, py, t, t);

        ctx.fillStyle = colorB;
        ctx.fillRect(px, py - t, t, t);
    }
}

/* Every input the sprite passes read off a cell has to appear here, or the
   sprite cache in drawOrganismDecorations hands back stale pixels. `direction`
   is one: rotating an eye in the editor changes nothing else about the cell,
   so without it the pupil stays where it was through any number of clicks. */
function getAnatomyHash(org: DecoOrganismLike): string {
    if (!org.anatomy) return '';
    var hash = org.anatomy.cells.length + ':';
    for (var cell of org.anatomy.cells) {
        hash += cell.loc_col + ',' + cell.loc_row + ',' + (cell.state ? cell.state.name : '') + ',' + (cell.custom_color || '') + ',' + (cell.direction ?? '') + ';';
    }
    return hash;
}

function generateOrganismSprite(org: DecoOrganismLike, sz: number): OrganismSpriteCache | null {
    var rotation = org.rotation || 0;
    var cells = org.anatomy ? org.anatomy.cells : [];
    if (cells.length === 0) return null;

    var minCol = Infinity, maxCol = -Infinity;
    var minRow = Infinity, maxRow = -Infinity;
    var cellMap = new Map<string, DecoBodyCellLike>();

    for (var body_cell of cells) {
        var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
        var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
        minCol = Math.min(minCol, rc);
        maxCol = Math.max(maxCol, rc);
        minRow = Math.min(minRow, rr);
        maxRow = Math.max(maxRow, rr);
        cellMap.set(rc + ',' + rr, body_cell);
    }

    var bw = Math.max(1, Math.floor(sz / 5));
    var cut = sz >= 12 ? 3 : (sz >= 6 ? 2 : 1);
    var t = Math.max(1, Math.floor(sz / 4));
    var shadowOff = Math.max(1, Math.floor(sz / 5));
    var padding = sz + shadowOff + bw * 2;

    var cols = (maxCol - minCol + 1);
    var rows = (maxRow - minRow + 1);
    var width = Math.ceil(cols * sz + padding * 2);
    var height = Math.ceil(rows * sz + padding * 2);

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var same = function(rc: number, rr: number): boolean {
        return cellMap.has(rc + ',' + rr);
    };

    var getCellPos = function(rc: number, rr: number): { x: number; y: number } {
        return {
            x: padding + (rc - minCol) * sz,
            y: padding + (rr - minRow) * sz
        };
    };

    // Pass 0: 16-Bit Retro Pixel Drop Shadow (Underneath Organism Body)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (var body_cell of cells) {
        var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
        var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
        var pos = getCellPos(rc, rr);
        var x = pos.x + shadowOff, y = pos.y + shadowOff;

        var sameN = same(rc, rr - 1);
        var sameS = same(rc, rr + 1);
        var sameE = same(rc + 1, rr);
        var sameW = same(rc - 1, rr);

        ctx.fillRect(x, y, sz, sz);
        if (same(rc + 1, rr - 1)) ctx.fillRect(x + sz - t, y - t, t * 2, t * 2);
        if (same(rc + 1, rr + 1)) ctx.fillRect(x + sz - t, y + sz - t, t * 2, t * 2);

        if (!sameN) ctx.fillRect(x, y - bw, sz, bw);
        if (!sameS) ctx.fillRect(x, y + sz, sz, bw);
        if (!sameW) ctx.fillRect(x - bw, y, bw, sz);
        if (!sameE) ctx.fillRect(x + sz, y, bw, sz);

        var sameNW = same(rc - 1, rr - 1);
        var sameNE = same(rc + 1, rr - 1);
        var sameSW = same(rc - 1, rr + 1);
        var sameSE = same(rc + 1, rr + 1);

        if (!sameN && !sameW && !sameNW) ctx.fillRect(x, y, cut, cut);
        if (!sameN && !sameE && !sameNE) ctx.fillRect(x + sz - cut, y, cut, cut);
        if (!sameS && !sameW && !sameSW) ctx.fillRect(x, y + sz - cut, cut, cut);
        if (!sameS && !sameE && !sameSE) ctx.fillRect(x + sz - cut, y + sz - cut, cut, cut);
    }

    // Combined Pass 1: Solid Body, Diagonal Joints, Pixel Dithering & Silhouette Outlines
    var dStep = sz >= 3 ? Math.max(1, Math.floor(sz / 5)) : 1;
    var halfSz = Math.floor(sz / 2);

    for (var body_cell of cells) {
        var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
        var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
        var pos = getCellPos(rc, rr);
        var color = body_cell.custom_color || body_cell.state.color;

        var sameN  = same(rc, rr - 1);
        var sameS  = same(rc, rr + 1);
        var sameE  = same(rc + 1, rr);
        var sameW  = same(rc - 1, rr);
        var sameNE = same(rc + 1, rr - 1);
        var sameSE = same(rc + 1, rr + 1);
        var sameNW = same(rc - 1, rr - 1);
        var sameSW = same(rc - 1, rr + 1);

        // A. Solid Cell Body & Diagonal Joint Filler
        ctx.fillStyle = color;
        ctx.fillRect(pos.x, pos.y, sz, sz);

        if (sameNE) {
            var ne = cellMap.get((rc + 1) + ',' + (rr - 1));
            var ne_color = (ne && ne.custom_color) || (ne && ne.state ? ne.state.color : color);
            drawStrand(ctx, pos.x + sz, pos.y, -1, t, color, ne_color);
        }
        if (sameSE) {
            var se = cellMap.get((rc + 1) + ',' + (rr + 1));
            var se_color = (se && se.custom_color) || (se && se.state ? se.state.color : color);
            drawStrand(ctx, pos.x + sz, pos.y + sz, 1, t, color, se_color);
        }

        // B. 16-Bit Retro Pixel Dithering & Gradient Shading
        if (sz >= 3) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            for (var py = 0; py <= halfSz; py += dStep) {
                for (var px = 0; px <= halfSz - (py >= halfSz ? dStep : 0); px += dStep) {
                    var gridIx = Math.floor(px / dStep);
                    var gridIy = Math.floor(py / dStep);
                    if ((gridIx + gridIy) % 2 === 0) {
                        ctx.fillRect(pos.x + px, pos.y + py, Math.min(dStep, sz - px), Math.min(dStep, sz - py));
                    }
                }
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            for (var py = halfSz; py < sz; py += dStep) {
                for (var px = halfSz + (py <= halfSz ? dStep : 0); px < sz; px += dStep) {
                    var gridIx = Math.floor(px / dStep);
                    var gridIy = Math.floor(py / dStep);
                    if ((gridIx + gridIy) % 2 === 0) {
                        ctx.fillRect(pos.x + px, pos.y + py, Math.min(dStep, sz - px), Math.min(dStep, sz - py));
                    }
                }
            }
        }

        // C. Silhouette Outline & Corner Cutouts
        var darkColor = shade(color, 0.45);
        ctx.fillStyle = darkColor;
        if (!sameN) ctx.fillRect(pos.x, pos.y - bw, sz, bw);
        if (!sameS) ctx.fillRect(pos.x, pos.y + sz, sz, bw);
        if (!sameW) ctx.fillRect(pos.x - bw, pos.y, bw, sz);
        if (!sameE) ctx.fillRect(pos.x + sz, pos.y, bw, sz);

        if (!sameN && !sameW && !sameNW) ctx.fillRect(pos.x, pos.y, cut, cut);
        if (!sameN && !sameE && !sameNE) ctx.fillRect(pos.x + sz - cut, pos.y, cut, cut);
        if (!sameS && !sameW && !sameSW) ctx.fillRect(pos.x, pos.y + sz - cut, cut, cut);
        if (!sameS && !sameE && !sameSE) ctx.fillRect(pos.x + sz - cut, pos.y + sz - cut, cut, cut);
    }

    // Combined Pass 2: Cute Pixel Art Eyeballs (only for 'eye' cells)
    // Rendered in a separate pass so they draw on top of adjacent cell bodies and silhouettes
    for (var body_cell of cells) {
        if (body_cell.state.name === 'eye') {
            var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
            var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
            var pos = getCellPos(rc, rr);
            var color = body_cell.custom_color || body_cell.state.color;
            var darkColor = shade(color, 0.45);

            var r_sz = Math.ceil(sz / bw);
            var cx = (r_sz - 1) / 2;
            var cy = (r_sz - 1) / 2;

            /* Every radius below is a fraction of r_sz, so the eye keeps the same
               proportions at any cell size -- only the sampling gets chunkier as
               r_sz drops. That matters because the editor and the world draw the
               same organism at different r_sz: the editor's cell is 8-24px
               (r_sz 6-8) while the world's is a fixed 5px (r_sz 5) and gets
               scaled up by a CSS transform instead. Absolute retro-pixel terms
               here -- an `R_outer - 1.0` ring, an `r_sz < 6` special case, a
               `rx + ry > r_sz + 1` dither band -- read as different eyes between
               the two views. Ratios are calibrated to r_sz 7, the editor's
               default zoom. */
            var R_outer = r_sz * 0.65;
            var R_inner = R_outer * 0.78;

            var eyeDir = (rotation + (body_cell.direction ?? 0)) % 4;
            var shift = R_inner * 0.45;
            var pdx = 0;
            var pdy = 0;
            if (eyeDir === 0) pdy = -shift;
            else if (eyeDir === 1) pdx = shift;
            else if (eyeDir === 2) pdy = shift;
            else if (eyeDir === 3) pdx = -shift;

            var pcx = cx + pdx;
            var pcy = cy + pdy;
            var R_pupil = Math.max(0.7, R_inner * 0.42);

            var hlrx = pcx - Math.max(0.5, R_pupil * 0.5);
            var hlry = pcy - Math.max(0.5, R_pupil * 0.5);

            var start_r = Math.floor(cx - R_outer);
            var end_r = Math.ceil(cx + R_outer);

            for (var rx = start_r; rx <= end_r; rx++) {
                for (var ry = start_r; ry <= end_r; ry++) {
                    var dx = rx - cx;
                    var dy = ry - cy;
                    var dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= R_outer) {
                        var c_x = Math.floor(pos.x) + rx * bw;
                        var c_y = Math.floor(pos.y) + ry * bw;
                        var w = bw;
                        var h = bw;

                        if (dist > R_inner) {
                            // Eyeball socket outline (matches the cell's shaded outline color)
                            ctx.fillStyle = darkColor;
                            ctx.fillRect(c_x, c_y, w, h);
                        } else {
                            // Inside eyeball
                            var pdx_pixel = rx - pcx;
                            var pdy_pixel = ry - pcy;
                            var p_dist = Math.sqrt(pdx_pixel * pdx_pixel + pdy_pixel * pdy_pixel);

                            var pixel_color = 'white';
                            if (p_dist <= R_pupil) {
                                // Pupil
                                var is_highlight = (rx === Math.round(hlrx) && ry === Math.round(hlry));
                                if (is_highlight) {
                                    pixel_color = 'white';
                                } else {
                                    pixel_color = '#111116';
                                }
                            }

                            ctx.fillStyle = pixel_color;
                            ctx.fillRect(c_x, c_y, w, h);

                            // Apply pixel dither / gradient shading to eyeball interior (sclera)
                            if (pixel_color === 'white') {
                                if ((rx + ry) % 2 === 0) {
                                    // Distance along the top-left -> bottom-right
                                    // light axis, measured from the eye's center
                                    // and scaled by its radius (see R_outer).
                                    var shade_d = dx + dy;
                                    if (shade_d > R_outer * 0.44) {
                                        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'; // Darker shadow at bottom-right
                                    } else if (shade_d >= 0) {
                                        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; // Mid shadow
                                    } else {
                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Highlight / bright white
                                    }
                                    ctx.fillRect(c_x, c_y, w, h);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return {
        canvas: canvas,
        minCol: minCol,
        minRow: minRow,
        padding: padding,
        sz: sz,
        rotation: rotation,
        hash: getAnatomyHash(org)
    };
}

/* Renders a single cell's decorated sprite -- shaded body, silhouette outline,
   and (for an 'eye' cell) the pixel-art eyeball -- into `canvas`, scaled to
   fill it. The Organism Lab's cell palette uses this so each swatch previews a
   cell exactly as it appears on the editor and world canvases, rather than as a
   flat colour square. Reuses generateOrganismSprite so the palette can never
   drift from what the sprite actually draws. `direction` orients an eye's
   pupil; it is inert for every other cell type. */
export function renderCellSwatch(
    canvas: HTMLCanvasElement,
    cell: { name: string; color: string },
    direction: number = 1
): void {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    var sz = 16;
    var org: DecoOrganismLike = {
        c: 0,
        r: 0,
        rotation: 0,
        living: true,
        anatomy: {
            cells: [{ loc_col: 0, loc_row: 0, state: { name: cell.name, color: cell.color }, direction: direction }],
        },
    };
    var sprite = generateOrganismSprite(org, sz);
    if (!sprite) return;

    // The cell body sits at (padding, padding) sized sz; crop a bw-wide margin
    // around it so the silhouette outline shows (and a sliver of drop shadow
    // reads as depth) without the sprite's full organism-sized padding.
    var bw = Math.max(1, Math.floor(sz / 5));
    var region = sz + bw * 2;
    var src = sprite.padding - bw;
    ctx.drawImage(sprite.canvas, src, src, region, region, 0, 0, canvas.width, canvas.height);
}

/* Renders a whole organism's decorated sprite into `canvas`, scaled to fit and
   centered. Used by the modal thumbnails (Lifeforms) so a species previews with
   the same shaded bodies, connective tissue, and eyeballs it has on the world
   and editor canvases. Callers pass cells whose state.color is already resolved
   (the CellState singletons carry the runtime color; serialized cells do not),
   since this module deliberately does not depend on CellStates. */
export function renderOrganismSprite(
    canvas: HTMLCanvasElement,
    cells: DecoBodyCellLike[],
    size: number
): void {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (!cells || cells.length === 0) return;

    var minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (var cell of cells) {
        minCol = Math.min(minCol, cell.loc_col);
        maxCol = Math.max(maxCol, cell.loc_col);
        minRow = Math.min(minRow, cell.loc_row);
        maxRow = Math.max(maxRow, cell.loc_row);
    }
    var cols = maxCol - minCol + 1;
    var rows = maxRow - minRow + 1;

    // Pick a per-cell pixel size that fits the organism's bounding box in the
    // tile, leaving ~half a cell of slack for the outline and shadow that spill
    // past the cell boxes so nothing clips at the tile edge.
    var sz = Math.max(2, Math.floor(size / (Math.max(cols, rows) + 0.6)));

    var org: DecoOrganismLike = {
        c: 0, r: 0, rotation: 0, living: true,
        anatomy: { cells: cells },
    };
    var sprite = generateOrganismSprite(org, sz);
    if (!sprite) return;

    var bw = Math.max(1, Math.floor(sz / 5));
    var shadowOff = Math.max(1, Math.floor(sz / 5));
    var margin = bw + shadowOff;
    var srcX = sprite.padding - margin;
    var srcY = sprite.padding - margin;
    var srcW = cols * sz + margin * 2;
    var srcH = rows * sz + margin * 2;

    // Fit the cropped sprite into the tile, centered, preserving aspect ratio.
    var scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    var destW = srcW * scale;
    var destH = srcH * scale;
    var dx = (canvas.width - destW) / 2;
    var dy = (canvas.height - destH) / 2;
    ctx.drawImage(sprite.canvas, srcX, srcY, srcW, srcH, dx, dy, destW, destH);
}

// Matches Renderer.renderCellHighlight, so a selection reads the same whether
// it lands on bare cells or on a sprite.
const HIGHLIGHT_COLOR = 'yellow';
const HIGHLIGHT_ALPHA = 0.5;

/* Reused across frames; only one organism is ever highlighted at a time.
   Created lazily so importing this module stays safe without a DOM. */
var tint_scratch: HTMLCanvasElement | null = null;

/* Tints a cached sprite by compositing the highlight colour `source-atop` a
   copy of it, so the wash follows the organism's silhouette -- including the
   outline and connective tissue that spill outside the cell boxes -- instead
   of painting the sprite's transparent bounding box. Assigning canvas.width
   both sizes and clears the scratch, and resets its context state. */
function drawHighlightedSprite(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number): void {
    if (!tint_scratch) tint_scratch = document.createElement('canvas');
    var scratch = tint_scratch;
    scratch.width = sprite.width;
    scratch.height = sprite.height;
    var sctx = scratch.getContext('2d');
    if (!sctx) {
        ctx.drawImage(sprite, x, y);
        return;
    }
    sctx.drawImage(sprite, 0, 0);
    sctx.globalCompositeOperation = 'source-atop';
    sctx.globalAlpha = HIGHLIGHT_ALPHA;
    sctx.fillStyle = HIGHLIGHT_COLOR;
    sctx.fillRect(0, 0, scratch.width, scratch.height);
    ctx.drawImage(scratch, x, y);
}

/* `clear` is false only for OrganismEditor, which draws this pass onto its
   single shared canvas rather than a dedicated overlay -- see the comment on
   its renderFull().

   `verify_anatomy` is true only for the editor as well: its one organism is
   the only place anatomy changes after construction (cells added/removed,
   colors picked, eyes rotated), so it must re-hash every frame. World
   organisms get their anatomy exactly once, in the constructor -- mutate()
   runs on the child inside reproduce(), before addOrganism publishes it --
   so re-hashing every organism every frame bought nothing and was the single
   largest string-allocation source in the render path. */
function drawOrganismDecorations(ctx: CanvasRenderingContext2D, env: DecoEnvLike, clear: boolean = true, verify_anatomy: boolean = false): void {
    var renderer = env.renderer;
    var sz = Math.floor(renderer.cell_size);
    if (clear) ctx.clearRect(0, 0, renderer.width, renderer.height);
    if (sz <= 2) return;

    for (var org of env.organisms) {
        if (!org.living) continue;

        var set = org._spriteCache;
        if (!set || set.sz !== sz || (verify_anatomy && set.hash !== getAnatomyHash(org))) {
            set = org._spriteCache = {
                sz: sz,
                hash: getAnatomyHash(org),
                by_rotation: [null, null, null, null],
            };
        }
        var rotation = org.rotation ?? 0;
        var cache = set.by_rotation[rotation];
        if (!cache) {
            cache = generateOrganismSprite(org, sz);
            set.by_rotation[rotation] = cache;
        }

        if (cache && cache.canvas) {
            var drawX = Math.floor(org.c + cache.minCol) * sz - cache.padding;
            var drawY = Math.floor(org.r + cache.minRow) * sz - cache.padding;
            if (org === env.highlighted_org)
                drawHighlightedSprite(ctx, cache.canvas, drawX, drawY);
            else
                ctx.drawImage(cache.canvas, drawX, drawY);
        }
    }
}

export default drawOrganismDecorations;
