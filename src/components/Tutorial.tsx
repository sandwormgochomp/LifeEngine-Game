import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './styles/Tutorial.module.css';
import type Engine from '../Engine';

/* The guided walkthrough: the game told as a short story, in eight chapters.

   It opens by itself on a browser's first visit (Utils/Tutorial) and from the
   TUTORIAL button any time after. Both entry points run the same eight beats;
   nothing about the world is different in either case, and the tutorial never
   loads, resets or reshapes anything -- it narrates whatever is already there,
   which is the same rule the first-run hints follow.

   --- why the chapters advance themselves ---

   Six of the eight ask the player to do something, and watch for them having
   done it rather than offering a "done" button. A tutorial whose Next button
   is the only way forward teaches the button, not the game: it is possible to
   read all eight chapters and never once click a lifeform. So each of those
   chapters names a piece of state, and the poll below advances when it moves --
   the camera starts following a line, the dock opens, a cell lands on the
   editor grid.

   The rule that keeps that from being a cage: **Next is always live**. A player
   who cannot find the thing, or does not want it, is one click from the next
   chapter, and ✕ ends the whole thing. Nothing here blocks input, dims the
   world, or refuses to let go -- the card is a panel down the left edge, clear
   of the tool palette, the toolbar and the event log, and every surface it
   points at stays clickable underneath it.

   --- what it watches, and why by polling ---

   Two of the signals are engine state (playback speed, the followed line) and
   four are React state owned by App (which window is open). Subscribing to both
   and reconciling them costs more than it buys at this cadence, so one interval
   reads a snapshot of each. It runs only while the card is open, and stops on
   the last chapter, which asks for nothing. */

// How often the open card checks whether the current chapter's ask is met.
// Fast enough to feel like a reaction, far below anything worth optimising.
const WATCH_MS = 150;

/* The slice of App's window state the chapters read. Passed down rather than
   reached for: these are React state, and the tutorial is a sibling of the
   components that own them. */
export interface TutorialUi {
    editorOpen: boolean;
    rulesOpen: boolean;
    activePanel: string | null;
}

interface StepContext {
    engine: Engine;
    ui: TutorialUi;
    /* Whatever this chapter's `baseline` returned when it began. Chapters that
       ask for a *change* (speed moved, a cell added) compare against it, so
       arriving with the thing already true does not skip the chapter. */
    baseline: number;
}

interface TutorialStep {
    id: string;
    chapter: string;
    title: string;
    body: string;
    /* The one line of instruction, set apart from the narration. Absent on the
       two chapters that only tell the story. */
    ask?: string;
    baseline?: (engine: Engine) => number;
    done?: (ctx: StepContext) => boolean;
}

/* The editor's current body-plan size, or -1 when there is no organism in the
   lab yet. -1 rather than 0 so that "the lab filled up" reads as a change. */
function editorCells(engine: Engine): number {
    return engine.organism_editor?.organism?.anatomy?.cells?.length ?? -1;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        chapter: 'In the beginning',
        title: 'One lifeform, in a dish',
        body:
            'Everything you are about to see descends from a single organism sitting in the middle of this ' +
            'petri dish. Nothing in here was designed to win. Things eat, things breed, and every copy is ' +
            'made slightly wrong — and whatever survives that, spreads.',
    },
    {
        id: 'speed',
        chapter: 'Time passes',
        title: 'Evolution is slow, so hurry it',
        body:
            'Nothing interesting happens in a hundred ticks. Wind the world forward and the dish fills, ' +
            'crowds, starves and recovers — usually more than once.',
        ask: 'Change the speed from the ladder in the top-left, or press Space.',
        baseline: engine => engine.speed_index,
        done: ctx => ctx.engine.speed_index !== ctx.baseline,
    },
    {
        id: 'sample',
        chapter: 'Meet one',
        title: 'Pick a lifeform out of the crowd',
        body:
            'Any of them will do. Clicking one starts following its line — it and every descendant it goes ' +
            'on to have, tinted so you can pick them out of the dish — and drops a copy into your lab.',
        ask: 'Click any organism in the world.',
        done: ctx => !!ctx.engine.env.lineage.following,
    },
    {
        id: 'lab',
        chapter: 'Look inside',
        title: 'Every colour is a job',
        body:
            'An organism is just a handful of coloured cells stuck together. Mouths eat, producers grow the ' +
            'food everything else lives on, movers walk, killers kill. The shape they are arranged in is the ' +
            'whole of its behaviour.',
        ask: 'Open the LAB from the bottom bar, or press X.',
        done: ctx => ctx.ui.editorOpen,
    },
    {
        id: 'edit',
        chapter: 'Make it yours',
        title: 'Change the body plan',
        body:
            'Pick a cell type off the rail and paint it onto the grid. You are editing a real organism — ' +
            'when it is finished, DEPLOY drops it into the dish to take its chances against everything ' +
            'already living there.',
        ask: 'Add or remove a cell on the lab grid.',
        baseline: editorCells,
        done: ctx => editorCells(ctx.engine) !== ctx.baseline,
    },
    {
        id: 'evolution',
        chapter: 'Change the laws',
        title: 'The world has rules, and they are yours',
        body:
            'Mutation rate, lifespan, how much food the world grows. Turn any of them and the dish answers ' +
            'within a few hundred ticks. Or play a Fate card and let a whole era do it — a long winter, a ' +
            'fertile crescent — and wind itself back when it ends.',
        ask: 'Open EVOLUTION from the bottom bar.',
        done: ctx => ctx.ui.rulesOpen,
    },
    {
        id: 'lineage',
        chapter: 'The record',
        title: 'Everything that ever lived',
        body:
            'Every species leaves a mark, including the ones that lasted forty ticks. The tree draws them as ' +
            'runs along a time axis, and each branch is the moment one species split off another. The line ' +
            'you are following is the bright one.',
        ask: 'Open LINEAGE from the bottom bar.',
        done: ctx => ctx.ui.activePanel === 'lineage',
    },
    {
        id: 'end',
        chapter: 'Now leave it alone',
        title: 'That is the whole game',
        body:
            'There is no goal and nothing to win. Set the rules you want, seed whatever you like, and watch ' +
            'what the dish does with it. You can read this again any time from TUTORIAL in the bottom bar.',
    },
];

