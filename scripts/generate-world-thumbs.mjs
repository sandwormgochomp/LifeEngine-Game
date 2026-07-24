/* Paints a minimap PNG for every bundled world, for the picker to show.

   This runs at build time rather than in the browser because the input is the
   thing that makes it expensive: the worlds are 285KB to 6.4MB of JSON each,
   47MB in total, and drawing twenty of them on open would mean downloading and
   parsing every world just to list them. A thumbnail is ~5KB.

   No canvas dependency -- the raster is a byte array and the PNG is written
   with the zlib that ships with Node (see encodePng). The cell colours come
   from src/Rendering/palette.json, shared with the renderer so a recoloured
   cell state can't leave these thumbnails behind in the old scheme. */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS_DIR = join(ROOT, 'public/assets/worlds');
const OUT_DIR = join(WORLDS_DIR, 'thumbs');

// The tile the picker draws these into, at 2x for crisp downscaling
const BOX_W = 352;
const BOX_H = 224;

const palette = JSON.parse(readFileSync(join(ROOT, 'src/Rendering/palette.json'), 'utf8'));

/* What wins when many cells collapse into one thumbnail pixel. Life outranks
   terrain outranks food outranks empty: a picking rule that averaged, or took
   the majority, would erase the organisms from a world like Scarcity, where
   1666 of them are scattered across 854x400 cells and no output pixel has them
   in the majority. Within a tier, the more numerous state wins. */
const TIER = { empty: 0, food: 1, wall: 2, invincible_wall: 2 };
const LIFE_TIER = 3;
const tierOf = name => TIER[name] ?? LIFE_TIER;

const NAMED_COLORS = { gray: [128, 128, 128] };

function parseColor(value) {
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];
  const hex = value.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/* Mirrors BodyCell.rotatedCol/rotatedRow. Duplicated rather than imported
   because the source is TypeScript reaching into the live Organism, and this
   is eight lines of arithmetic that the save format pins in place: the
   rotation values are persisted, so they cannot change without breaking every
   existing save. Directions are up=0, right=1, down=2, left=3. */
function rotate(loc_col, loc_row, rotation) {
  switch (rotation) {
    case 1: return [-loc_row, loc_col];
    case 2: return [-loc_col, -loc_row];
    case 3: return [loc_row, -loc_col];
    default: return [loc_col, loc_row];
  }
}

/* The world as one cell-state name per grid square, built the way loadRaw
   builds the live grid: terrain first, then organisms painted over it. */
function rasterize(world) {
  const cols = Number(world.grid.cols);
  const rows = Number(world.grid.rows);
  const cells = new Array(cols * rows).fill('empty');
  const at = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? c * rows + r : -1);

  for (const { c, r } of world.grid.food ?? []) {
    const i = at(c, r);
    if (i >= 0) cells[i] = 'food';
  }
  for (const { c, r } of world.grid.walls ?? []) {
    const i = at(c, r);
    if (i >= 0) cells[i] = 'wall';
  }
  for (const org of world.organisms ?? []) {
    if (org.living === false) continue;
    for (const cell of org.anatomy?.cells ?? []) {
      const [dc, dr] = rotate(cell.loc_col, cell.loc_row, org.rotation ?? 0);
      const i = at(org.c + dc, org.r + dr);
      if (i >= 0) cells[i] = cell.state?.name ?? 'common';
    }
  }
  return { cols, rows, cells };
}

/* Box-filter down to the tile, picking each output pixel by TIER rather than
   averaging -- see the comment there. Never upscales past one pixel per cell:
   a 140x140 world blown up to fill the box would only add blur. */
function downscale({ cols, rows, cells }) {
  const scale = Math.min(BOX_W / cols, BOX_H / rows, 1);
  const out_w = Math.max(1, Math.round(cols * scale));
  const out_h = Math.max(1, Math.round(rows * scale));
  const rgba = Buffer.alloc(out_w * out_h * 4);
  const colors = new Map();
  const colorOf = name => {
    let c = colors.get(name);
    if (!c) colors.set(name, (c = parseColor(palette[name] ?? palette.common)));
    return c;
  };

  const counts = new Map();
  for (let y = 0; y < out_h; y++) {
    const r0 = Math.floor((y * rows) / out_h);
    const r1 = Math.max(r0 + 1, Math.floor(((y + 1) * rows) / out_h));
    for (let x = 0; x < out_w; x++) {
      const c0 = Math.floor((x * cols) / out_w);
      const c1 = Math.max(c0 + 1, Math.floor(((x + 1) * cols) / out_w));

      counts.clear();
      let best = 'empty', best_tier = -1, best_count = 0;
      for (let c = c0; c < c1; c++) {
        for (let r = r0; r < r1; r++) {
          const name = cells[c * rows + r];
          const n = (counts.get(name) ?? 0) + 1;
          counts.set(name, n);
          const tier = tierOf(name);
          if (tier > best_tier || (tier === best_tier && n > best_count)) {
            best = name; best_tier = tier; best_count = n;
          }
        }
      }

      const [red, green, blue] = colorOf(best);
      const o = (y * out_w + x) * 4;
      rgba[o] = red; rgba[o + 1] = green; rgba[o + 2] = blue; rgba[o + 3] = 255;
    }
  }
  return { width: out_w, height: out_h, rgba };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// Minimal 8-bit RGBA PNG: every scanline uses filter 0, and zlib does the rest.
function encodePng({ width, height, rgba }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const list = JSON.parse(readFileSync(join(WORLDS_DIR, '_list.json'), 'utf8'));
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

for (const { name, value } of list) {
  const world = JSON.parse(readFileSync(join(WORLDS_DIR, `${value}.json`), 'utf8'));
  const image = downscale(rasterize(world));
  const png = encodePng(image);
  writeFileSync(join(OUT_DIR, `${value}.png`), png);
  console.log(`${name}: ${image.width}x${image.height}, ${(png.length / 1024).toFixed(1)}KB`);
}
console.log(`${list.length} world thumbnails written to ${OUT_DIR}`);
