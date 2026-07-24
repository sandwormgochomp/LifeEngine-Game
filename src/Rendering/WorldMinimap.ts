/* Painting a whole world down to a thumbnail.

   Shared, deliberately, by two callers that could not be further apart: the
   build's thumbnail generator (scripts/generate-world-thumbs.mjs, plain Node,
   no DOM, writes a PNG with zlib) and the Worlds picker (a browser, writes a
   data URL through a canvas). Node strips the types off this file and imports
   it directly, which is why nothing here touches the DOM outside
   minimapDataUrl's body, and why the palette arrives as an argument rather
   than through an import attribute the two module systems spell differently.

   The input is a serialized world either way -- what env.serialize() returns
   and what the bundled .json files hold -- so a world saved in the browser and
   a world painted at build time go through identical arithmetic. */

// The tile the picker draws these into, at 2x for crisp downscaling
export const MINIMAP_BOX_W = 352;
export const MINIMAP_BOX_H = 224;

export type MinimapPalette = Record<string, string>;

export interface MinimapImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/* Only the shape a minimap reads. Structural rather than an import of
   SerializedWorld: the generator hands over freshly parsed JSON, and this
   states exactly which of its fields the raster depends on. */
export interface MinimapWorld {
  grid: {
    cols: number | string;
    rows: number | string;
    food?: { c: number; r: number }[];
    walls?: { c: number; r: number }[];
  };
  /* Whether the world lives in the petri dish. The dish is never in
     grid.walls -- its glass is invincible_wall, which GridMap.serialize()
     skips -- so this flag is all a save carries of it, and the raster has to
     rebuild the circle from scratch. Absent on the bundled worlds, which
     predate the dish. */
  petri_dish?: boolean;
  organisms?: {
    c: number;
    r: number;
    rotation?: number;
    living?: boolean;
    anatomy?: { cells?: { loc_col: number; loc_row: number; state?: { name?: string } }[] };
  }[];
}

export interface MinimapRaster {
  cols: number;
  rows: number;
  cells: string[];
}

/* What wins when many cells collapse into one thumbnail pixel. Life outranks
   terrain outranks food outranks empty: a picking rule that averaged, or took
   the majority, would erase the organisms from a world like Scarcity, where
   1666 of them are scattered across 854x400 cells and no output pixel has them
   in the majority. Within a tier, the more numerous state wins. */
const TIER: Record<string, number> = { empty: 0, food: 1, wall: 2, invincible_wall: 2 };
const LIFE_TIER = 3;
const tierOf = (name: string) => TIER[name] ?? LIFE_TIER;

const NAMED_COLORS: Record<string, [number, number, number]> = { gray: [128, 128, 128] };

function parseColor(value: string): [number, number, number] {
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];
  const hex = value.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/* Mirrors BodyCell.rotatedCol/rotatedRow, which cannot be reused here: those
   are methods on a live BodyCell reaching through its owning Organism, and the
   input is plain saved JSON. Directions are up=0, right=1, down=2, left=3, and
   the values are persisted in every save, so this arithmetic is pinned by the
   save format rather than free to drift. */
function rotate(loc_col: number, loc_row: number, rotation: number): [number, number] {
  switch (rotation) {
    case 1: return [-loc_row, loc_col];
    case 2: return [-loc_col, -loc_row];
    case 3: return [loc_row, -loc_col];
    default: return [loc_col, loc_row];
  }
}

/* Redraws the circle WorldEnvironment.buildPetriDish stamps, from the same
   centre and radius, so a dish world's thumbnail is the dish and not the bare
   rectangle its save happens to store.

   Only the rim is painted as glass. In the world itself every cell outside the
   circle is invincible_wall, but the renderer draws that as page background
   with a lit ring at the edge -- so a minimap that filled the whole outside
   with the glass colour would show something the player has never seen. The
   void gets the empty colour, which is what the page behind it is. */
function stampPetriDish(cols: number, rows: number, cells: string[]): void {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const radius = Math.min(cols, rows) / 2 - 4;
  // buildPetriDish's own tier bounds: inner lip, main rim, outer shadow, void
  const RIM_OUTER = radius + 2.8;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const dist = Math.hypot(c - cx, r - cy);
      if (dist < radius - 0.5) continue; // inside the dish, world as loaded
      cells[c * rows + r] = dist < RIM_OUTER ? 'invincible_wall' : 'empty';
    }
  }
}

/* The world as one cell-state name per grid square, built in the order
   WorldEnvironment.loadRaw builds the live grid: terrain, then the dish over
   it, then organisms. The order matters -- the dish overwrites whatever the
   save stored outside the circle, exactly as buildPetriDish does to the live
   grid, and organisms land on top because they live inside it. */
export function rasterizeWorld(world: MinimapWorld): MinimapRaster {
  const cols = Number(world.grid.cols);
  const rows = Number(world.grid.rows);
  const cells: string[] = new Array(cols * rows).fill('empty');
  const at = (c: number, r: number) => (c >= 0 && c < cols && r >= 0 && r < rows ? c * rows + r : -1);

  for (const { c, r } of world.grid.food ?? []) {
    const i = at(c, r);
    if (i >= 0) cells[i] = 'food';
  }
  for (const { c, r } of world.grid.walls ?? []) {
    const i = at(c, r);
    if (i >= 0) cells[i] = 'wall';
  }
  if (world.petri_dish) stampPetriDish(cols, rows, cells);
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
export function downscaleRaster(
  { cols, rows, cells }: MinimapRaster,
  palette: MinimapPalette,
  box_w: number = MINIMAP_BOX_W,
  box_h: number = MINIMAP_BOX_H,
): MinimapImage {
  const scale = Math.min(box_w / cols, box_h / rows, 1);
  const width = Math.max(1, Math.round(cols * scale));
  const height = Math.max(1, Math.round(rows * scale));
  const rgba = new Uint8Array(width * height * 4);

  const colors = new Map<string, [number, number, number]>();
  const colorOf = (name: string) => {
    let c = colors.get(name);
    if (!c) colors.set(name, (c = parseColor(palette[name] ?? palette.common)));
    return c;
  };

  const counts = new Map<string, number>();
  for (let y = 0; y < height; y++) {
    const r0 = Math.floor((y * rows) / height);
    const r1 = Math.max(r0 + 1, Math.floor(((y + 1) * rows) / height));
    for (let x = 0; x < width; x++) {
      const c0 = Math.floor((x * cols) / width);
      const c1 = Math.max(c0 + 1, Math.floor(((x + 1) * cols) / width));

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
      const o = (y * width + x) * 4;
      rgba[o] = red; rgba[o + 1] = green; rgba[o + 2] = blue; rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba };
}

export function renderWorldMinimap(world: MinimapWorld, palette: MinimapPalette): MinimapImage {
  return downscaleRaster(rasterizeWorld(world), palette);
}

/* Browser half: the same image as a PNG data URL, for a world the user saves
   into their own storage. Node imports this module for the two functions above
   and never calls this one -- stripping types doesn't evaluate a body, so the
   canvas here costs it nothing. Returns null on a world with no grid to paint,
   which the picker shows as its fallback globe. */
export function minimapDataUrl(world: MinimapWorld, palette: MinimapPalette): string | null {
  const image = renderWorldMinimap(world, palette);
  if (!image.width || !image.height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}