interface TutorialProps {
    engine: Engine | null;
    open: boolean;
    onClose: () => void;
    ui: TutorialUi;
}

const Tutorial: React.FC<TutorialProps> = ({ engine, open, onClose, ui }) => {
    const [index, setIndex] = useState(0);
    /* Set for one beat when a chapter advances because the player did the
       thing, rather than because they clicked Next. Purely a bit of applause:
       it flashes the card so the two cases do not look identical. */
    const [satisfied, setSatisfied] = useState(false);

    /* The watcher runs off an interval, so everything it reads has to be a ref
       or it would close over the first render's values forever. */
    const uiRef = useRef(ui);
    uiRef.current = ui;
    const baselineRef = useRef(0);
    const indexRef = useRef(0);
    indexRef.current = index;

    const step = TUTORIAL_STEPS[index];
    const last = index === TUTORIAL_STEPS.length - 1;

    // Re-taken whenever the chapter changes, so a chapter that asks for a
    // *change* measures from the moment the player was asked.
    useEffect(() => {
        if (!engine || !open) return;
        const take = TUTORIAL_STEPS[index]?.baseline;
        baselineRef.current = take ? take(engine) : 0;
    }, [engine, open, index]);

    /* The flash is cleared on a timer rather than when the chapter changes --
       advancing is the very thing that raised it, so clearing it there would
       take the class off in the same commit that added it and the animation
       would never run. */
    useEffect(() => {
        if (!satisfied) return;
        const timer = window.setTimeout(() => setSatisfied(false), 500);
        return () => window.clearTimeout(timer);
    }, [satisfied]);

    const advance = useCallback(() => {
        setIndex(i => Math.min(i + 1, TUTORIAL_STEPS.length - 1));
    }, []);

    /* Restart from the top each time the card is opened. Resuming half way
       through a story is worse than reading it again, and the button exists
       precisely for people who want it from the beginning. */
    useEffect(() => {
        if (open) setIndex(0);
    }, [open]);

    useEffect(() => {
        if (!open || !engine) return;
        const done = TUTORIAL_STEPS[index]?.done;
        if (!done) return;
        const timer = window.setInterval(() => {
            // Guard on the ref: the interval outlives one render of `index`.
            if (indexRef.current !== index) return;
            const met = done({ engine, ui: uiRef.current, baseline: baselineRef.current });
            if (!met) return;
            setSatisfied(true);
            advance();
        }, WATCH_MS);
        return () => window.clearInterval(timer);
    }, [open, engine, index, advance]);

    if (!open) return null;

    return (
        <aside
            className={`${styles.tutorial} ${satisfied ? styles.tutorialAdvanced : ''}`}
            data-testid="tutorial"
            data-step={step.id}
            aria-label="Tutorial"
        >
            <header className={styles.tutorialHead}>
                <span className={styles.tutorialCount}>
                    Chapter {index + 1} of {TUTORIAL_STEPS.length}
                </span>
                <button
                    className={styles.tutorialClose}
                    data-testid="tutorial-skip"
                    title="Close the tutorial"
                    onClick={onClose}
                >
                    ✕
                </button>
            </header>

            <p className={styles.tutorialChapter}>{step.chapter}</p>
            <h2 className={styles.tutorialTitle}>{step.title}</h2>
            <p className={styles.tutorialBody}>{step.body}</p>

            {step.ask && (
                <p className={styles.tutorialAsk} data-testid="tutorial-ask">
                    <span className={styles.tutorialAskMark}>›</span> {step.ask}
                </p>
            )}

            {/* One pip per chapter: a story wants to show how much is left. */}
            <div className={styles.tutorialPips}>
                {TUTORIAL_STEPS.map((s, i) => (
                    <span
                        key={s.id}
                        className={`${styles.tutorialPip} ${i <= index ? styles.tutorialPipOn : ''}`}
                    />
                ))}
            </div>

            <footer className={styles.tutorialFoot}>
                <button
                    className={styles.tutorialBtn}
                    data-testid="tutorial-back"
                    disabled={index === 0}
                    onClick={() => setIndex(i => Math.max(0, i - 1))}
                >
                    Back
                </button>
                {/* Always live, including on a chapter that is waiting on the
                    player: the walkthrough must never be somewhere you are
                    stuck, only somewhere you are being shown around. */}
                <button
                    className={`${styles.tutorialBtn} ${styles.tutorialBtnGo}`}
                    data-testid="tutorial-next"
                    onClick={last ? onClose : advance}
                >
                    {last ? 'Finish' : 'Next'}
                </button>
            </footer>
        </aside>
    );
};

export default Tutorial;
