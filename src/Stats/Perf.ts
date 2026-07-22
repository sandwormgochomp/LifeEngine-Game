/* Lightweight timing instrumentation for the sim/render loops. Probes are
   compiled in permanently but gated behind a single `enabled` flag that the
   perf panel flips on mount/unmount -- while the panel is closed every probe
   costs one property read and a branch, and no sample memory is touched.

   The API is begin/end rather than a wrap-a-callback helper on purpose: the
   hottest probes sit inside Organism.update(), which runs once per organism
   per tick, and a closure allocation there would be measurable noise in the
   very numbers this module exists to collect. */

export const PERF_WINDOW = 120; // samples retained per bucket

/* Display order for the panel, and the single source of truth for bucket
   names. Indentation in the comments mirrors the parent/child structure the
   panel renders: children of `tick` are sim-side, children of `render` are
   frame-side. */
export const PERF_KEYS = [
    'tick',        // whole env.update()
    'organisms',   //   organism loop + removeOrganisms
    'org_cells',   //     performFunction loop (accumulated across organisms)
    'org_move',    //     mover block (accumulated across organisms)
    'pheromone',   //     emitPheromoneSignal (accumulated across organisms)
    'fx',          //   explosions + projectiles
    'fossil',      //   FossilRecord.updateData -- every 100 ticks, so its
                   //   cost shows up in the max column rather than the avg
    'render',      // whole env.render()
    'cells_draw',  //   renderer.renderCells()
    'glow',        //   renderGlow() -- dirty-flag gated, watch max not avg
    'deco',        //   renderDecorations() -- same
    'editor',      // organism_editor.update()
    'emit',        // emitChange() synchronous listener cost
] as const;

export type PerfKey = typeof PERF_KEYS[number];

export interface PerfStats {
    avg: number;
    p95: number;
    max: number;
    last: number;
}

/* A ring of committed samples plus a per-tick/frame accumulator. Sections that
   run many times per tick (the per-organism probes) accumulate into `acc` and
   only enter the ring as one combined sample when commit() flushes them. */
class Bucket {
    samples = new Float64Array(PERF_WINDOW);
    idx = 0;         // ring write head
    count = 0;       // fill level, saturates at PERF_WINDOW
    acc = 0;         // accumulated time since the last commit
    touched = false; // whether acc holds anything this tick/frame

    push(v: number): void {
        this.samples[this.idx] = v;
        this.idx = (this.idx + 1) % PERF_WINDOW;
        if (this.count < PERF_WINDOW) this.count++;
    }

    stats(): PerfStats {
        const n = this.count;
        if (n === 0) return { avg: 0, p95: 0, max: 0, last: 0 };
        /* Sorting a copy of <=120 floats at the panel's ~10Hz refresh is
           trivial; nothing here runs on the hot path. */
        const sorted = Array.from(this.samples.subarray(0, n)).sort((a, b) => a - b);
        let sum = 0;
        for (const v of sorted) sum += v;
        const last_idx = (this.idx - 1 + PERF_WINDOW) % PERF_WINDOW;
        return {
            avg: sum / n,
            p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
            max: sorted[n - 1],
            last: this.samples[last_idx],
        };
    }
}

const Perf = {
    enabled: false,
    buckets: new Map<string, Bucket>(),

    /* Turning off also clears the buckets, so reopening the panel never shows
       stale numbers from a different world or speed setting. */
    setEnabled(on: boolean): void {
        this.enabled = on;
        if (!on) this.buckets.clear();
    },

    /* Returns -1 while disabled; end() treats that as "this span never
       started", which also makes toggling the panel mid-tick safe. */
    begin(): number {
        return this.enabled ? performance.now() : -1;
    },

    end(name: string, t0: number): void {
        if (t0 < 0) return;
        let bucket = this.buckets.get(name);
        if (!bucket) {
            bucket = new Bucket();
            this.buckets.set(name, bucket);
        }
        bucket.acc += performance.now() - t0;
        bucket.touched = true;
    },

    // Push a raw value (a count, not a duration) as its own sample.
    gauge(name: string, v: number): void {
        if (!this.enabled) return;
        let bucket = this.buckets.get(name);
        if (!bucket) {
            bucket = new Bucket();
            this.buckets.set(name, bucket);
        }
        bucket.push(v);
    },

    /* Flush every accumulator into its ring. Called at the end of the sim tick
       (flushes the sim buckets) and again at the end of the frame (flushes the
       render buckets); a bucket untouched since the last commit is skipped, so
       the two flushes never mix or double-count. */
    commit(): void {
        if (!this.enabled) return;
        for (const bucket of this.buckets.values()) {
            if (!bucket.touched) continue;
            bucket.push(bucket.acc);
            bucket.acc = 0;
            bucket.touched = false;
        }
    },

    snapshot(): Record<string, PerfStats> {
        const out: Record<string, PerfStats> = {};
        for (const [name, bucket] of this.buckets) {
            out[name] = bucket.stats();
        }
        return out;
    },
};

export default Perf;
