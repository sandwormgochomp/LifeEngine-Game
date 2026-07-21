import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";
import Directions from "../../Directions";
import Observation from "../../Perception/Observation";

class PheromoneCell extends BodyCell{
    constructor(org: BodyCellOrganism, loc_col: number, loc_row: number){
        super(CellStates.pheromone, org, loc_col, loc_row);
    }

    performFunction(): void {
        this.org.emitPheromoneSignal(CellStates.pheromone);
    }
}

export default PheromoneCell;
