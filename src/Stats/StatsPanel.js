const PopulationChart = require("./Charts/PopulationChart");
const SpeciesChart = require("./Charts/SpeciesChart");
const MutationChart = require("./Charts/MutationChart");
const CellsChart = require("./Charts/CellsChart");
const FossilRecord = require("./FossilRecord");


const ChartSelections = [PopulationChart, SpeciesChart, CellsChart, MutationChart];

class StatsPanel {
    constructor(env) {
        this.defineControls();
        this.chart_selection = 0;
        this.setChart();
        this.env = env;
        this.last_reset_count=env.reset_count;
    }

    setChart(selection=this.chart_selection) {
        this.chart_controller = new ChartSelections[selection]();
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

    defineControls() {
        // Handled by React UI
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

    updateDetails() {
        // Handled by React UI
    }

    reset() {
        this.setChart();
    }
    
}

module.exports = StatsPanel;