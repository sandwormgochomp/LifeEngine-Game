export interface WorldConfigShape {
    headless: boolean;
    clear_walls_on_reset: boolean;
    auto_reset: boolean;
    auto_pause: boolean;
    brush_size: number;
    petri_dish: boolean;
}

const WorldConfig: WorldConfigShape = {
    headless: false,
    clear_walls_on_reset: false,
    auto_reset: true,
    auto_pause: false,
    brush_size: 2,
    petri_dish: true,
}

export default WorldConfig;
