import React, { useEffect, useState } from 'react';
import styles from './styles/PerfPanel.module.css';
import Perf, { PERF_KEYS } from '../Stats/Perf';
import type { PerfStats } from '../Stats/Perf';
import type Engine from '../Engine';

interface PerfPanelProps {
  engine: Engine | null;
}

/* Label and indent depth per bucket, in PERF_KEYS display order. Depth mirrors
   the call structure: children of tick are sim-side, children of render are
   frame-side, grandchildren accumulate across organisms. */
const ROW_META: Record<string, { label: string; depth: number }> = {
  tick:       { label: 'tick',       depth: 0 },
  organisms:  { label: 'organisms',  depth: 1 },
  org_cells:  { label: 'cells',      depth: 2 },
  org_move:   { label: 'movement',   depth: 2 },
  pheromone:  { label: 'pheromone',  depth: 2 },
  fx:         { label: 'fx',         depth: 1 },
  fossil:     { label: 'fossil',     depth: 1 },
  render:     { label: 'render',     depth: 0 },
  cells_draw: { label: 'cells draw', depth: 1 },
  glow:       { label: 'glow',       depth: 1 },
  deco:       { label: 'deco',       depth: 1 },
  editor:     { label: 'editor',     depth: 0 },
  emit:       { label: 'emit',       depth: 0 },
};

const INDENT_CLASS = ['', styles.indent1, styles.indent2];

interface PanelSample {
  snap: Record<string, PerfStats>;
  tps: number;
  fps: number;
  organisms: number;
  cells: number;
}

const EMPTY_SAMPLE: PanelSample = { snap: {}, tps: 0, fps: 0, organisms: 0, cells: 0 };

const ms = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(2));

const PerfPanel: React.FC<PerfPanelProps> = ({ engine }) => {
  const [sample, setSample] = useState<PanelSample>(EMPTY_SAMPLE);

  /* Mounting the panel IS the enable switch: there is no way to leave the
     instrumentation running invisibly. Off also clears the buckets. */
  useEffect(() => {
    Perf.setEnabled(true);
    return () => Perf.setEnabled(false);
  }, []);

  /* The engine's 100ms-throttled emit is the refresh clock; it keeps firing
     while paused (the ui loop repaints for panning/editing), so the panel
     stays current in every state. Workload counters are computed here at
     ~10Hz rather than probed on the hot path. */
  useEffect(() => {
    if (!engine) return;
    const refresh = () => {
      let cells = 0;
      for (const org of engine.env.organisms) cells += org.anatomy.cells.length;
      setSample({
        snap: Perf.snapshot(),
        tps: engine.actual_tps,
        fps: engine.actual_fps,
        organisms: engine.env.organisms.length,
        cells,
      });
    };
    refresh();
    return engine.subscribe(refresh);
  }, [engine]);

  if (!engine) return null;

  // Per-tick budget at the current speed; the tick row goes red past it.
  const budget = engine.fps > 0 ? 1000 / engine.fps : 0;
  const tickAvg = sample.snap['tick']?.avg ?? 0;
  const dirty = sample.snap['dirty_cells'];

  return (
    <div className={styles.perfPanel} data-testid="perf-panel">
      <div className={styles.title}>PERF</div>
      <div className={styles.headerRow}>
        <span><span className={styles.headerLabel}>TPS </span><span className={styles.headerValue}>{Math.round(sample.tps)}</span></span>
        <span><span className={styles.headerLabel}>FPS </span><span className={styles.headerValue}>{Math.round(sample.fps)}</span></span>
        <span><span className={styles.headerLabel}>ORGS </span><span className={styles.headerValue}>{sample.organisms}</span></span>
        <span><span className={styles.headerLabel}>CELLS </span><span className={styles.headerValue}>{sample.cells}</span></span>
      </div>
      <div className={styles.headerRow}>
        <span><span className={styles.headerLabel}>DIRTY/FRAME </span><span className={styles.headerValue}>{dirty ? Math.round(dirty.avg) : '—'}</span></span>
        <span><span className={styles.headerLabel}>BUDGET </span><span className={styles.headerValue}>{budget > 0 ? `${budget.toFixed(1)}ms` : '—'}</span></span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr><th>SECTION</th><th>AVG</th><th>P95</th><th>MAX</th></tr>
        </thead>
        <tbody>
          {PERF_KEYS.map(key => {
            const meta = ROW_META[key];
            const stats = sample.snap[key];
            const over = key === 'tick' && budget > 0 && tickAvg > budget;
            return (
              <tr key={key} className={over ? styles.overBudget : undefined}>
                <td className={`${styles.rowLabel} ${INDENT_CLASS[meta.depth]}`}>{meta.label}</td>
                <td className={stats ? undefined : styles.dim}>{ms(stats?.avg)}</td>
                <td className={stats ? undefined : styles.dim}>{ms(stats?.p95)}</td>
                <td className={stats ? undefined : styles.dim}>{ms(stats?.max)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PerfPanel;
