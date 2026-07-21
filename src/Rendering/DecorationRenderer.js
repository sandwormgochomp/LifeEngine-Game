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

        // Pass 1: silhouette outline, drawn just outside every exposed edge.
        for (var body_cell of org.anatomy.cells) {
            var cell = org.getRealCell(body_cell);
            if (cell == null) continue;
            var x = Math.floor(cell.x), y = Math.floor(cell.y);
            var col = cell.col, row = cell.row;
            var color = body_cell.custom_color || body_cell.state.color;

            var hasN = same(col, row - 1), hasS = same(col, row + 1);
            var hasE = same(col + 1, row), hasW = same(col - 1, row);

            ctx.fillStyle = shade(color, 0.45);
            if (!hasN) ctx.fillRect(x, y - bw, sz, bw);
            if (!hasS) ctx.fillRect(x, y + sz, sz, bw);
            if (!hasW) ctx.fillRect(x - bw, y, bw, sz);
            if (!hasE) ctx.fillRect(x + sz, y, bw, sz);

            // The base renderer cuts convex corners out of the body; filling
            // those notches with the outline shade turns the square outline
            // into a thick rounded rim instead of leaving a background nick.
            if (!hasN && !hasW && !same(col - 1, row - 1)) ctx.fillRect(x, y, cut, cut);
            if (!hasN && !hasE && !same(col + 1, row - 1)) ctx.fillRect(x + sz - cut, y, cut, cut);
            if (!hasS && !hasW && !same(col - 1, row + 1)) ctx.fillRect(x, y + sz - cut, cut, cut);
            if (!hasS && !hasE && !same(col + 1, row + 1)) ctx.fillRect(x + sz - cut, y + sz - cut, cut, cut);
        }

        // Pass 2: connective tissue across diagonal touches, drawn after
        // the outline so strands sit on top of it. Checking only NE and SE
        // covers each diagonal pair exactly once.
        for (var tissue_cell of org.anatomy.cells) {
            var tcell = org.getRealCell(tissue_cell);
            if (tcell == null) continue;
            var tx = Math.floor(tcell.x), ty = Math.floor(tcell.y);
            var tc = tcell.col, tr = tcell.row;
            var own_color = tissue_cell.custom_color || tissue_cell.state.color;

            if (same(tc + 1, tr - 1)) {
                var ne = grid.cellAt(tc + 1, tr - 1);
                var ne_color = (ne.cell_owner && ne.cell_owner.custom_color) || ne.state.color;
                drawStrand(ctx, tx + sz, ty, -1, t, own_color, ne_color);
            }
            if (same(tc + 1, tr + 1)) {
                var se = grid.cellAt(tc + 1, tr + 1);
                var se_color = (se.cell_owner && se.cell_owner.custom_color) || se.state.color;
                drawStrand(ctx, tx + sz, ty + sz, 1, t, own_color, se_color);
            }
        }
    }
}

export default drawOrganismDecorations;
