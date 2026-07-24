import CellStates from '../Organism/Cell/CellStates';
import type { CellState } from '../Organism/Cell/CellStates';
import type Organism from '../Organism/Organism';
import type { OrganismProjectile } from '../Organism/Organism';

/* The per-tick stepping of explosions and projectiles, lifted out of
   WorldEnvironment.update() so the lightweight PreviewEnvironment runs the exact
   same logic instead of a second copy that could drift. Both operate through a
   structural view of the environment, which WorldEnvironment and
   PreviewEnvironment each satisfy. */

interface Explosion { col: number; row: number; ticks: number; }

/* Only the grid members these two steppers reach. ownerOf is narrowed to
   Organism (the value the world's grid actually stores) because stepProjectiles
   calls takeDamage() on it -- the same narrowing WorldEnvironment's WorldGridMap
   applies. */
export interface EffectsGrid {
    indexAt(col: number, row: number): number;
    stateAt(col: number, row: number): CellState | null;
    stateOf(idx: number): CellState;
    ownerOf(idx: number): Organism | null;
    damageWall(idx: number, amount: number): boolean;
}

export interface EffectsEnv {
    grid_map: EffectsGrid;
    active_explosions: Explosion[];
    active_projectiles: OrganismProjectile[];
    changeCell(c: number, r: number, state: CellState, owner: null): void;
    renderer: { ctx: CanvasRenderingContext2D | null; cell_size: number };
}

// Age out explosion cells: each lives `ticks` frames, then reverts to empty.
export function stepExplosions(env: EffectsEnv): void {
    const remaining: Explosion[] = [];
    for (const exp of env.active_explosions) {
        exp.ticks--;
        if (exp.ticks <= 0) {
            if (env.grid_map.stateAt(exp.col, exp.row) === CellStates.explosion) {
                env.changeCell(exp.col, exp.row, CellStates.empty, null);
            }
        } else {
            remaining.push(exp);
        }
    }
    env.active_explosions = remaining;
}

// Advance each in-flight projectile one cell, resolving wall / organism / edge
// hits; survivors are drawn as a small square on the world canvas.
export function stepProjectiles(env: EffectsEnv): void {
    const remaining: OrganismProjectile[] = [];
    for (const proj of env.active_projectiles) {
        proj.col += proj.dir_col;
        proj.row += proj.dir_row;
        proj.ticks++;

        const target = env.grid_map.indexAt(proj.col, proj.row);
        let hit = false;

        if (target >= 0) {
            const target_state = env.grid_map.stateOf(target);
            if (target_state === CellStates.wall || target_state === CellStates.invincible_wall) {
                hit = true;
                if (target_state === CellStates.wall) {
                    if (env.grid_map.damageWall(target, 5)) {
                        env.changeCell(proj.col, proj.row, CellStates.empty, null);
                    }
                }
            } else {
                const target_owner = env.grid_map.ownerOf(target);
                if (target_owner && target_owner !== proj.owner) {
                    hit = true;
                    target_owner.takeDamage(5); // Projectile deals 5 damage
                }
            }
        } else {
            hit = true; // Off screen
        }

        if (!hit && proj.ticks < 50) { // Max range 50
            remaining.push(proj);
            if (env.renderer.ctx) {
                env.renderer.ctx.fillStyle = '#d2691e';
                env.renderer.ctx.fillRect(
                    proj.col * env.renderer.cell_size + env.renderer.cell_size / 4,
                    proj.row * env.renderer.cell_size + env.renderer.cell_size / 4,
                    env.renderer.cell_size / 2,
                    env.renderer.cell_size / 2,
                );
            }
        }
    }
    env.active_projectiles = remaining;
}
