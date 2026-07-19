import CellStates from "../CellStates";
import BodyCell from "./BodyCell";

class HealerCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.healer, org, loc_col, loc_row);
        this.org.anatomy.has_healer = true;
    }

    performFunction() {
        var heals_automatically = !this.org.anatomy.has_eyes;
        if (heals_automatically || this.org.brain_triggered_heal) {
            if (this.org.damage > 0 && this.org.food_collected >= this.org.healer_food_cost) {
                this.org.damage--;
                this.org.food_collected -= this.org.healer_food_cost;
            }
            this.org.brain_triggered_heal = false;
        }
    }
}

export default HealerCell;
