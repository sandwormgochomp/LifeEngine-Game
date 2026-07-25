import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './styles/Hud.module.css';
import type Engine from '../Engine';
import FossilRecord from '../Stats/FossilRecord';
import type Species from '../Stats/Species';
import type Anatomy from '../Organism/Anatomy';
import OrganismThumb from './OrganismThumb';

/* Species.anatomy is a real Anatomy, but nullable: WorldEnvironment.loadRaw
   briefly holds a species with none while it rebuilds a save. That window is
   closed before any organism references the species, so everything reachable
   from the fossil record has one -- which is what the cards render and
   serialize. This narrows away only the null, at the one place it is read. */
type LiveSpecies = Species & { anatomy: Anatomy };

interface Entry {
  name: string;
  species: LiveSpecies;
  population: number;
  extinct: boolean;
}

interface LifeformsModalProps {
  engine: Engine | null;
  /* A species to surface, set when the picker was opened by a notification
     rather than from the toolbar. Its card is ringed, and -- the reason this
     exists -- a name that is no longer extant is recovered from the fossil
     record and listed as extinct. Without that, clicking "the Vexil line went
     extinct" opens a picker that does not contain Vexil. */
  highlight?: string | null;
  onClose: () => void;
  onOpenInLab: (raw: unknown, name: string) => void;
}

const sameList = (a: Entry[], b: Entry[]) =>
  a.length === b.length &&
  a.every((e, i) => e.name === b[i].name && e.population === b[i].population && e.extinct === b[i].extinct);

const LifeformsModal: React.FC<LifeformsModalProps> = ({ engine, highlight, onClose, onOpenInLab }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  // While the pointer is over the grid, extinct species stay in place (marked)
  // instead of being removed, so cards never shift out from under a click.
  const hovering = useRef(false);

  const refresh = useCallback(() => {
    const live = (FossilRecord.extant_species ?? {}) as Record<string, LiveSpecies>;
    setEntries(prev => {
      const next: Entry[] = [];
      const seen = new Set<string>();

      // Existing cards keep their slot; ordering never changes for a species
      // that is already on screen. Match on the species *object*, not the name:
      // generated names describe the body plan, so a reseeded identical organism
      // reclaims the dead one's name -- identity is what tells them apart.
      for (const entry of prev) {
        const species = live[entry.name];
        if (species && species === entry.species) {
          next.push({ ...entry, species, population: species.population, extinct: false });
          seen.add(entry.name);
        } else if (hovering.current || entry.name === highlight) {
          // The highlighted species keeps its slot unconditionally: it is the
          // one the player was sent here to look at, and it is usually the one
          // that just died.
          next.push({ ...entry, extinct: true });
          seen.add(entry.name);
        }
      }

      // New species append in order of first appearance, so nothing reflows
      const born = Object.values(live)
        .filter(species => !seen.has(species.name))
        .sort((a, b) => (a.start_tick ?? 0) - (b.start_tick ?? 0));
      for (const species of born) {
        next.push({ name: species.name, species, population: species.population, extinct: false });
      }

      /* Recover the highlighted species from the fossil record when it is no
         longer extant. Appended rather than prepended so the living list keeps
         the order it always had; the ring and the scroll below are what make it
         findable. Seeded once -- the loop above holds the slot afterwards. */
      if (highlight && !seen.has(highlight)) {
        const dead = (FossilRecord.extinct_species ?? {})[highlight] as LiveSpecies | undefined;
        if (dead?.anatomy) {
          next.push({ name: highlight, species: dead, population: 0, extinct: true });
        }
      }

      return sameList(prev, next) ? prev : next;
    });
  }, [highlight]);

  useEffect(() => {
    refresh();
    return engine?.subscribe(refresh);
  }, [engine, refresh]);

  const setHovering = (value: boolean) => {
    hovering.current = value;
    if (!value) refresh(); // prune anything that died while the cursor was inside
  };

  const livingCount = entries.filter(e => !e.extinct).length;

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="lifeforms-modal">
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            <i className="fa-solid fa-bacteria" style={{ marginRight: '8px' }}></i>
            LIFEFORMS ({livingCount})
          </span>
          <button className={styles.panelClose} onClick={onClose} title="Close (Esc)">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div
          className={styles.pickerGrid}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {entries.length === 0 && (
            <p className={styles.pickerEmpty}>No living species right now — deploy something from the Organism Lab.</p>
          )}
          {entries.map(entry => (
            <button
              key={entry.name}
              /* Scroll the highlighted card into view the moment it mounts. A
                 grown world's list is long, and a ring you have to scroll to
                 find is not a destination. */
              ref={entry.name === highlight
                ? el => el?.scrollIntoView({ block: 'nearest' })
                : undefined}
              className={[
                'lifeform-card',
                styles.pickerCard,
                entry.extinct ? styles.pickerCardExtinct : '',
                entry.name === highlight ? styles.pickerCardHighlight : '',
              ].filter(Boolean).join(' ')}
              data-extinct={entry.extinct ? 'true' : 'false'}
              data-highlight={entry.name === highlight ? 'true' : 'false'}
              title={entry.extinct
                ? 'This species just died out — its design can still be opened'
                : 'Open this species in the Organism Lab'}
              onClick={() => onOpenInLab(
                { anatomy: entry.species.anatomy.serialize(), species_name: entry.name },
                entry.name
              )}
            >
              <OrganismThumb cells={entry.species.anatomy.cells} decorated />
              <span className={`lifeform-name ${styles.pickerName}`}>{entry.name}</span>
              <span className={styles.pickerMeta}>
                {entry.extinct
                  ? 'extinct'
                  : `pop ${entry.population} · ${entry.species.anatomy.cells.length} cells`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LifeformsModal;
