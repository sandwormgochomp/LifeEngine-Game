import CellStates from "../Organism/Cell/CellStates";
import type { CellName } from "../Organism/Cell/CellStates";
import palette from "./palette.json";

/* Minimal shape of an environment as far as the colour scheme is concerned.
   Structural on purpose rather than for want of types: the constructor takes a
   world env *and* an editor env, two unrelated classes, and this is the slice
   they share. */
interface ColorSchemeEnvLike {
    renderer: { renderFullGrid(): void };
}

/* Covers all 19 cell states, plus the eye slit, which is not a state of its
   own but a detail colour read by Eye.render.

   In JSON rather than inline because the build's world-thumbnail generator
   (scripts/generate-world-thumbs.mjs) paints the same cells from plain Node,
   where it can neither import this module nor reach a canvas. Two copies of
   these hex values would drift silently -- a recoloured cell state would leave
   every bundled world's thumbnail painted in the old scheme. */
var color_scheme: Record<CellName | 'eye-slit', string> = palette;

// Renderer controls access to a canvas. There is one renderer for each canvas
class ColorScheme {
    world_env: ColorSchemeEnvLike;
    editor_env: ColorSchemeEnvLike;

    constructor(world_env: ColorSchemeEnvLike, editor_env: ColorSchemeEnvLike) {
        this.world_env = world_env;
        this.editor_env = editor_env;
    }

    loadColorScheme(): void {
        for (var state of CellStates.all) {
            state.color = color_scheme[state.name];
        }
        CellStates.eye.slit_color=color_scheme['eye-slit']
        this.world_env.renderer.renderFullGrid();
        this.editor_env.renderer.renderFullGrid();
    }
}

export default ColorScheme;
