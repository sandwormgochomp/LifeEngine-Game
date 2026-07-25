import React, { useEffect, useRef } from 'react';
import styles from './styles/CellHoverPreview.module.css';
import PreviewEnvironment from '../Environments/PreviewEnvironment';
import { PREVIEW_SCENARIOS, PREVIEW_COLS, PREVIEW_ROWS, PREVIEW_CELL } from './cellPreviews';
import type { LivingCellName } from '../Organism/Cell/CellStates';

interface CellHoverPreviewProps {
    name: LivingCellName;
    description: string;
    // The hovered palette button's viewport rect, used to float the popover.
    anchor: DOMRect;
}

// Backing store is the grid's native pixel size; CSS scales it down to this
// display width (height follows the grid's aspect ratio), pixelated.
const BACKING_W = PREVIEW_COLS * PREVIEW_CELL;
const BACKING_H = PREVIEW_ROWS * PREVIEW_CELL;
const DISPLAY_W = 176;
const DISPLAY_H = Math.round(DISPLAY_W * BACKING_H / BACKING_W);

// Sim tick period. ~17 ticks/sec reads as brisk without blurring the action;
// organisms move one cell per tick.
const TICK_MS = 58;
// Cap catch-up so a backgrounded/paused tab doesn't fast-forward on return.
const MAX_STEPS_PER_FRAME = 4;

const VIEWPORT_MARGIN = 12;

/* A floating popover that plays a live, real-mechanics simulation of a cell
   type's signature behaviour while its palette button is hovered. It owns a
   throwaway PreviewEnvironment, seeds it from the cell's scenario, and drives
   tick()/render() on a requestAnimationFrame loop, re-seeding every loopTicks.
   The box is inert (pointer-events: none, in CSS) so moving the cursor off the
   button still fires its mouseleave and dismisses the preview. */
const CellHoverPreview: React.FC<CellHoverPreviewProps> = ({ name, description, anchor }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const env = new PreviewEnvironment(PREVIEW_COLS, PREVIEW_ROWS, PREVIEW_CELL);
        env.bindCanvas(canvas);
        const scenario = PREVIEW_SCENARIOS[name];

        let tick = 0;
        const reset = () => {
            env.clearScene();
            scenario.setup(env);
            tick = 0;
        };
        reset();

        let raf = 0;
        let last = 0;
        let acc = 0;
        const frame = (now: number) => {
            if (!last) last = now;
            acc += now - last;
            last = now;
            let steps = 0;
            while (acc >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
                env.tick();
                tick++;
                scenario.onTick?.(env, tick);
                if (tick >= scenario.loopTicks) reset();
                acc -= TICK_MS;
                steps++;
            }
            if (acc > TICK_MS * MAX_STEPS_PER_FRAME) acc = 0; // shed backlog
            env.render();
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            env.releaseCanvas();
        };
    }, [name]);

    // The rail is the dock's left edge and the dock is pinned to the screen's
    // right, so float the preview to the LEFT of the button -- it lands over the
    // world rather than covering the lab. Vertically centre it on the button,
    // then clamp so it never runs under the bottom toolbar (which the dock
    // clears by ~76px) even for cells low in the rail.
    const POPOVER_H = DISPLAY_H + 78; // canvas + name + description + padding
    const BOTTOM_RESERVE = 84;
    const left = Math.max(VIEWPORT_MARGIN, anchor.left - DISPLAY_W - 22);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - POPOVER_H - BOTTOM_RESERVE);
    const centered = anchor.top + anchor.height / 2 - POPOVER_H / 2;
    const top = Math.min(Math.max(VIEWPORT_MARGIN, centered), maxTop);

    return (
        <div className={styles.cellPreviewPop} style={{ left, top, width: DISPLAY_W }} data-testid="cell-preview">
            <canvas
                ref={canvasRef}
                width={BACKING_W}
                height={BACKING_H}
                className={styles.cellPreviewCanvas}
                style={{ width: DISPLAY_W, height: DISPLAY_H }}
            />
            <div className={styles.cellPreviewName}>{name}</div>
            <div className={styles.cellPreviewDesc}>{description}</div>
        </div>
    );
};

export default CellHoverPreview;
