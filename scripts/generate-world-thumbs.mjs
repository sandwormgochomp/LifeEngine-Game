/* Paints a minimap PNG for every bundled world, for the picker to show.

   This runs at build time rather than in the browser because the input is the
   thing that makes it expensive: the worlds are 285KB to 6.4MB of JSON each,
   47MB in total, and drawing twenty of them on open would mean downloading and
   parsing every world just to list them. A thumbnail is ~5KB.

   The painting itself is src/Rendering/WorldMinimap.ts, shared with the Worlds
   picker so that a world the user saves in their browser goes through the same
   arithmetic as these do -- Node strips the types and imports it directly. All
   that lives here is the PNG encoder, written against the zlib Node already
   ships rather than a canvas dependency. */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWorldMinimap } from '../src/Rendering/WorldMinimap.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS_DIR = join(ROOT, 'public/assets/worlds');
const OUT_DIR = join(WORLDS_DIR, 'thumbs');

// Read rather than imported: an ESM JSON import needs an import attribute that
// Node and the bundler spell differently, and WorldMinimap takes the palette
// as an argument precisely so neither side has to.
const palette = JSON.parse(readFileSync(join(ROOT, 'src/Rendering/palette.json'), 'utf8'));

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
  const pixels = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
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
  const image = renderWorldMinimap(world, palette);
  const png = encodePng(image);
  writeFileSync(join(OUT_DIR, `${value}.png`), png);
  console.log(`${name}: ${image.width}x${image.height}, ${(png.length / 1024).toFixed(1)}KB`);
}
console.log(`${list.length} world thumbnails written to ${OUT_DIR}`);
