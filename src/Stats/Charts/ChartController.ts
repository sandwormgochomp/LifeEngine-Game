import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import FossilRecord from '../FossilRecord';
import type { ChartSeriesSpec, ChartSpec } from './ChartSpecs';

// Thin wrapper around uPlot (open source, themeable) driven by a spec from
// ChartSpecs.js. Data is rebuilt wholesale on each update; at the fossil
// record's 500-point cap that is far cheaper than incremental bookkeeping.
class ChartController {
    spec: ChartSpec;
    note: string;
    series_defs: ChartSeriesSpec[];
    /* Built in the constructor and nulled by destroy(), after which every
       reader guards on it -- so `| null` rather than a definite assignment. */
    plot: uPlot | null;

    constructor(container: HTMLElement, spec: ChartSpec) {
        this.spec = spec;
        this.note = spec.note || '';
        // spec.series may be a lazy getter; resolve once per chart instance
        this.series_defs = spec.series;

        const axisTheme: uPlot.Axis = {
            stroke: 'rgba(0, 255, 65, 0.8)',
            grid: { stroke: 'rgba(0, 255, 65, 0.08)' },
            ticks: { stroke: 'rgba(0, 255, 65, 0.25)' },
            font: '13px VT323',
            labelFont: '13px VT323',
        };

        this.plot = new uPlot({
            width: Math.max(container.clientWidth || 460, 240),
            height: 250,
            series: [
                { label: 'Tick' },
                ...this.series_defs.map(s => ({
                    label: s.label,
                    stroke: s.color,
                    width: 1.5,
                    points: { show: false },
                })),
            ],
            axes: [
                { ...axisTheme },
                { ...axisTheme, label: this.spec.y_label || '', size: 56 },
            ],
            scales: { x: { time: false } },
            legend: { live: false },
            cursor: { drag: { x: true, y: false } },
        }, this.buildData(), container);
    }

    buildData(): uPlot.AlignedData {
        const xs = FossilRecord.tick_record.slice();
        return [xs, ...this.series_defs.map(s => xs.map((_, i) => s.get(i) ?? null))];
    }

    setData(): void {
        if (this.plot) this.plot.setData(this.buildData());
    }

    updateData(): void {
        this.setData();
    }

    render(): void {
        // uPlot repaints on setData; nothing extra to do
    }

    destroy(): void {
        if (this.plot) this.plot.destroy();
        this.plot = null;
    }
}

export default ChartController;
