// const CellTypes = require("../Organism/Cell/CellTypes");
import CellStates from "../Organism/Cell/CellStates";
import Directions from "../Organism/Directions";

// Renderer controls access to a canvas. There is one renderer for each canvas.
// The canvas may be bound after construction (and unbound) for canvases owned
// by React components that mount and unmount; render calls are no-ops while
// no canvas is bound.
class Renderer {
    constructor(canvas, container, cell_size) {
        this.cell_size = cell_size;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
        this.height = 0;
        this.width = 0;
        this.bindCanvas(canvas, container);
    }

    bindCanvas(canvas, container) {
        this.canvas = canvas;
        this.container = container;
        this.ctx = canvas ? canvas.getContext("2d") : null;
        if (canvas)
            this.fillWindow();
    }

    fillWindow() {
        if (this.container) {
            this.fillShape(this.container.clientHeight || window.innerHeight, this.container.clientWidth || window.innerWidth);
        } else {
            this.fillShape(window.innerHeight, window.innerWidth);
        }
    }

    fillShape(height, width) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.height = this.canvas.height;
        this.width = this.canvas.width;
    }

    clear() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.height, this.width);
    }

    renderFullGrid(grid) {
        if (!this.ctx) return;
        for (var col of grid) {
            for (var cell of col){
                this.renderCell(cell);
            }
        }
    }

    renderCells() {
        if (!this.ctx) return;
        for (var cell of this.cells_to_render) {
            this.renderCell(cell);
        }
        this.cells_to_render.clear();
    }

    renderCell(cell) {
        if (cell.owner && cell.owner.anatomy && cell.owner.anatomy.has_chameleon) {
            this.ctx.globalAlpha = 0.4;
        }
        cell.state.render(this.ctx, cell, this.cell_size);
        this.ctx.globalAlpha = 1;
        
        if (this.env && this.env.radiation_map && this.env.radiation_map.has(cell.col + "," + cell.row)) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            this.ctx.fillRect(cell.x, cell.y, this.cell_size, this.cell_size);
        }
    }

    renderOrganism(org) {
        if (!this.ctx) return;
        for(var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.renderCell(cell);
        }
    }

    addToRender(cell) {
        if (this.highlighted_cells.has(cell)){
            this.cells_to_highlight.add(cell);
        }
        this.cells_to_render.add(cell);
    }

    renderHighlights() {
        if (!this.ctx) return;
        for (var cell of this.cells_to_highlight) {
            this.renderCellHighlight(cell);
            this.highlighted_cells.add(cell);
        }
        this.cells_to_highlight.clear();
        
    }

    highlightOrganism(org) {
        for(var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.cells_to_highlight.add(cell);
        }
    }

    highlightCell(cell) {
        this.cells_to_highlight.add(cell);
    }

    renderCellHighlight(cell, color="yellow") {
        this.renderCell(cell);
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(cell.x, cell.y, this.cell_size, this.cell_size);
        this.ctx.globalAlpha = 1;
        this.highlighted_cells.add(cell);
    }

    clearAllHighlights(clear_to_highlight=false) {
        if (this.ctx) {
            for (var cell of this.highlighted_cells) {
                this.renderCell(cell);
            }
        }
        this.highlighted_cells.clear();
        if (clear_to_highlight) {
            this.cells_to_highlight.clear();
        }
    }
}

export default Renderer;
