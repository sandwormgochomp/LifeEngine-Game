// Organism decorations that intentionally spill outside their cells' pixel
// boxes: a shaded silhouette outline and diagonal connective tissue crossing
// cell corners. These cannot live on the world canvas: its renderer is
// dirty-rect per-cell, so overflow would be clipped whenever a neighbor
// redraws and would ghost when the organism moves. Instead they are drawn on
// a dedicated transparent overlay canvas that WorldEnvironment clears and
// fully repaints whenever the world changes, which makes overflowing artwork
// safe by construction.

const shade_cache = new Map();
const NAMED_COLORS = {
    gray: '#808080',
    grey: '#808080',
    magenta: '#FF00FF',
    black: '#000000',
    white: '#FFFFFF',
};

// Multiply a css color's channels by factor. Unknown formats fall back to the
// original color so a bad custom_color never breaks the render pass.
function shade(color, factor) {
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
function drawStrand(ctx, px, py, dy, t, colorA, colorB) {
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

function getAnatomyHash(org) {
    if (!org.anatomy) return '';
    var hash = org.anatomy.cells.length + ':';
    for (var cell of org.anatomy.cells) {
        hash += cell.loc_col + ',' + cell.loc_row + ',' + (cell.state ? cell.state.name : '') + ',' + (cell.custom_color || '') + ';';
    }
    return hash;
}

function generateOrganismSprite(org, sz) {
    var rotation = org.rotation || 0;
    var cells = org.anatomy ? org.anatomy.cells : [];
    if (cells.length === 0) return null;

    var minCol = Infinity, maxCol = -Infinity;
    var minRow = Infinity, maxRow = -Infinity;
    var cellMap = new Map();

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

    var same = function(rc, rr) {
        return cellMap.has(rc + ',' + rr);
    };

    var getCellPos = function(rc, rr) {
        return {
            x: padding + (rc - minCol) * sz,
            y: padding + (rr - minRow) * sz
        };
    };

    // Pass 0: 16-Bit Retro Pixel Drop Shadow
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

    // Pass 1: Solid Cell Body & Diagonal Joint Filler
    for (var body_cell of cells) {
        var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
        var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
        var pos = getCellPos(rc, rr);
        var color = body_cell.custom_color || body_cell.state.color;

        ctx.fillStyle = color;
        ctx.fillRect(pos.x, pos.y, sz, sz);

        if (same(rc + 1, rr - 1)) {
            var ne = cellMap.get((rc + 1) + ',' + (rr - 1));
            var ne_color = (ne && ne.custom_color) || (ne && ne.state ? ne.state.color : color);
            drawStrand(ctx, pos.x + sz, pos.y, -1, t, color, ne_color);
        }
        if (same(rc + 1, rr + 1)) {
            var se = cellMap.get((rc + 1) + ',' + (rr + 1));
            var se_color = (se && se.custom_color) || (se && se.state ? se.state.color : color);
            drawStrand(ctx, pos.x + sz, pos.y + sz, 1, t, color, se_color);
        }
    }

    // Pass 1.5: 16-Bit Retro Pixel Dithering & Gradient Shading
    if (sz >= 3) {
        var dStep = Math.max(1, Math.floor(sz / 5));
        var halfSz = Math.floor(sz / 2);
        for (var body_cell of cells) {
            var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
            var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
            var pos = getCellPos(rc, rr);

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
    }

    // Pass 2: Silhouette Outline
    for (var body_cell of cells) {
        var rc = body_cell.rotatedCol ? body_cell.rotatedCol(rotation) : body_cell.loc_col;
        var rr = body_cell.rotatedRow ? body_cell.rotatedRow(rotation) : body_cell.loc_row;
        var pos = getCellPos(rc, rr);
        var color = body_cell.custom_color || body_cell.state.color;
        var darkColor = shade(color, 0.45);

        var sameN = same(rc, rr - 1);
        var sameS = same(rc, rr + 1);
        var sameE = same(rc + 1, rr);
        var sameW = same(rc - 1, rr);

        ctx.fillStyle = darkColor;
        if (!sameN) ctx.fillRect(pos.x, pos.y - bw, sz, bw);
        if (!sameS) ctx.fillRect(pos.x, pos.y + sz, sz, bw);
        if (!sameW) ctx.fillRect(pos.x - bw, pos.y, bw, sz);
        if (!sameE) ctx.fillRect(pos.x + sz, pos.y, bw, sz);

        var sameNW = same(rc - 1, rr - 1);
        var sameNE = same(rc + 1, rr - 1);
        var sameSW = same(rc - 1, rr + 1);
        var sameSE = same(rc + 1, rr + 1);

        if (!sameN && !sameW && !sameNW) ctx.fillRect(pos.x, pos.y, cut, cut);
        if (!sameN && !sameE && !sameNE) ctx.fillRect(pos.x + sz - cut, pos.y, cut, cut);
        if (!sameS && !sameW && !sameSW) ctx.fillRect(pos.x + sz - cut, pos.y + sz - cut, cut, cut);
        if (!sameS && !sameE && !sameSE) ctx.fillRect(pos.x + sz - cut, pos.y + sz - cut, cut, cut);
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

function drawOrganismDecorations(ctx, env) {
    var renderer = env.renderer;
    var sz = Math.floor(renderer.cell_size);
    ctx.clearRect(0, 0, renderer.width, renderer.height);
    if (sz <= 2) return;

    for (var org of env.organisms) {
        if (!org.living) continue;

        var hash = getAnatomyHash(org);
        if (!org._spriteCache || org._spriteCache.sz !== sz || org._spriteCache.rotation !== org.rotation || org._spriteCache.hash !== hash) {
            org._spriteCache = generateOrganismSprite(org, sz);
        }

        if (org._spriteCache && org._spriteCache.canvas) {
            var cache = org._spriteCache;
            var drawX = Math.floor(org.c + cache.minCol) * sz - cache.padding;
            var drawY = Math.floor(org.r + cache.minRow) * sz - cache.padding;
            ctx.drawImage(cache.canvas, drawX, drawY);
        }
    }
}

export default drawOrganismDecorations;
