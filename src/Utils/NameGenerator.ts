import type { CellCountMap } from "../Stats/Species";

/* Turns an organism's cell composition into a whimsical compound name such as
   "Glowgrazer" (producer + mouth) or "Spikeback" (killer + armor).

   The name is a Prefix + Suffix mashup:
     - the Prefix comes from the organism's most *character-defining* cell, so a
       lone killer outweighs a wall of producers (see PRIORITY);
     - the Suffix comes from its most *abundant* other cell (its bulk tissue),
       falling back to a generic creature ending when there's nothing else.

   It is deterministic on purpose -- the same body plan always yields the same
   name -- so we vary word choice with a stable hash of the cell counts rather
   than Math.random(). Uniqueness across the whole simulation is not this
   module's job; FossilRecord.uniqueSpeciesName disambiguates collisions with a
   roman-numeral suffix. */

// Highest priority first: the further left a present cell sits, the more it
// defines the creature's identity (and wins the prefix). Aggressive/rare cells
// outrank passive bulk tissue.
const PRIORITY: string[] = [
    'killer', 'parasite', 'explosive', 'shooter', 'poison', 'chameleon',
    'healer', 'mover', 'eye', 'producer', 'mouth', 'armor', 'pheromone', 'common',
];

const PREFIXES: Record<string, string[]> = {
    killer:    ['Spike', 'Gore', 'Fang', 'Razor', 'Rend'],
    parasite:  ['Leech', 'Sap', 'Tick', 'Vamp'],
    explosive: ['Boom', 'Nitro', 'Fuse', 'Kaboom'],
    shooter:   ['Zap', 'Dart', 'Bolt', 'Sling'],
    poison:    ['Venom', 'Toxi', 'Blight', 'Murk'],
    chameleon: ['Shade', 'Phantom', 'Ghost', 'Wisp'],
    healer:    ['Balm', 'Mend', 'Sooth', 'Vital'],
    mover:     ['Skitter', 'Dash', 'Flit', 'Zoom'],
    eye:       ['Peep', 'Gaze', 'Watch', 'Ogle'],
    mouth:     ['Gob', 'Maw', 'Chomp', 'Grub'],
    producer:  ['Glow', 'Bloom', 'Moss', 'Sun'],
    armor:     ['Iron', 'Shell', 'Plate', 'Crag'],
    pheromone: ['Whiff', 'Scent', 'Musk', 'Reek'],
    common:    ['Blob', 'Nub', 'Squish', 'Bumble'],
};

const SUFFIXES: Record<string, string[]> = {
    killer:    ['fang', 'maw', 'claw', 'ripper'],
    parasite:  ['lurker', 'tick', 'drain', 'leech'],
    explosive: ['bomb', 'blast', 'burst', 'kaboom'],
    shooter:   ['shot', 'gunner', 'dart', 'slinger'],
    poison:    ['toad', 'wort', 'spine', 'fume'],
    chameleon: ['wraith', 'shade', 'ghost', 'phantom'],
    healer:    ['nurse', 'tender', 'medic', 'mender'],
    mover:     ['stalker', 'runner', 'dasher', 'skimmer'],
    eye:       ['watcher', 'seer', 'gazer', 'peeper'],
    mouth:     ['grazer', 'muncher', 'chomper', 'gob'],
    producer:  ['blossom', 'sprout', 'bloom', 'frond'],
    armor:     ['back', 'hide', 'shell', 'plate'],
    pheromone: ['signal', 'wafter', 'whiffer', 'reeker'],
    common:    ['ling', 'pod', 'bug', 'beast'],
};

// Generic endings used when there's no distinct secondary cell (single cell
// type), or when the trait-based suffix would awkwardly echo the prefix.
const GENERIC_SUFFIX: string[] = ['ling', 'pod', 'bug', 'beast', 'kin', 'oid'];

const FALLBACK = 'Blobling';

// Stable, order-independent hash of the cell composition (FNV-1a over the
// sorted "name:count" pairs). Same body plan -> same seed -> same words.
function hashCounts(cell_counts: CellCountMap): number {
    const key = Object.keys(cell_counts)
        .filter(n => (cell_counts[n] || 0) > 0)
        .sort()
        .map(n => `${n}:${cell_counts[n]}`)
        .join('|');
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pick(words: string[], seed: number): string {
    return words[seed % words.length];
}

export function generateOrganismName(cell_counts: CellCountMap): string {
    // Present living cells, ordered by how much they define the creature.
    const present = PRIORITY.filter(n => (cell_counts[n] || 0) > 0);
    if (present.length === 0) return FALLBACK;

    const lead = present[0];

    // Secondary = the most abundant present cell that isn't the lead.
    let secondary: string | null = null;
    let best = 0;
    for (const n of present) {
        if (n === lead) continue;
        const count = cell_counts[n] || 0;
        if (count > best) { best = count; secondary = n; }
    }

    const seed = hashCounts(cell_counts);
    const prefix = pick(PREFIXES[lead], seed);
    let suffix = secondary
        ? pick(SUFFIXES[secondary], seed >>> 3)
        : pick(GENERIC_SUFFIX, seed >>> 3);

    // Dodge clumsy echoes like "Shadeshade" or "Grubgob".
    const p = prefix.toLowerCase();
    const s = suffix.toLowerCase();
    if (p === s || p.endsWith(s) || s.endsWith(p)) {
        suffix = pick(GENERIC_SUFFIX, seed >>> 5);
    }

    return prefix + suffix;
}

export default generateOrganismName;
