import type Cell from '../Organism/Cell/GridCell';
import type { RenderOrganismLike } from '../Organism/Cell/CellStates';

/* Minimal shapes of Renderer, GridMap and the React control panel. These stay
   structural because this base class is shared by the world and editor
   controllers, whose envs are different classes. */
interface RendererLike {
    clearAllHighlights(clear_to_highlight?: boolean): void;
    highlightOrganism(org: RenderOrganismLike): void;
    highlightCell(cell: Cell): void;
}

interface GridMapLike {
    xyToColRow(x: number, y: number): [number, number];
    cellAt(col: number, row: number): Cell | null;
}

interface ControllerEnvLike {
    renderer: RendererLike;
    grid_map: GridMapLike;
    /* Both optional: only WorldEnvironment stacks a decoration overlay over its
       cells, and only it therefore needs the hover republished for the sprite
       tint. The editor leaves them unset (it turns highlight_org off outright)
       and the writes below are harmless no-ops there. */
    highlighted_org?: RenderOrganismLike | null;
    deco_dirty?: boolean;
}

/* The control panel, as EnvironmentController reaches through it to hand over
   the newly selected organism. A bare string index signature stood here before,
   which no class instance is ever assignable to; the real ControlPanel satisfies
   this shape. Declared structurally rather than imported because ControlPanel.ts
   declares its own stand-in for these controllers -- the two reference each
   other, so they only collapse together. */
interface ControlPanelLike {
    setEditorOrganism(org: unknown): void;
}

class CanvasController{
    env: ControllerEnvLike;
    /* Set on the first pointer event rather than in the constructor, which only
       evaluates them as bare expressions. */
    mouse_x!: number;
    mouse_y!: number;
    mouse_c!: number;
    mouse_r!: number;
    client_x!: number;
    client_y!: number;
    drag_anchor_x!: number;
    drag_anchor_y!: number;
    left_click: boolean;
    middle_click: boolean;
    right_click: boolean;
    cur_cell: Cell | null;
    /* Also assigned directly by subclasses (EnvironmentController). */
    cur_org: RenderOrganismLike | null;
    highlight_org: boolean;
    /* Assigned through setCanvas() from the constructor, which the checker
       cannot see through, hence the definite assignment assertion. */
    canvas!: HTMLCanvasElement | null;
    /* Assigned only by setControlPanel(), which the React layer may never
       call. */
    control_panel?: ControlPanelLike;

    constructor(env: ControllerEnvLike, canvas: HTMLCanvasElement | null = null) {
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

    setControlPanel(panel: ControlPanelLike): void {
        this.control_panel = panel;
    }

    // The canvas may be swapped in and out as React mounts/unmounts the panel
    // that owns it. Listeners don't need explicit removal: they die with the
    // detached canvas element.
    setCanvas(canvas: HTMLCanvasElement | null): void {
        this.canvas = canvas;
        this.left_click = false;
        this.middle_click = false;
        this.right_click = false;
        if (canvas)
            this.defineEvents();
    }

    // offsetX/offsetY are relative to the canvas, so they stay put when the
    // canvas itself is panned under a stationary cursor. Anything comparing
    // pointer positions *across* events must use the client (screen) coords.
    setPointer(evt: MouseEvent): void {
        this.client_x = evt.clientX;
        this.client_y = evt.clientY;
        this.updateMouseLocation(evt.offsetX, evt.offsetY);
    }

    defineEvents(): void {
        this.canvas!.addEventListener('mousemove', e => {
            this.setPointer(e);
            this.mouseMove();
        });

        this.canvas!.addEventListener('mouseup', function(this: CanvasController, evt: MouseEvent) {
            evt.preventDefault();
            this.setPointer(evt);
            this.mouseUp();
            if (evt.button == 0)
                this.left_click = false;
            if (evt.button == 1)
                this.middle_click = false;
            if (evt.button == 2)
                this.right_click = false;
        }.bind(this));

        this.canvas!.addEventListener('mousedown', function(this: CanvasController, evt: MouseEvent) {
            evt.preventDefault();
            this.setPointer(evt);
            if (evt.button == 0)
                this.left_click = true;
            if (evt.button == 1)
                this.middle_click = true;
            if (evt.button == 2)
                this.right_click = true;
            this.mouseDown();
        }.bind(this));

        this.canvas!.addEventListener('contextmenu', function(evt: MouseEvent) {
            evt.preventDefault();
        });

        this.canvas!.addEventListener('mouseleave', function(this: CanvasController){
            this.left_click   = false;
            this.middle_click = false;
            this.right_click  = false;
            this.env.renderer.clearAllHighlights(true);
            this.setHighlightedOrg(null);
        }.bind(this));

        this.canvas!.addEventListener('mouseenter', function(this: CanvasController, evt: MouseEvent) {

            this.left_click   = !!(evt.buttons & 1);
            this.right_click  = !!(evt.buttons & 2);
            this.middle_click = !!(evt.buttons & 4);

            this.setPointer(evt);
            this.drag_anchor_x = this.client_x;
            this.drag_anchor_y = this.client_y;
        }.bind(this))

    }

    updateMouseLocation(offsetX: number, offsetY: number): void {
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
                this.env.renderer.highlightCell(this.cur_cell);
            }
            this.setHighlightedOrg(this.cur_org != null && this.highlight_org ? this.cur_org : null);
        }
    }

    /* The decoration overlay only repaints when the world marks it dirty, and a
       hover changes no cells, so moving the cursor between organisms would
       otherwise leave the tint on whichever one was highlighted when the world
       last changed. */
    setHighlightedOrg(org: RenderOrganismLike | null): void {
        if (this.env.highlighted_org === org) return;
        this.env.highlighted_org = org;
        this.env.deco_dirty = true;
    }

    mouseMove(): void {
        throw new Error("mouseMove must be overridden");
    }

    mouseDown(): void {
        throw new Error("mouseDown must be overridden");
    }

    mouseUp(): void {
        throw new Error("mouseUp must be overridden");
    }
}

export default CanvasController;
