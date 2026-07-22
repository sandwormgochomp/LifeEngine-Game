const { test, expect } = require('./helpers/fixtures');

// The prefix word tables, mirrored from src/Utils/NameGenerator.ts. A generated
// name always begins with one of the lead cell's prefixes, so we assert the
// prefix belongs to the expected set rather than pinning the exact hashed word.
const PREFIXES = {
  killer:    ['Spike', 'Gore', 'Fang', 'Razor', 'Rend'],
  producer:  ['Glow', 'Bloom', 'Moss', 'Sun'],
  parasite:  ['Leech', 'Sap', 'Tick', 'Vamp'],
  common:    ['Blob', 'Nub', 'Squish', 'Bumble'],
};

// Run the exposed pure generator in the page.
const name = (page, cell_counts) =>
  page.evaluate(cc => window.generateOrganismName(cc), cell_counts);

const startsWithOneOf = (str, prefixes) => prefixes.some(p => str.startsWith(p));

test.describe('Organism name generator', () => {
  test('names describe the body plan, not a random string', async ({ page }) => {
    // Killer (highest priority) leads the name even against bulk producers.
    const n = await name(page, { killer: 1, producer: 10, mouth: 2 });
    expect(startsWithOneOf(n, PREFIXES.killer)).toBe(true);
    // A real compound word, not the old 10-char base36 noise.
    expect(n).toMatch(/^[A-Z][a-z]+$/);
    expect(n.length).toBeGreaterThan(4);
  });

  test('is deterministic: same composition -> same name', async ({ page }) => {
    const cc = { producer: 6, mouth: 3, mover: 1 };
    const a = await name(page, cc);
    const b = await name(page, cc);
    expect(a).toBe(b);
    // Key order must not matter (hash is order-independent).
    const c = await name(page, { mover: 1, mouth: 3, producer: 6 });
    expect(c).toBe(a);
  });

  test('different lead cells produce different flavored prefixes', async ({ page }) => {
    const grazer = await name(page, { producer: 8, mouth: 4 });
    expect(startsWithOneOf(grazer, PREFIXES.producer)).toBe(true);

    const hunter = await name(page, { killer: 3, mover: 4 });
    expect(startsWithOneOf(hunter, PREFIXES.killer)).toBe(true);

    expect(grazer).not.toBe(hunter);
  });

  test('single cell type still yields a valid whimsical name', async ({ page }) => {
    const n = await name(page, { common: 1 });
    expect(startsWithOneOf(n, PREFIXES.common)).toBe(true);
    // No awkward doubled word, and not the empty-body fallback.
    expect(n).not.toBe('Blobling');
    expect(n).toMatch(/^[A-Z][a-z]+$/);
  });

  test('empty body plan falls back to a default name', async ({ page }) => {
    expect(await name(page, {})).toBe('Blobling');
    // A count map of all zeros counts as empty too.
    expect(await name(page, { producer: 0, mouth: 0 })).toBe('Blobling');
  });
});

test.describe('FossilRecord.uniqueSpeciesName', () => {
  test('disambiguates colliding names with roman numerals', async ({ page }) => {
    const results = await page.evaluate(() => {
      const fr = window.fossilRecord;
      // Snapshot then seed a fake collision so the assertion is deterministic.
      const existed = fr.extant_species['Glowgrazer'];
      fr.extant_species['Glowgrazer'] = { name: 'Glowgrazer' };
      const first = fr.uniqueSpeciesName('Glowgrazer');
      // Register that disambiguated name, then ask again.
      fr.extant_species[first] = { name: first };
      const second = fr.uniqueSpeciesName('Glowgrazer');
      // A never-seen name is returned unchanged.
      const fresh = fr.uniqueSpeciesName('Zzzznonexistent');
      // Clean up so we don't pollute the shared singleton.
      delete fr.extant_species[first];
      if (existed) fr.extant_species['Glowgrazer'] = existed;
      else delete fr.extant_species['Glowgrazer'];
      return { first, second, fresh };
    });
    expect(results.first).toBe('Glowgrazer II');
    expect(results.second).toBe('Glowgrazer III');
    expect(results.fresh).toBe('Zzzznonexistent');
  });
});

test.describe('Species naming integration', () => {
  test('a freshly built organism is auto-named from its cells', async ({ page }) => {
    const generated = await page.evaluate(() => {
      const editor = window.engine.organism_editor;
      // Drop the preserved name so refreshSpecies regenerates from the anatomy.
      editor.organism.species = null;
      editor.refreshSpecies();
      return {
        n: editor.organism.species.name,
        // What the pure generator says for the same body plan.
        expected: window.generateOrganismName(editor.organism.species.cell_counts),
      };
    });
    // Not a random base36 blob; matches the generator for its composition.
    expect(generated.n).toBe(generated.expected);
    expect(generated.n).toMatch(/^[A-Z][a-z]+$/);
  });
});
