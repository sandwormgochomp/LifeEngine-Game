/* Worlds the user saved into this browser.

   Two-tier on purpose. The index is small and read every time the picker
   opens; the worlds themselves are hundreds of KB to several MB each and are
   read only when one is actually loaded. Keeping them in one blob would mean
   parsing every saved world to draw a list of names.

   localStorage gives an origin somewhere around 5MB total, which is less than
   a single big world (shrubland serializes to 6.4MB), so running out is a
   normal outcome here rather than an edge case -- see save(). */

const INDEX_KEY = 'life_engine.worlds.index';
const WORLD_PREFIX = 'life_engine.world.';

export interface SavedWorldMeta {
  id: string;
  name: string;
  cols: number;
  rows: number;
  organisms: number;
  saved_at: number;
  /* A minimap PNG as a data URL, painted by WorldMinimap the same way the
     build paints the bundled worlds. It lives in the index rather than beside
     the world so that the picker can draw every tile without reading a single
     multi-MB world back. */
  thumb: string | null;
}

const worldKey = (id: string) => WORLD_PREFIX + id;

/* Anything already in storage is user data from an older build or another
   tab, so every read tolerates junk instead of throwing into a render. */
export function list(): SavedWorldMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && typeof entry.id === 'string' && typeof entry.name === 'string');
  } catch {
    return [];
  }
}

function writeIndex(entries: SavedWorldMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function load(id: string): unknown | null {
  try {
    const raw = localStorage.getItem(worldKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* Throws when the world doesn't fit, which for a world of any size is the
   expected outcome rather than an exceptional one.

   The world is written first and the index second. setItem is all-or-nothing,
   so a failed world write leaves nothing to undo; the case worth handling is
   the index write failing on the world that just fit, which would otherwise
   orphan a multi-MB blob no listing can ever reach or delete. Writing the
   index first would instead leave the picker offering a world that isn't
   there. */
export function save(meta: Omit<SavedWorldMeta, 'id' | 'saved_at'>, world: unknown): SavedWorldMeta {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: SavedWorldMeta = { ...meta, id, saved_at: Date.now() };

  localStorage.setItem(worldKey(id), JSON.stringify(world));
  try {
    writeIndex([entry, ...list()]);
  } catch (err) {
    try { localStorage.removeItem(worldKey(id)); } catch { /* nothing to undo */ }
    throw err;
  }

  return entry;
}

export function remove(id: string): void {
  try {
    localStorage.removeItem(worldKey(id));
    writeIndex(list().filter(entry => entry.id !== id));
  } catch {
    /* Removal is best-effort: a browser that refuses to write here would
       refuse to save in the first place. */
  }
}

// A default name that doesn't collide with what's already saved
export function suggestName(existing: SavedWorldMeta[]): string {
  const taken = new Set(existing.map(entry => entry.name));
  for (let n = 1; ; n++) {
    const name = `My World ${n}`;
    if (!taken.has(name)) return name;
  }
}
