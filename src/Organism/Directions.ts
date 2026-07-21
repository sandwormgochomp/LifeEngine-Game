/* A [dx, dy] step for one of the four cardinal directions. */
export type DirectionScalar = [number, number];

const Directions = {
    up:0,
    right:1,
    down:2,
    left:3,
    scalars:[[0,-1],[1,0],[0,1],[-1,0]] as DirectionScalar[],
    getRandomDirection: function(): number {
        return Math.floor(Math.random() * 4);
    },
    getRandomScalar: function(): DirectionScalar {
        return this.scalars[Math.floor(Math.random() * this.scalars.length)];
    },
    /* No default case and no trailing return: under strictNullChecks the
       inferred return type is `number | undefined`, so it is left inferred
       rather than asserted to `number`. */
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
