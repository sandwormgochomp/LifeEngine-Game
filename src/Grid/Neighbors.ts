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
    inRange: function (range: number): NeighborOffset[] {
        var neighbors: NeighborOffset[] = [];
        for (var i = -range; i <= range; i++) {
            for (var j = -range; j <= range; j++) {
                neighbors.push([i, j]);
            }
        }
        return neighbors;
    }
}

export default Neighbors;
