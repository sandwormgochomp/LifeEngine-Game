/* The halo every living cell casts.

   Shared by the world and the organism editor so that an organism looks the
   same in the lab as it will once deployed. The tuning constants are the whole
   look, which is why they live here rather than beside either caller: a cell
   that glowed one way on the world canvas and another way in the editor was
   the difference the two views used to have.

   The per-cell fill loop deliberately stays with each caller. The world's is
   on the render hot path -- it walks grid indices, culls against the visible
   rect, and bakes a camera into the scratch transform -- and routing it
   through a shared signature would mean materialising its cells as objects
   every repaint, which is exactly the allocation the render passes were tuned
   to avoid. What is shared is the part that decides how it looks: the
   constants, and the blur-by-downscale composite below. */

// The scratch canvas renders at 1/DOWNSCALE resolution and is upscaled with
// smoothing, so a bigger divisor diffuses the halo more. SPREAD widens each
// cell before that blur; ALPHA sets peak intensity.
export const GLOW_DOWNSCALE = 6;
export const GLOW_SPREAD = 1.5;
export const GLOW_ALPHA = 0.1;

// How far past its cell each halo square reaches, in world px
export const glowMargin = (cell_size: number) => (cell_size * (GLOW_SPREAD - 1)) / 2;
export const glowSpread = (cell_size: number) => cell_size * GLOW_SPREAD;

/* Composite a filled scratch back over `ctx`, blurred by the upscale.

   Saves and restores imageSmoothingEnabled: the smoothing is what turns the
   downscaled squares into halos, and both callers draw pixel-art elsewhere on
   a context where it must stay off. */
export function compositeGlow(
  ctx: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.globalAlpha = GLOW_ALPHA;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = smoothing;
}
