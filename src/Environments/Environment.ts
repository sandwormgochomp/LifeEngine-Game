import type { CellState, RenderCellOwnerLike } from '../Organism/Cell/CellStates';
/* Type-only, so the abstract base adds no runtime edge to GridMap. */
import type GridMap from '../Grid/GridMap';


//An evironment has a grid_map, controller, and renderer
abstract class Environment{
    /* Built by each subclass (WorldEnvironment, OrganismEditor), but reached
       through by changeCell() here on the base. */
    abstract grid_map: GridMap;

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
