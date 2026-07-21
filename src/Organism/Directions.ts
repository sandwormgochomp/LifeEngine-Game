/* A [dx, dy] step for one of the four cardinal directions. */
export type DirectionScalar = [number, number];

/* The four cardinal directions as literal types. Spelling them out (rather than
   letting the object literal widen each to `number`) is what lets a switch over
   all four cases be recognised as exhaustive -- see BodyCell.rotatedCol, whose
   defaultless switch would otherwise be inferred as returning
   `number | undefined` and force a non-null assertion at every call site. */
export type Direction = 0 | 1 | 2 | 3;

interface DirectionsRegistry {
    up: 0;
    right: 1;
    down: 2;
    left: 3;
    scalars: DirectionScalar[];
    getRandomDirection(): Direction;
    getRandomScalar(): DirectionScalar;
    /* Not narrowed to Direction: the only caller passes an Observation's
       direction, which is produced by a plain 0..3 counter rather than by this
       module, so the switch here is not exhaustive over its parameter type and
       the result stays possibly-undefined. */
    getOppositeDirection(dir: number): number | undefined;
    rotateRight(dir: number): number;
}

const Directions: DirectionsRegistry = {
    up:0,
    right:1,
    down:2,
    left:3,
    scalars:[[0,-1],[1,0],[0,1],[-1,0]] as DirectionScalar[],
    getRandomDirection: function(): Direction {
        /* Always 0..3, which the arithmetic cannot express to the checker. */
        return Math.floor(Math.random() * 4) as Direction;
    },
    getRandomScalar: function(): DirectionScalar {
        return this.scalars[Math.floor(Math.random() * this.scalars.length)];
    },
    getOppositeDirection: function(dir: number) {
        switch(dir){
            case this.up:
                return this.down;
            case this.down:
                return this.up;
            case this.left:
                return this.right;
            case this.right:
                return this.left;
        }
    },
    rotateRight: function(dir: number): number {
        dir++;
        if (dir > 3){
            dir = 0;
        }
        return dir;
    }
}

export default Directions;
