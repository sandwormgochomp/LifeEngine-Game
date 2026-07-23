import CellStates from "./Cell/CellStates";
import type { CellName, CellState, LivingCellName } from "./Cell/CellStates";
import BodyCellFactory from "./Cell/BodyCells/BodyCellFactory";
import type BodyCell from "./Cell/BodyCells/BodyCell";
import SerializeHelper from "../Utils/SerializeHelper";
/* Type-only: Organism imports Anatomy for its value (`new Anatomy(this)`), so a
   value import back would close a runtime cycle. `import type` is erased. */
import type Organism from "./Organism";

/* Save-format shapes. Both are what SerializeHelper.copyNonObjects leaves
   behind -- every non-object own property -- so the index signature is not
   slack: BodyCell subclasses carry extra scalar fields that are copied
   verbatim and read back by their initInherit. `custom_color` is optional
   because `typeof null === 'object'`, so an uncolored cell drops the key
   entirely rather than persisting null. */
export interface SerializedBodyCell {
    state: { name: CellName };
    loc_col: number;
    loc_row: number;
    custom_color?: string;
    [key: string]: unknown;
}

export interface SerializedAnatomy {
    cells: SerializedBodyCell[];
    birth_distance: number;
    is_producer: boolean;
    is_mover: boolean;
    has_eyes: boolean;
    has_healer: boolean;
    has_poison: boolean;
    has_explosive: boolean;
    has_parasite: boolean;
    has_chameleon: boolean;
    has_shooter: boolean;
    [key: string]: unknown;
}

class Anatomy {
    owner: Organism;
    birth_distance: number;
    /* Every field below is first assigned by clear(), which the constructor
       calls, and reassigned by checkTypeChange(). TypeScript's definite
       assignment analysis does not follow a constructor-called method, so the
       assertions state what the JS already guaranteed. No initializers here:
       useDefineForClassFields is false and these must stay bare declarations. */
    cells!: BodyCell[];
    is_producer!: boolean;
    is_mover!: boolean;
    has_eyes!: boolean;
    has_healer!: boolean;
    has_poison!: boolean;
    has_explosive!: boolean;
    has_parasite!: boolean;
    has_chameleon!: boolean;
    has_shooter!: boolean;

    constructor(owner: Organism) {
        this.owner = owner;
        this.birth_distance = 4;
        this.clear();
    }

    clear(): void {
        this.cells = [];
        this.is_producer = false;
        this.is_mover = false;
        this.has_eyes = false;
        this.has_healer = false;
        this.has_poison = false;
        this.has_explosive = false;
        this.has_parasite = false;
        this.has_chameleon = false;
        this.has_shooter = false;
    }

    canAddCellAt(c: number, r: number): boolean {
        for (var cell of this.cells) {
            if (cell.loc_col == c && cell.loc_row == r){
                return false;
            }
        }
        return true;
    }

    addDefaultCell(state: CellState<LivingCellName>, c: number, r: number): BodyCell {
        var new_cell = BodyCellFactory.createDefault(this.owner, state, c, r);
        this.cells.push(new_cell);
        this.checkTypeChange();
        return new_cell;
    }

    addRandomizedCell(state: CellState<LivingCellName>, c: number, r: number): BodyCell {
        if (state==CellStates.eye && !this.has_eyes) {
            this.owner.brain.randomizeDecisions();
        }
        var new_cell = BodyCellFactory.createRandom(this.owner, state, c, r);
        this.cells.push(new_cell);
        this.checkTypeChange();
        return new_cell;
    }

    // check=false skips the whole-anatomy type scan so bulk loaders can run
    // it once at the end instead of per cell (O(n) instead of O(n²) —
    // 10k-cell organisms froze the game otherwise).
    addInheritCell(parent_cell: BodyCell, check = true): BodyCell {
        var new_cell = BodyCellFactory.createInherited(this.owner, parent_cell);
        this.cells.push(new_cell);
        if (check)
            this.checkTypeChange();
        return new_cell;
    }

    replaceCell(state: CellState<LivingCellName>, c: number, r: number, randomize=true): BodyCell {
        this.removeCell(c, r, true);
        if (randomize) {
            return this.addRandomizedCell(state, c, r);
        }
        else {
            return this.addDefaultCell(state, c, r);
        }
    }

