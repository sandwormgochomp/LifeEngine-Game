import Notifier from "../Utils/Notifier";
import type { NotificationCell } from "../Utils/Notifier";

/* Follow-a-lineage. Clicking an organism (the Select/sample tool) starts
   following it: the organism and every descendant born afterwards are tracked
   as one line -- highlighted by the decoration pass, summarized on the HUD's
   lineage card, and narrated as toasts when the line grows, shrinks, or ends.

   Tracking is by organism reference, not by species: a mutated child founds a
   new species but is still this line's descendant, which is the whole point of
   following one. The tracker is owned per-environment (a WorldEnvironment
   field, not a module singleton) and fed through optional OrganismEnv hooks
   (onOrganismBorn/onOrganismDied) that only WorldEnvironment implements -- so
   the Organism Lab's PreviewEnvironment mini-sim, which runs the same
   reproduce()/die() choke points, can never leak preview events in here. */

/* The shape the tracker reads off an organism, structurally typed so this
   module doesn't import Organism (Organism already imports from Stats; a real
   Organism satisfies this). `species`/`anatomy` mirror the nullability of the
   real fields. */
export interface TrackableOrganism {
    living: boolean;
    lifetime: number;
    species?: { name: string } | null;
    anatomy?: { cells: NotificationCell[] } | null;
}

/* Births and deaths inside a thriving line can land several times per tick, and
   every Notifier.notify fans out synchronously into a React state update. The
   running birth/death lines therefore fire at most once per this many ticks;
   the counters themselves stay exact, and each toast that does fire carries the
   totals as of that moment. One-off events (follow, founder death, line ended)
   are never throttled. */
const NOTIFY_COOLDOWN_TICKS = 30;

// Same flat snapshot the Narrator takes: the toast outlives the organism, so it
// must not hold live anatomy cells.
function previewOf(org: TrackableOrganism): NotificationCell[] {
    const cells = org.anatomy?.cells;
    if (!cells) return [];
    return cells.map(c => ({
        loc_col: c.loc_col,
        loc_row: c.loc_row,
        direction: c.direction,
        state: { name: c.state?.name },
    }));
}

class LineageTracker {
    /* True from follow() until unfollow()/reset() -- it stays true after the
       line goes extinct so the card can show the final tally until the player
       dismisses it or follows something else. */
    following = false;
    /* The clicked organism. Nulled once the founder dies, so an extinct line
       doesn't pin a dead organism (and its sprite cache) in memory. */
    root: TrackableOrganism | null = null;
    // Founder identity, snapshotted at follow time for the card and toasts.
    name = '';
    founder_cells: NotificationCell[] = [];
    start_tick = 0;
    end_tick = 0;
    extinct = false;
    born = 0;
    died = 0;
    // Deepest generation reached, where the founder is generation 0.
    max_generation = 0;
    private tracked = new Set<TrackableOrganism>();
    private generations = new Map<TrackableOrganism, number>();
    private last_birth_notify = -Infinity;
    private last_death_notify = -Infinity;

    get alive(): number {
        return this.tracked.size;
    }

    /* The decoration pass calls this once per living organism per repaint, so
       it must stay a bare Set lookup. */
    isTracked(org: TrackableOrganism): boolean {
        return this.tracked.has(org);
    }

    follow(org: TrackableOrganism, tick: number): void {
        // Re-clicking the organism already being followed is a no-op: the
        // sample tool fires on every click and restarting would wipe the tally.
        if (this.following && !this.extinct && org === this.root) return;
        this.unfollow();
        this.following = true;
        this.root = org;
        this.name = org.species?.name ?? 'Unknown lifeform';
        this.founder_cells = previewOf(org);
        this.start_tick = tick;
        this.tracked.add(org);
        this.generations.set(org, 0);
        Notifier.notify(`Following the ${this.name} line`, {
            key: 'lineage-follow',
            organism: this.founder_cells,
        });
    }

    // Silent: called by the card's dismiss button, by follow() when switching
    // subjects, and via reset() on world reset/load.
    unfollow(): void {
        this.following = false;
        this.root = null;
        this.name = '';
        this.founder_cells = [];
        this.start_tick = 0;
        this.end_tick = 0;
        this.extinct = false;
        this.born = 0;
        this.died = 0;
        this.max_generation = 0;
        this.tracked.clear();
        this.generations.clear();
        this.last_birth_notify = -Infinity;
        this.last_death_notify = -Infinity;
    }

    reset(): void {
        this.unfollow();
    }

    onBirth(parent: TrackableOrganism, child: TrackableOrganism, tick: number): void {
        if (!this.tracked.has(parent)) return;
        this.tracked.add(child);
        const gen = (this.generations.get(parent) ?? 0) + 1;
        this.generations.set(child, gen);
        if (gen > this.max_generation) this.max_generation = gen;
        this.born++;
        if (tick - this.last_birth_notify < NOTIFY_COOLDOWN_TICKS) return;
        this.last_birth_notify = tick;
        Notifier.notify(
            this.born === 1
                ? `${this.name} line: a descendant was born`
                : `${this.name} line: ${this.born.toLocaleString()} born, ${this.alive.toLocaleString()} alive`,
            { key: 'lineage-birth' }
        );
    }

    onDeath(org: TrackableOrganism, tick: number): void {
        if (!this.tracked.delete(org)) return;
        this.generations.delete(org);
        this.died++;
        if (this.tracked.size === 0) {
            // The line is gone. This subsumes the founder's own death toast when
            // the founder was the last (or only) member.
            this.root = null;
            this.extinct = true;
            this.end_tick = tick;
            const lived = this.born + 1;
            Notifier.notify(
                `The ${this.name} line you were following has ended — ${lived.toLocaleString()} lived over ${(tick - this.start_tick).toLocaleString()} ticks`,
                { organism: this.founder_cells }
            );
            return;
        }
        if (org === this.root) {
            this.root = null;
            Notifier.notify(
                `The ${this.name} founder died at ${org.lifetime.toLocaleString()} ticks old — ${this.alive.toLocaleString()} descendants carry on`,
                { organism: this.founder_cells }
            );
            return;
        }
        if (tick - this.last_death_notify < NOTIFY_COOLDOWN_TICKS) return;
        this.last_death_notify = tick;
        Notifier.notify(
            `${this.name} line: ${this.died.toLocaleString()} died, ${this.alive.toLocaleString()} alive`,
            { key: 'lineage-death' }
        );
    }
}

export default LineageTracker;
