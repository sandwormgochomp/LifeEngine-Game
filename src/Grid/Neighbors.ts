// contains local cell values for the following:

//all       ...
//          .x.
//          ...

//adjacent   .
//          .x.
//           .

//corners   . .
//           x
//          . .

//allSelf   ...
//          ...
//          ...

/* A single [column, row] offset from some origin cell. */
export type NeighborOffset = [number, number];

export interface NeighborsRegistry {
    all: NeighborOffset[];
    adjacent: NeighborOffset[];
    corners: NeighborOffset[];
    allSelf: NeighborOffset[];
    inRange(range: number): NeighborOffset[];
}

const Neighbors: NeighborsRegistry = {
    all: [[0, 1],[0, -1],[1, 0],[-1, 0],[-1, -1],[1, 1],[-1, 1],[1, -1]],
    adjacent: [[0, 1],[0, -1],[1, 0],[-1, 0]],
    corners: [[-1, -1],[1, 1],[-1, 1],[1, -1]],
    allSelf: [[0, 0],[0, 1],[0, -1],[1, 0],[-1, 0],[-1, -1],[1, 1],[-1, 1],[1, -1]],
    // Every offset whose cell centre falls within `range` of the origin,
    // giving a filled disc rather than a square. The +0.5 pushes the boundary
    // to the cell edge so the circle reads as round instead of a diamond.
    inRange: function (range: number): NeighborOffset[] {
        var neighbors: NeighborOffset[] = [];
        var limit = (range + 0.5) * (range + 0.5);
        for (var i = -range; i <= range; i++) {
            for (var j = -range; j <= range; j++) {
                if (i * i + j * j <= limit) {
                    neighbors.push([i, j]);
                }
            }
        }
        return neighbors;
    }
}

export default Neighbors;