    removeCell(c: number, r: number, allow_center_removal=false): boolean {
        if (c == 0 && r == 0 && !allow_center_removal)
            return false;
        for (var i=0; i<this.cells.length; i++) {
            var cell = this.cells[i];
            if (cell.loc_col == c && cell.loc_row == r){
                this.cells.splice(i, 1);
                break;
            }
        }
        this.checkTypeChange();
        return true;
    }

    getLocalCell(c: number, r: number): BodyCell | null {
        for (var cell of this.cells) {
            if (cell.loc_col == c && cell.loc_row == r){
                return cell;
            }
        }
        return null;
    }

    checkTypeChange(): void {
        this.is_producer = false;
        this.is_mover = false;
        this.has_eyes = false;
        this.has_healer = false;
        this.has_poison = false;
        this.has_explosive = false;
        this.has_parasite = false;
        this.has_chameleon = false;
        this.has_shooter = false;
        for (var cell of this.cells) {
            if (cell.state == CellStates.producer)
                this.is_producer = true;
            if (cell.state == CellStates.mover)
                this.is_mover = true;
            if (cell.state == CellStates.eye)
                this.has_eyes = true;
            if (cell.state == CellStates.healer)
                this.has_healer = true;
            if (cell.state == CellStates.poison)
                this.has_poison = true;
            if (cell.state == CellStates.explosive)
                this.has_explosive = true;
            if (cell.state == CellStates.parasite)
                this.has_parasite = true;
            if (cell.state == CellStates.chameleon)
                this.has_chameleon = true;
            if (cell.state == CellStates.shooter)
                this.has_shooter = true;
        }
    }

    getRandomCell(): BodyCell {
        return this.cells[Math.floor(Math.random() * this.cells.length)];
    }

    getNeighborsOfCell(col: number, row: number): BodyCell[] {
        var neighbors: BodyCell[] = [];
        for (var x = -1; x <= 1; x++) {
            for (var y = -1; y <= 1; y++) {

                var neighbor = this.getLocalCell(col + x, row + y);
                if (neighbor)
                    neighbors.push(neighbor)
            }
        }

        return neighbors;
    }

    isEqual(anatomy: Anatomy): boolean { // currently unused helper func. inefficient, avoid usage in prod.
        if (this.cells.length !== anatomy.cells.length) return false;
        /* `for...in` over an array yields string keys, so the index accesses
           below only work by coercion at runtime. The loop is preserved exactly
           and the key is cast rather than converted -- Number(i) would be a
           behavior change. */
        for (let i in this.cells) {
            let my_cell = this.cells[i as unknown as number];
            let their_cell = anatomy.cells[i as unknown as number];
            if (my_cell.loc_col !== their_cell.loc_col ||
                my_cell.loc_row !== their_cell.loc_row ||
                my_cell.state !== their_cell.state)
                return false;
        }
        return true;
    }

    serialize(): SerializedAnatomy {
        /* copyNonObjects reflects over arbitrary keys, so it takes and returns
           Record<string, unknown>; the casts on either side are the join
           between that dynamic walk and the declared save shape. */
        let anatomy = SerializeHelper.copyNonObjects(this as unknown as Record<string, unknown>) as SerializedAnatomy;
        anatomy.cells = [];
        for (let cell of this.cells) {
            let newcell = SerializeHelper.copyNonObjects(cell as unknown as Record<string, unknown>) as SerializedBodyCell;
            newcell.state = {name: cell.state.name};
            anatomy.cells.push(newcell)
        }
        return anatomy;
    }

    loadRaw(anatomy: unknown): void {
        /* Asserted, not runtime-checked: the JS did no validation either and
           adding a guard here would change behavior on malformed saves. */
        let raw = anatomy as SerializedAnatomy;
        this.clear();
        /* The raw cells are plain save-format objects, not BodyCells.
           createInherited only reads state.name/loc_col/loc_row and hands the
           object to initInherit, which copies scalars off it, so they duck-type
           through -- but they are not BodyCell instances, hence the cast. */
        for (let cell of raw.cells as unknown as BodyCell[]){
            this.addInheritCell(cell, false);
        }
        this.checkTypeChange();
    }
}

export default Anatomy;
