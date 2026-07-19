const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");
const Directions = require("../../Directions");
const Observation = require("../../Perception/Observation");

class PheromoneCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.pheromone, org, loc_col, loc_row);
    }

    performFunction() {
        this.org.emitPheromoneSignal(CellStates.pheromone);
    }
}

module.exports = PheromoneCell;
