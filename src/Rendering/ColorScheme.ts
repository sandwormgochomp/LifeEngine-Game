import CellStates from "../Organism/Cell/CellStates";
import type { CellName } from "../Organism/Cell/CellStates";
import type Cell from "../Organism/Cell/GridCell";

/* Minimal shape of an environment as far as the colour scheme is concerned.
   Structural on purpose rather than for want of types: the constructor takes a
   world env *and* an editor env, two unrelated classes, and this is the slice
   they share. */
interface ColorSchemeEnvLike {
    renderer: { renderFullGrid(grid: Cell[][]): void };
    grid_map: { grid: Cell[][] };
}

/* Covers all 19 cell states, plus the eye slit, which is not a state of its
   own but a detail colour read by Eye.render. */
var color_scheme: Record<CellName | 'eye-slit', string> = {
    "empty":"#0E1318",
    "food":"#34593C",
    "wall":"gray",
    "mouth":"#DEB14D",
    "producer":"#15DE59",
    "mover":"#60D4FF",
    "killer":"#F82380",
    "armor":"#7230DB",
    "eye":"#B6C1EA",
    "healer":"#0AEBAF",
    "explosive":"#FF6B00",
    "explosion":"#FFEA00",
    "invincible_wall":"#2F3640",
    "poison":"#C2FF00",
    "common":"#808080",
    "pheromone":"#FF00FF",
    "parasite":"#800080",
    "chameleon":"#20B2AA",
    "shooter":"#D2691E",
    "eye-slit": "#0E1318"
}

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
        this.world_env.renderer.renderFullGrid(this.world_env.grid_map.grid);
        this.editor_env.renderer.renderFullGrid(this.editor_env.grid_map.grid);
    }
}

export default ColorScheme;
