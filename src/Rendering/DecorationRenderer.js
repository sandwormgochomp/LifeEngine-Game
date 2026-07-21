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

function drawOrganismDecorations(ctx, env) {
    var renderer = env.renderer;
    var sz = Math.floor(renderer.cell_size);
    ctx.clearRect(0, 0, renderer.width, renderer.height);
    if (sz <= 2) return; // matches the base renderer's plain-square cutoff

    var grid = env.grid_map;
    var bw = Math.max(1, Math.floor(sz / 5));       // outline thickness
    var cut = sz >= 12 ? 3 : (sz >= 6 ? 2 : 1);     // mirror renderOrganismCell's corner cut
    var t = Math.max(1, Math.floor(sz / 4));        // tissue strand thickness

    for (var org of env.organisms) {
        if (!org.living) continue;

        var same = function (c, r) {
            var target = grid.cellAt(c, r);
            return Boolean(target && (target.owner === org || (target.cell_owner && target.cell_owner.org === org)));
        };

        var getTargetOrg = function (c, r) {
            var target = grid.cellAt(c, r);
            return target ? (target.owner || (target.cell_owner ? target.cell_owner.org : null)) : null;
        };

        var shadowOff = Math.max(1, Math.floor(sz / 5));

        // Pass 0: 16-Bit Retro Pixel Drop Shadow (offset down-right beneath organism)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        for (var body_cell of org.anatomy.cells) {
            var cell = org.getRealCell(body_cell);
            if (cell == null) continue;
            var x = Math.floor(cell.x) + shadowOff, y = Math.floor(cell.y) + shadowOff;
            var col = cell.col, row = cell.row;

            var sameN = same(col, row - 1);
            var sameS = same(col, row + 1);
            var sameE = same(col + 1, row);
            var sameW = same(col - 1, row);

            // Shadow body fill
            ctx.fillRect(x, y, sz, sz);

            // Shadow diagonal connections
            if (same(col + 1, row - 1)) ctx.fillRect(x + sz - t, y - t, t * 2, t * 2);
            if (same(col + 1, row + 1)) ctx.fillRect(x + sz - t, y + sz - t, t * 2, t * 2);

            // Shadow outer outline
            if (!sameN) ctx.fillRect(x, y - bw, sz, bw);
            if (!sameS) ctx.fillRect(x, y + sz, sz, bw);
            if (!sameW) ctx.fillRect(x - bw, y, bw, sz);
            if (!sameE) ctx.fillRect(x + sz, y, bw, sz);

            var sameNW = same(col - 1, row - 1);
            var sameNE = same(col + 1, row - 1);
            var sameSW = same(col - 1, row + 1);
            var sameSE = same(col + 1, row + 1);

            if (!sameN && !sameW && !sameNW) ctx.fillRect(x, y, cut, cut);
            if (!sameN && !sameE && !sameNE) ctx.fillRect(x + sz - cut, y, cut, cut);
            if (!sameS && !sameW && !sameSW) ctx.fillRect(x, y + sz - cut, cut, cut);
            if (!sameS && !sameE && !sameSE) ctx.fillRect(x + sz - cut, y + sz - cut, cut, cut);
        }

        // Pass 1: Solid Cell Body & Diagonal Joint Filler
        for (var body_cell of org.anatomy.cells) {
            var cell = org.getRealCell(body_cell);
            if (cell == null) continue;
            var x = Math.floor(cell.x), y = Math.floor(cell.y);
            var col = cell.col, row = cell.row;
            var color = body_cell.custom_color || body_cell.state.color;

            // Fill solid cell body box
            ctx.fillStyle = color;
            ctx.fillRect(x, y, sz, sz);

            // Fill diagonal connection joint filler
            if (same(col + 1, row - 1)) {
                var ne = grid.cellAt(col + 1, row - 1);
                var ne_color = (ne && ne.cell_owner && ne.cell_owner.custom_color) || (ne && ne.state ? ne.state.color : color);
                drawStrand(ctx, x + sz, y, -1, t, color, ne_color);
            }
            if (same(col + 1, row + 1)) {
                var se = grid.cellAt(col + 1, row + 1);
                var se_color = (se && se.cell_owner && se.cell_owner.custom_color) || (se && se.state ? se.state.color : color);
                drawStrand(ctx, x + sz, y + sz, 1, t, color, se_color);
            }
        }

        // Pass 1.5: 16-Bit Retro Pixel Dithering & Gradient Shading (Scaled proportionally to cell size sz)
        if (sz >= 3) {
            var dStep = Math.max(1, Math.floor(sz / 5));
            var halfSz = Math.floor(sz / 2);
            for (var body_cell of org.anatomy.cells) {
                var cell = org.getRealCell(body_cell);
                if (cell == null) continue;
                var x = Math.floor(cell.x), y = Math.floor(cell.y);

                // Top-Left Highlight Dithering (50% checkerboard dither pattern)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                for (var py = 0; py <= halfSz; py += dStep) {
                    for (var px = 0; px <= halfSz - (py >= halfSz ? dStep : 0); px += dStep) {
                        var gridIx = Math.floor(px / dStep);
                        var gridIy = Math.floor(py / dStep);
                        if ((gridIx + gridIy) % 2 === 0) {
                            ctx.fillRect(x + px, y + py, Math.min(dStep, sz - px), Math.min(dStep, sz - py));
                        }
                    }
                }

                // Bottom-Right Shadow Dithering (50% checkerboard dither pattern)
                ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
                for (var py = halfSz; py < sz; py += dStep) {
                    for (var px = halfSz + (py <= halfSz ? dStep : 0); px < sz; px += dStep) {
                        var gridIx = Math.floor(px / dStep);
                        var gridIy = Math.floor(py / dStep);
                        if ((gridIx + gridIy) % 2 === 0) {
                            ctx.fillRect(x + px, y + py, Math.min(dStep, sz - px), Math.min(dStep, sz - py));
                        }
                    }
                }
            }
        }

        // Pass 2: Silhouette Outline around exposed edges
        for (var body_cell of org.anatomy.cells) {
            var cell = org.getRealCell(body_cell);
            if (cell == null) continue;
            var x = Math.floor(cell.x), y = Math.floor(cell.y);
            var col = cell.col, row = cell.row;
            var color = body_cell.custom_color || body_cell.state.color;
            var darkColor = shade(color, 0.45);

            var sameN = same(col, row - 1);
            var sameS = same(col, row + 1);
            var sameE = same(col + 1, row);
            var sameW = same(col - 1, row);

            ctx.fillStyle = darkColor;

            if (!sameN) ctx.fillRect(x, y - bw, sz, bw);
            if (!sameS) ctx.fillRect(x, y + sz, sz, bw);
            if (!sameW) ctx.fillRect(x - bw, y, bw, sz);
            if (!sameE) ctx.fillRect(x + sz, y, bw, sz);

            // Corner notch fills for exposed convex outer corners
            var sameNW = same(col - 1, row - 1);
            var sameNE = same(col + 1, row - 1);
            var sameSW = same(col - 1, row + 1);
            var sameSE = same(col + 1, row + 1);

            if (!sameN && !sameW && !sameNW) ctx.fillRect(x, y, cut, cut);
            if (!sameN && !sameE && !sameNE) ctx.fillRect(x + sz - cut, y, cut, cut);
            if (!sameS && !sameW && !sameSW) ctx.fillRect(x, y + sz - cut, cut, cut);
            if (!sameS && !sameE && !sameSE) ctx.fillRect(x + sz - cut, y + sz - cut, cut, cut);
        }
    }
}

export default drawOrganismDecorations;
