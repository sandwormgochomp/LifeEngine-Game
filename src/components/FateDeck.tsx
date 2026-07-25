import React, { useEffect, useRef, useState } from 'react';
import hud from './styles/Hud.module.css';
import styles from './styles/FateDeck.module.css';
import useEngineValue from './useEngineValue';
import type Engine from '../Engine';
import { FATE_CARDS, cardTicksLeft } from '../Evolution/FateCards';
import type { FateCard } from '../Evolution/FateCards';

export interface FateDeckProps {
  engine: Engine | null;
  /** Called after a card writes through to Hyperparams, so sibling tabs resync */
  onParamsChanged: () => void;
}

/* How long a played card holds its flip-and-flash. Long enough to register as a
   moment rather than a click, short enough that dealing three cards in a row
   never leaves the player waiting on the animation. */
const FLASH_MS = 620;

/* The Fate Deck tab — concepts/evolution-window-overhauls.md, overhaul 4.
   Cards you play at the world instead of settings you adjust; the effects and
   the guardrail they are built to live in src/Evolution/FateCards.ts. */
const FateDeck: React.FC<FateDeckProps> = ({ engine, onParamsChanged }) => {
  /* One subscription for the whole hand. A countdown is ends_at minus the
     clock, so it has to be re-read on every engine change -- but getSnapshot is
     compared with Object.is, so it must hand back a primitive or a fresh array
     would re-render forever. The hand's remaining ticks are folded into one
     string instead, which has the happy side effect that a world with no card
     running re-renders this tab not at all. */
  const live_sig = useEngineValue(
    engine,
    e => FATE_CARDS.map(c => cardTicksLeft(c, e.env)).join(','),
    '');
  const live = live_sig ? live_sig.split(',').map(Number) : FATE_CARDS.map(() => 0);

  const [flashed, setFlashed] = useState<string | null>(null);
  const flash_timer = useRef<number | undefined>(undefined);
  // Bumped per play so the key below changes even when the same card is
  // replayed; a CSS animation only restarts if its node is remounted.
  const flash_seq = useRef(0);

  useEffect(() => () => window.clearTimeout(flash_timer.current), []);

  const play = (card: FateCard) => {
    if (!engine) return;
    card.apply(engine.env);
    /* The Console mirrors Hyperparams in React state and a card writes the
       singleton directly, so without this its dials and fold would keep showing
       the pre-card numbers until something else happened to resync them. */
    onParamsChanged();
    window.clearTimeout(flash_timer.current);
    flash_seq.current++;
    setFlashed(card.id);
    flash_timer.current = window.setTimeout(() => setFlashed(null), FLASH_MS);
  };

  // Call an era off early, winding its parameters back the same way expiry
  // would. Its own button rather than a second meaning for clicking the card,
  // which already means "play again, from now".
  const endNow = (card: FateCard) => {
    if (!engine) return;
    engine.env.endWorldEvent(card.id);
    onParamsChanged();
  };

  return (
    <div className={styles.deckBody} data-testid="fate-deck">
      <p className={`${hud.ctrlNote} ${styles.deckNote}`}>
        Every card is a pressure, never a result: it changes what the world rewards
        and leaves the choosing to the world. Timed cards wind themselves back.
      </p>

      <div className={styles.deck}>
        {FATE_CARDS.map((card, i) => {
          const left = live[i];
          const running = left > 0;
          const tone = styles[card.tone];
          const classes = [styles.card, tone, running ? styles.cardLive : '', flashed === card.id ? styles.cardPlayed : ''];
          return (
            <div
              // Remounting on play is what restarts the flip animation; see flash_seq.
              key={flashed === card.id ? `${card.id}-${flash_seq.current}` : card.id}
              className={classes.filter(Boolean).join(' ')}
              data-testid={`fate-card-${card.id}`}
              data-live={running}
            >
              {card.ticks > 0 && (
                <span className={styles.timed} data-testid={`fate-timer-${card.id}`}>
                  {(running ? left : card.ticks).toLocaleString('en-US')} TK
                </span>
              )}
              <button
                id={`fate-card-${card.id}`}
                className={styles.cardFace}
                onClick={() => play(card)}
                title={
                  running
                    ? `${card.name} is running — ${left.toLocaleString('en-US')} ticks left. Play it again to extend the era from now.`
                    : `Play ${card.name}: ${card.rules.join(' · ')}`
                }
              >
                <span className={styles.cardArt} aria-hidden="true">{card.glyph}</span>
                <span className={styles.cardName}>{card.name}</span>
                <span className={styles.cardRules}>
                  {card.rules.map(rule => <span key={rule}>{rule}</span>)}
                </span>
                <span className={`${styles.cardFlavor} ${running ? styles.cardRunning : ''}`}>
                  {running ? 'RUNNING · PLAY TO EXTEND' : card.flavor}
                </span>
              </button>
              {running && (
                <button
                  id={`fate-end-${card.id}`}
                  className={styles.cardEnd}
                  onClick={() => endNow(card)}
                  title={`End ${card.name} now and put every parameter it holds back`}
                >
                  ✕ END
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FateDeck;
