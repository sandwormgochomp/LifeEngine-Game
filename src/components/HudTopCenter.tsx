import React from 'react';
import styles from './styles/Hud.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import FossilRecord from '../Stats/FossilRecord';
import { FATE_CARDS } from '../Evolution/FateCards';
import type { CardTone } from '../Evolution/FateCards';

interface HudTopCenterProps {
  engine: Engine | null;
  onLifeformsClick?: () => void;
}

interface EventBadge {
  glyph: string;
  label: string;
  tone: CardTone;
}

/* Every timed world event that earns a chip under the stats bar, keyed by the
   `kind` its WorldEvent runs under.

   The Fate Deck's half is derived from the deck rather than transcribed, so a
   new card gets its chip, its glyph and its suit colour for free. Cards with
   ticks: 0 -- the Cull, Green Sun -- never enqueue an event at all, so they are
   dropped here instead of being listed with a countdown they could never show.
   The three weather events are named by hand because they are played from the
   tool palette and have no card to read. */
const EVENT_BADGES: Record<string, EventBadge> = {
  bloom: { glyph: '✿', label: 'Bloom', tone: 'verdant' },
  iceage: { glyph: '❄', label: 'Ice Age', tone: 'cold' },
  radstorm: { glyph: '☢', label: 'Rad Storm', tone: 'hot' },
  ...Object.fromEntries(FATE_CARDS
    .filter(card => card.ticks > 0)
    .map(card => [card.id, { glyph: card.glyph, label: card.name, tone: card.tone }])),
};

const HudTopCenter: React.FC<HudTopCenterProps> = ({ engine, onLifeformsClick }) => {
  const gen = useEngineValue(engine, e => e.env.total_ticks, 0);
  const pop = useEngineValue(engine, e => e.env.organisms.length, 0);
  const lifeforms = useEngineValue(engine, () => FossilRecord.numExtantSpecies(), 0);
  const isNight = useEngineValue(engine, e => Boolean(e.env?.is_night), false);

  /* One subscription for every live event, in the order they were played.
     Countdowns are derived per emit rather than stored anywhere -- ends_at is
     absolute, so a countdown is just a subtraction -- but getSnapshot is
     compared with Object.is, so it hands back a joined string instead of a
     fresh array that would re-render forever. Same trick as the Fate Deck tab.
     Events with no badge (none today) are dropped here so the parse below can
     assume one. */
  const live_sig = useEngineValue(engine, e => e.env.active_events
    .filter(ev => EVENT_BADGES[ev.kind])
    .map(ev => `${ev.kind}:${Math.max(0, ev.ends_at - e.env.total_ticks)}`)
    .join(','), '');
  const live = live_sig ? live_sig.split(',').map(entry => {
    const [kind, left] = entry.split(':');
    return { kind, left: Number(left), ...EVENT_BADGES[kind] };
  }) : [];

  return (
    <div className={styles.topCenter}>
      <div className={styles.statsBar}>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>GEN:</span>
          <span className={styles.statValue}>{gen.toLocaleString()}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <span className={styles.statItem}>
          <span className={styles.statLabel}>POP:</span>
          <span className={styles.statValue}>{pop.toLocaleString()}</span>
        </span>
        <span className={styles.statDivider}>|</span>
        <button
          id="lifeforms-stat"
          className={`${styles.statItem} ${styles.statButton}`}
          title="Browse all living species and open one in the Organism Lab"
          onClick={onLifeformsClick}
        >
          <span className={styles.statLabel}>LIFEFORMS:</span>
          <span className={styles.statValue}>{lifeforms.toLocaleString()}</span>
        </button>
        <span className={styles.statDivider}>|</span>
        <button
          id="day-night-toggle"
          className={`${styles.statItem} ${styles.statButton}`}
          title={
            isNight
              ? 'NIGHT TIME: Click to switch to Day mode (Sunlight)'
              : 'DAY TIME: Click to switch to Night mode (Darkness)'
          }
          onClick={() => {
            if (engine?.env?.setNightMode) {
              engine.env.setNightMode(!isNight);
            }
          }}
        >
          {isNight ? (
            <span className={styles.statValue} style={{ color: '#87ceeb' }}>
              <i className="fa-solid fa-moon" style={{ marginRight: '5px' }} />
              NIGHT
            </span>
          ) : (
            <span className={styles.statValue} style={{ color: '#ffd700' }}>
              <i className="fa-solid fa-sun" style={{ marginRight: '5px' }} />
              DAY
            </span>
          )}
        </button>
      </div>
      {live.length > 0 && (
        <div className={styles.eventTickers} data-testid="event-tickers">
          {live.map(ev => (
            <div
              key={ev.kind}
              className={`${styles.eventTicker} ${styles[ev.tone]}`}
              data-testid={`${ev.kind}-countdown`}
              title={`${ev.label} is running — ticks until it lifts and the world goes back to what it was`}
            >
              <span>{ev.glyph} {ev.label.toUpperCase()}</span>
              <span className={styles.eventTickerValue}>{ev.left.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HudTopCenter;
