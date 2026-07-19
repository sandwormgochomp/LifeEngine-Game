const MouthCell = require("./MouthCell");
const ProducerCell = require("./ProducerCell");
const MoverCell = require("./MoverCell");
const KillerCell = require("./KillerCell");
const ArmorCell = require("./ArmorCell");
const EyeCell = require("./EyeCell");
const HealerCell = require("./HealerCell");
const ExplosiveCell = require("./ExplosiveCell");
const PoisonCell = require("./PoisonCell");
const PheromoneCell = require("./PheromoneCell");
const CommonCell = require("./CommonCell");
const ParasiteCell = require("./ParasiteCell");
const ChameleonCell = require("./ChameleonCell");
const ShooterCell = require("./ShooterCell");
const CellStates = require("../CellStates");


const BodyCellFactory = {
    init: function() {
        var type_map = {};
        type_map[CellStates.mouth.name] = MouthCell;
        type_map[CellStates.producer.name] = ProducerCell;
        type_map[CellStates.mover.name] = MoverCell;
        type_map[CellStates.killer.name] = KillerCell;
        type_map[CellStates.armor.name] = ArmorCell;
        type_map[CellStates.eye.name] = EyeCell;
        type_map[CellStates.healer.name] = HealerCell;
        type_map[CellStates.explosive.name] = ExplosiveCell;
        type_map[CellStates.poison.name] = PoisonCell;
        type_map[CellStates.pheromone.name] = PheromoneCell;
        type_map[CellStates.common.name] = CommonCell;
        type_map[CellStates.parasite.name] = ParasiteCell;
        type_map[CellStates.chameleon.name] = ChameleonCell;
        type_map[CellStates.shooter.name] = ShooterCell;
        this.type_map = type_map;
    },

    createInherited: function(org, to_copy) {
        var cell = new this.type_map[to_copy.state.name](org, to_copy.loc_col, to_copy.loc_row);
        cell.initInherit(to_copy);
        return cell;
    },

    createRandom: function(org, state, loc_col, loc_row) {
        var cell = new this.type_map[state.name](org, loc_col, loc_row);
        cell.initRandom();
        return cell;
    },

    createDefault: function(org, state, loc_col, loc_row) {
        var cell = new this.type_map[state.name](org, loc_col, loc_row);
        cell.initDefault();
        return cell;
    },
}
BodyCellFactory.init();

module.exports = BodyCellFactory;