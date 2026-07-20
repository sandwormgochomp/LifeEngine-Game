import ChartController from "./Charts/ChartController";
import ChartSpecs from "./Charts/ChartSpecs";

// Selection order matches the dropdown: population, species, cells, mutation
const ChartSelections = [ChartSpecs[0], ChartSpecs[1], ChartSpecs[2], ChartSpecs[3]];

class StatsPanel {
    constructor(env) {
        this.chart_selection = 0;
        this.chart_container = null;
        this.chart_controller = null;
        this.env = env;
        this.last_reset_count=env.reset_count;
    }

    // The chart renders into a container owned by the React stats panel,
    // attached while that panel is mounted.
    setContainer(container) {
        this.chart_container = container;
        if (!container && this.chart_controller) {
            this.chart_controller.destroy();
            this.chart_controller = null;
        }
    }

    setChart(selection=this.chart_selection) {
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

    startAutoRender() {
        this.setChart();
        this.render_loop = setInterval(function(){this.updateChart();}.bind(this), 1000);
    }

    stopAutoRender() {
        clearInterval(this.render_loop);
    }

    updateChart() {
        if (this.last_reset_count < this.env.reset_count){
            this.reset()
        }
        this.last_reset_count = this.env.reset_count;
        if (this.chart_controller) {
            this.chart_controller.updateData();
            this.chart_controller.render();
        }
    }

    reset() {
        this.setChart();
    }
    
}

export default StatsPanel;