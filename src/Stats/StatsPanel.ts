import ChartController from "./Charts/ChartController";
import ChartSpecs from "./Charts/ChartSpecs";

/* Minimal structural view of WorldEnvironment, which is still .js. It
   collapses to a real import once that file is converted. */
export interface StatsPanelEnvLike {
    reset_count: number;
}

// Selection order matches the dropdown: population, species, cells, mutation
const ChartSelections = [ChartSpecs[0], ChartSpecs[1], ChartSpecs[2], ChartSpecs[3]];

class StatsPanel {
    chart_selection: number;
    chart_container: HTMLElement | null;
    chart_controller: ChartController | null;
    env: StatsPanelEnvLike;
    last_reset_count: number;
    /* Genuinely absent until startAutoRender() runs, which the React stats
       panel only calls once it is mounted -- hence `| undefined` rather than
       a definite-assignment assertion. */
    render_loop: ReturnType<typeof setInterval> | undefined;

    constructor(env: StatsPanelEnvLike) {
        this.chart_selection = 0;
        this.chart_container = null;
        this.chart_controller = null;
        this.env = env;
        this.last_reset_count=env.reset_count;
    }

    // The chart renders into a container owned by the React stats panel,
    // attached while that panel is mounted.
    setContainer(container: HTMLElement | null): void {
        this.chart_container = container;
        if (!container && this.chart_controller) {
            this.chart_controller.destroy();
            this.chart_controller = null;
        }
    }

    setChart(selection: number=this.chart_selection): void {
        if (this.chart_controller)
            this.chart_controller.destroy();
        if (!this.chart_container) {
            this.chart_controller = null;
            return;
        }
        this.chart_controller = new ChartController(this.chart_container, ChartSelections[selection]);
        this.chart_controller.setData();
        this.chart_controller.render();
    }

    startAutoRender(): void {
        this.setChart();
        /* The explicit `this` parameter is a type-only annotation, erased at
           emit; rewriting this as an arrow function would change how `this`
           is bound at runtime, which the conversion must not do. */
        this.render_loop = setInterval(function(this: StatsPanel){this.updateChart();}.bind(this), 1000);
    }

    stopAutoRender(): void {
        clearInterval(this.render_loop);
    }

    updateChart(): void {
        if (this.last_reset_count < this.env.reset_count){
            this.reset()
        }
        this.last_reset_count = this.env.reset_count;
        if (this.chart_controller) {
            this.chart_controller.updateData();
            this.chart_controller.render();
        }
    }

    reset(): void {
        this.setChart();
    }

}

export default StatsPanel;
