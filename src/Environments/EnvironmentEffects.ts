import CellStates from '../Organism/Cell/CellStates';
import { BLAST_FX_TICKS } from '../Rendering/ExplosionFx';
import type { CellState } from '../Organism/Cell/CellStates';
import type Organism from '../Organism/Organism';
import type { OrganismProjectile } from '../Organism/Organism';
import type { Blast } from '../Rendering/ExplosionFx';

/* The per-tick stepping of blasts, explosions and projectiles, lifted out of
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
    active_blasts: Blast[];
    active_explosions: Explosion[];
    active_projectiles: OrganismProjectile[];
    changeCell(c: number, r: number, state: CellState, owner: null): void;
    renderer: { ctx: CanvasRenderingContext2D | null; cell_size: number };
}

/* Run one armed charge: harm what is living inside the radius and burn the
   ground it stood on. Lifted out of ExplosiveCell so that the damage lands when
   the fuse runs out rather than at the moment of death -- the telegraph in
   ExplosionFx is a beat of anticipation, and a beat the player can see but not
   act inside would be a lie.

   Nothing is excluded from the blast: the organism that armed it is dead and
   gone by now (its cells were converted to food by die(), which clears their
   owner), so the "not me" test the live version needed has no subject left. */
export function detonate(env: EffectsEnv, b: Blast): void {
    const radius = b.radius;
    for (let c_offset = -radius; c_offset <= radius; c_offset++) {
        for (let r_offset = -radius; r_offset <= radius; r_offset++) {
            if (c_offset * c_offset + r_offset * r_offset > radius * radius) continue;
            const target_c = b.col + c_offset;
            const target_r = b.row + r_offset;
            const idx = env.grid_map.indexAt(target_c, target_r);
            if (idx < 0) continue;
            /* The petri dish's glass is the world's boundary, not a wall inside
               it, and everything else already treats it that way: stepProjectiles
               stops a shot on it without damaging it, KillerCell.killNeighbor
               returns off it, and clearWalls refuses to clear it. Nothing here
               did -- an invincible wall is unowned and is not `wall`, so it fell
               through to the "burn what nobody owns" branch below, became an
               explosion cell, and reverted to empty three ticks later. A charge
               going off near the rim punched a permanent hole in the world. */
            if (env.grid_map.stateOf(idx) === CellStates.invincible_wall) continue;
            const owner = env.grid_map.ownerOf(idx);

            // If it is another organism cell, harm it
            if (owner != null && owner.living) {
                owner.harm();
            }

            // Deal 10 damage to walls, or immediately convert independent cells
            // to explosions
            if (env.grid_map.stateOf(idx) === CellStates.wall) {
                /* Every cell carries a durability now (0 off a wall), so the
                   undefined-durability branch this used to carry is gone -- see
                   KillerCell.killNeighbor. */
                if (env.grid_map.damageWall(idx, 10)) {
                    env.changeCell(target_c, target_r, CellStates.explosion, null);
                    env.active_explosions.push({ col: target_c, row: target_r, ticks: 3 });
                }
            /* Re-read rather than reusing `owner`: the harm() above can have
               killed that organism, which turns its cells to food and clears
               their owner -- and this branch has to see the cell as it is now. */
            } else if (env.grid_map.ownerOf(idx) == null) {
                env.changeCell(target_c, target_r, CellStates.explosion, null);
                env.active_explosions.push({ col: target_c, row: target_r, ticks: 3 });
            }
        }
    }
}

/* Burn the fuse on every armed charge, land the ones that reach zero, and age
   out the fireballs behind them. A blast outlives its own detonation by
   BLAST_FX_TICKS: those extra ticks carry no simulation effect at all, they are
   only how long ExplosionFx has left to draw. */
export function stepBlasts(env: EffectsEnv): void {
    if (env.active_blasts.length === 0) return;
    const remaining: Blast[] = [];
    for (const b of env.active_blasts) {
        if (b.fuse > 0) {
            b.fuse--;
            if (b.fuse === 0) detonate(env, b);
            remaining.push(b);
        } else if (b.age < BLAST_FX_TICKS) {
            b.age++;
            remaining.push(b);
        }
    }
    env.active_blasts = remaining;
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
