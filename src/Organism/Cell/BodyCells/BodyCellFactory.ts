import MouthCell from "./MouthCell";
import ProducerCell from "./ProducerCell";
import MoverCell from "./MoverCell";
import KillerCell from "./KillerCell";
import ArmorCell from "./ArmorCell";
import EyeCell from "./EyeCell";
import HealerCell from "./HealerCell";
import ExplosiveCell from "./ExplosiveCell";
import PoisonCell from "./PoisonCell";
import PheromoneCell from "./PheromoneCell";
import CommonCell from "./CommonCell";
import ParasiteCell from "./ParasiteCell";
import ChameleonCell from "./ChameleonCell";
import ShooterCell from "./ShooterCell";
import BrainCell from "./BrainCell";
import CellStates from "../CellStates";
import type { CellState, LivingCellName } from "../CellStates";
import type BodyCell from "./BodyCell";
import type { BodyCellOrganism } from "./BodyCell";

/* Every subclass takes (org, loc_col, loc_row) and hardcodes its own state in
   the super() call, so none of them is assignable to `typeof BodyCell` -- whose
   constructor also takes the state up front. This is the shape the map actually
   holds. */
type BodyCellCtor = new (org: BodyCellOrganism, loc_col: number, loc_row: number) => BodyCell;

export interface BodyCellFactorySingleton {
    /* Optional only because init() -- not the object literal -- populates it.
       init() is called at module evaluation immediately below, so it is never
       actually absent by the time anything can reach the factory. */
    type_map?: Record<LivingCellName, BodyCellCtor>;
    init(): void;
    createInherited(org: BodyCellOrganism, to_copy: BodyCell): BodyCell;
    createRandom(org: BodyCellOrganism, state: CellState<LivingCellName>, loc_col: number, loc_row: number): BodyCell;
    createDefault(org: BodyCellOrganism, state: CellState<LivingCellName>, loc_col: number, loc_row: number): BodyCell;
}

const BodyCellFactory: BodyCellFactorySingleton = {
    init: function() {
        var type_map = {} as Record<LivingCellName, BodyCellCtor>;
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
        type_map[CellStates.brain.name] = BrainCell;
        this.type_map = type_map;
    },

    /* BodyCell.state is a CellState over the full CellName union, but only the
       14 living states ever have a BodyCell to copy, so the key is narrowed
       here rather than narrowing the field on the base class. */
    createInherited: function(org: BodyCellOrganism, to_copy: BodyCell): BodyCell {
        var cell = new this.type_map![to_copy.state.name as LivingCellName](org, to_copy.loc_col, to_copy.loc_row);
        cell.initInherit(to_copy);
        return cell;
    },

    createRandom: function(org: BodyCellOrganism, state: CellState<LivingCellName>, loc_col: number, loc_row: number): BodyCell {
        var cell = new this.type_map![state.name](org, loc_col, loc_row);
        cell.initRandom();
        return cell;
    },

    createDefault: function(org: BodyCellOrganism, state: CellState<LivingCellName>, loc_col: number, loc_row: number): BodyCell {
        var cell = new this.type_map![state.name](org, loc_col, loc_row);
        cell.initDefault();
        return cell;
    },
}
BodyCellFactory.init();

export default BodyCellFactory;
