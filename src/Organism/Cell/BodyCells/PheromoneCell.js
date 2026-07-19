import CellStates from "../CellStates";
import BodyCell from "./BodyCell";
import Hyperparams from "../../../Hyperparameters";
import Directions from "../../Directions";
import Observation from "../../Perception/Observation";

class PheromoneCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.pheromone, org, loc_col, loc_row);
    }

    performFunction() {
        this.org.emitPheromoneSignal(CellStates.pheromone);
    }
}

export default PheromoneCell;
