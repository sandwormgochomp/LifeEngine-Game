

class CanvasController{
    constructor(env, canvas=null) {
        this.env = env;
        this.mouse_x;
        this.mouse_y;
        this.mouse_c;
        this.mouse_r;
        this.left_click = false;
        this.middle_click = false;
        this.right_click = false;
        this.cur_cell = null;
        this.cur_org = null;
        this.highlight_org = true;
        this.setCanvas(canvas);
    }

    setControlPanel(panel){
        this.control_panel = panel;
    }

    // The canvas may be swapped in and out as React mounts/unmounts the panel
    // that owns it. Listeners don't need explicit removal: they die with the
    // detached canvas element.
    setCanvas(canvas) {
        this.canvas = canvas;
        this.left_click = false;
        this.middle_click = false;
        this.right_click = false;
        if (canvas)
            this.defineEvents();
    }

    defineEvents() {
        this.canvas.addEventListener('mousemove', e => {
            this.updateMouseLocation(e.offsetX, e.offsetY)
            this.mouseMove();
        });

        this.canvas.addEventListener('mouseup', function(evt) {
            evt.preventDefault();
            this.updateMouseLocation(evt.offsetX, evt.offsetY)
            this.mouseUp();
            if (evt.button == 0) 
                this.left_click = false;
            if (evt.button == 1) 
                this.middle_click = false;
            if (evt.button == 2) 
                this.right_click = false;
        }.bind(this));

        this.canvas.addEventListener('mousedown', function(evt) {
            evt.preventDefault();
            this.updateMouseLocation(evt.offsetX, evt.offsetY)
            if (evt.button == 0) 
                this.left_click = true;
            if (evt.button == 1) 
                this.middle_click = true;
            if (evt.button == 2) 
                this.right_click = true;
            this.mouseDown();
        }.bind(this));

        this.canvas.addEventListener('contextmenu', function(evt) {
            evt.preventDefault();
        });

        this.canvas.addEventListener('mouseleave', function(){
            this.left_click   = false;
            this.middle_click = false;
            this.right_click  = false;
            this.env.renderer.clearAllHighlights(true);
        }.bind(this));

        this.canvas.addEventListener('mouseenter', function(evt) {

            this.left_click   = !!(evt.buttons & 1);
            this.right_click  = !!(evt.buttons & 2);
            this.middle_click = !!(evt.buttons & 4);

            this.updateMouseLocation(evt.offsetX, evt.offsetY);
            this.start_x = this.mouse_x;
            this.start_y = this.mouse_y;


        }.bind(this))

    }

    updateMouseLocation(offsetX, offsetY) {
        var prev_cell = this.cur_cell;
        var prev_org = this.cur_org;

        this.mouse_x = offsetX;
        this.mouse_y = offsetY;
        var colRow = this.env.grid_map.xyToColRow(this.mouse_x, this.mouse_y);
        this.mouse_c = colRow[0];
        this.mouse_r = colRow[1];
        this.cur_cell = this.env.grid_map.cellAt(this.mouse_c, this.mouse_r);
        this.cur_org = this.cur_cell ? this.cur_cell.owner : null;

        if (this.cur_org != prev_org || this.cur_cell != prev_cell) {
            this.env.renderer.clearAllHighlights(true);
            if (this.cur_org != null && this.highlight_org) {
                this.env.renderer.highlightOrganism(this.cur_org);
            }
            else if (this.cur_cell != null) {
                this.env.renderer.highlightCell(this.cur_cell, true);
            }
        }
    }

    mouseMove() {
        throw new Error("mouseMove must be overridden");
    }

    mouseDown() {
        throw new Error("mouseDown must be overridden");
    }

    mouseUp(){
        throw new Error("mouseUp must be overridden");
    }
}

export default CanvasController;