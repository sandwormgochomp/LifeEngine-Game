// A cell state is used to differentiate type and render the cell
class CellState{
    constructor(name) {
        this.name = name;
        this.color = 'black';
    }

    render(ctx, cell, size) {
        if (cell.cell_owner && cell.cell_owner.custom_color) {
            ctx.fillStyle = cell.cell_owner.custom_color;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(cell.x, cell.y, size, size);
    }
}

class Empty extends CellState {
    constructor() {
        super('empty');
    }
}
class Food extends CellState {
    constructor() {
        super('food');
        this.color = '#34593C';
    }
}
class Wall extends CellState {
    constructor() {
        super('wall');
    }
}
class Mouth extends CellState {
    constructor() {
        super('mouth');
    }
}
class Producer extends CellState {
    constructor() {
        super('producer');
    }
}
class Mover extends CellState {
    constructor() {
        super('mover');
    }
}
class Killer extends CellState {
    constructor() {
        super('killer');
    }
}
class Armor extends CellState {
    constructor() {
        super('armor');
    }
}
class Healer extends CellState {
    constructor() {
        super('healer');
    }
}
class Explosive extends CellState {
    constructor() {
        super('explosive');
    }
}
class Explosion extends CellState {
    constructor() {
        super('explosion');
    }
}
class InvincibleWall extends CellState {
    constructor() {
        super('invincible_wall');
    }
    render(ctx, cell, size) {
        // Petri-dish glass (flagged by WorldEnvironment.buildPetriDish):
        // blends into the page background so the rectangular canvas
        // disappears, with a lit rim ring marking the dish edge.
        if (cell.dish_glass) {
            ctx.fillStyle = cell.dish_rim ? '#1d403b' : '#05050A';
            ctx.fillRect(cell.x, cell.y, size, size);
            return;
        }
        super.render(ctx, cell, size);
    }
}
class Eye extends CellState {
    constructor() {
        super('eye');
        this.slit_color = 'black';
    }
    render(ctx, cell, size) {
        ctx.fillStyle = this.color;
        ctx.fillRect(cell.x, cell.y, size, size);
        if(size == 1)
            return;
        var half = size/2;
        var x = -(size)/8
        var y = -half;
        var h = size/2 + size/4;
        var w = size/4;
        ctx.translate(cell.x+half, cell.y+half);
        ctx.rotate((cell.cell_owner.getAbsoluteDirection() * 90) * Math.PI / 180);
        ctx.fillStyle = this.slit_color;
        ctx.fillRect(x, y, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

class Poison extends CellState {
    constructor() {
        super('poison');
    }
}

class Pheromone extends CellState {
    constructor() {
        super('pheromone');
        this.color = 'magenta';
    }
}

class Common extends CellState {
    constructor() {
        super('common');
        this.color = 'gray'; // Grey default color
    }
}

class Parasite extends CellState {
    constructor() {
        super('parasite');
        this.color = '#800080'; // Dark purple
    }
}

class Chameleon extends CellState {
    constructor() {
        super('chameleon');
        this.color = '#20b2aa'; // Light sea green
    }
}

class Shooter extends CellState {
    constructor() {
        super('shooter');
        this.color = '#d2691e'; // Chocolate/Orange
    }
}

const CellStates = {
    empty: new Empty(),
    food: new Food(),
    wall: new Wall(),
    mouth: new Mouth(),
    producer: new Producer(),
    mover: new Mover(),
    killer: new Killer(),
    armor: new Armor(),
    eye: new Eye(),
    healer: new Healer(),
    explosive: new Explosive(),
    explosion: new Explosion(),
    invincible_wall: new InvincibleWall(),
    poison: new Poison(),
    pheromone: new Pheromone(),
    common: new Common(),
    parasite: new Parasite(),
    chameleon: new Chameleon(),
    shooter: new Shooter(),
    defineLists() {
        this.all = [this.empty, this.food, this.wall, this.mouth, this.producer, this.mover, this.killer, this.armor, this.eye, this.healer, this.explosive, this.explosion, this.invincible_wall, this.poison, this.pheromone, this.common, this.parasite, this.chameleon, this.shooter]
        this.living = [this.mouth, this.producer, this.mover, this.killer, this.armor, this.eye, this.healer, this.explosive, this.poison, this.pheromone, this.common, this.parasite, this.chameleon, this.shooter];
    },
    getRandomName: function() {
        return this.all[Math.floor(Math.random() * this.all.length)].name;
    },
    getRandomLivingType: function() {
        return this.living[Math.floor(Math.random() * this.living.length)];
    }
}

CellStates.defineLists();

export default CellStates;
