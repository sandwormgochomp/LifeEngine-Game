import type { CellState, RenderCellOwnerLike } from '../Organism/Cell/CellStates';

/* Minimal shape of GridMap, which is still an untyped .js module. Replace with
   a real import once it converts. */
interface GridMapLike {
    setCellType(col: number, row: number, state: CellState): void;
    setCellOwner(col: number, row: number, cell_owner: RenderCellOwnerLike | null): void;
}

//An evironment has a grid_map, controller, and renderer
abstract class Environment{
    /* Built by each subclass (WorldEnvironment, OrganismEditor), but reached
       through by changeCell() here on the base. */
    abstract grid_map: GridMapLike;

    constructor() {
    }

    update(): void {
        throw new Error("Environment.update() must be overridden");
    }

    changeCell(c: number, r: number, state: CellState, owner: RenderCellOwnerLike | null): void {
        this.grid_map.setCellType(c, r, state);
        this.grid_map.setCellOwner(c, r, owner);
    }
}


export default Environment;
