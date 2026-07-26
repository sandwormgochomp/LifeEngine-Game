import React, { useMemo } from 'react';
import styles from './styles/LineageAncestry.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import Phylogeny from '../Stats/Phylogeny';
import FossilRecord from '../Stats/FossilRecord';
import OrganismThumb, { type ThumbCell } from './OrganismThumb';

/* "Where this line came from": the followed species' ancestry, root first, as a
   row of body plans.

   Phylogeny splices out extinct pass-through species, so consecutive thumbs are
   usually not consecutive species -- the badge between two of them is how many
   were compressed away on that edge. Showing the chain without it would claim a
   direct descent that never happened.

   Only the ancestors are drawn: the card above already shows the founder. */

// Thumbs, excluding the followed species. Beyond this the middle is elided into
// the badges, which is exactly what the badges are for.
const MAX_LINKS = 4;

interface LineageAncestryProps {
  engine: Engine | null;
  // 0 when the followed line has no species-level identity.
  speciesId: number;
}

interface AncestryLink {
  id: number;
  name: string;
  cells: ThumbCell[] | null;
  // Species between this thumb and the one before it: those compressed out of
  // the edge, plus any elided to fit MAX_LINKS.
  gap: number;
}

interface Ancestry {
  links: AncestryLink[];
  // Species between the last thumb and the followed species itself.
  tail_gap: number;
}

const EMPTY: Ancestry = { links: [], tail_gap: 0 };

/* An extinct node carries its own snapshot; a live one does not, because
   snapshotting every speciation would allocate at very nearly the birth rate.
   The live anatomy is read here at render time and never stored. */
function cellsFor(id: number): ThumbCell[] | null {
  const node = Phylogeny.get(id);
  if (!node) return null;
  if (node.cells) return node.cells as ThumbCell[];
  const live = FossilRecord.extant_species[node.name];
  return (live?.anatomy?.cells as ThumbCell[] | undefined) ?? null;
}

function buildAncestry(speciesId: number): Ancestry {
  if (!speciesId) return EMPTY;
  const chain = Phylogeny.ancestorsOf(speciesId);
  // chain is root..self; the last entry is the followed species itself.
  const ancestors = chain.slice(0, -1);
  if (!ancestors.length) return EMPTY;

  // Keep the root and the most recent few; everything between is elided.
  const keep = new Set<number>();
  if (ancestors.length <= MAX_LINKS) {
    for (const n of ancestors) keep.add(n.id);
  } else {
    keep.add(ancestors[0].id);
    for (const n of ancestors.slice(-(MAX_LINKS - 1))) keep.add(n.id);
  }

  const links: AncestryLink[] = [];
  let pending = 0;
  for (const node of ancestors) {
    pending += node.collapsed;
    if (keep.has(node.id)) {
      links.push({ id: node.id, name: node.name, cells: cellsFor(node.id), gap: pending });
      pending = 0;
    } else {
      pending += 1;
    }
  }
  const self = chain[chain.length - 1];
  return { links, tail_gap: pending + self.collapsed };
}

const LineageAncestry: React.FC<LineageAncestryProps> = ({ engine, speciesId }) => {
  /* A string, not the chain itself: useEngineValue compares with Object.is, so
     a fresh array would re-render on every engine emit. This changes only when
     the shape of the chain does, which is what the memo below keys on. */
  const signature = useEngineValue(
    engine,
    () => {
      if (!speciesId) return '';
      let sig = '';
      for (const n of Phylogeny.ancestorsOf(speciesId)) sig += `${n.id}.${n.collapsed}|`;
      return sig;
    },
    ''
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the
  // derived identity of exactly what buildAncestry reads.
  const ancestry = useMemo(() => buildAncestry(speciesId), [signature, speciesId]);

  if (!ancestry.links.length) return null;

  return (
    <div className={styles.ancestry} data-testid="lineage-ancestry">
      <span className={styles.ancestryLabel}>DESCENDED FROM</span>
      <div className={styles.ancestryRow}>
        {ancestry.links.map((link, i) => (
          <React.Fragment key={link.id}>
            {(i > 0 || link.gap > 0) && <Gap count={link.gap} />}
            <span className={styles.ancestryThumb} title={link.name}>
              {link.cells
                ? <OrganismThumb cells={link.cells} size={20} />
                : <span className={styles.ancestryUnknown}>?</span>}
            </span>
          </React.Fragment>
        ))}
        <Gap count={ancestry.tail_gap} />
        <span className={styles.ancestryHere}>◉</span>
      </div>
    </div>
  );
};

// The edge between two thumbs. A plain arrow when nothing was compressed out of
// it; otherwise the count of what was.
const Gap: React.FC<{ count: number }> = ({ count }) =>
  count > 0
    ? <span className={styles.ancestryGap} title={`${count} species between`}>+{count}</span>
    : <span className={styles.ancestryArrow}>›</span>;

export default LineageAncestry;
