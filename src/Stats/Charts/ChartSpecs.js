import CellStates from '../../Organism/Cell/CellStates';
import FossilRecord from '../FossilRecord';

// Declarative chart definitions over the FossilRecord history arrays.
// `get(i)` reads the value for the i-th recorded tick; colors for the cell
// series are read lazily so the ColorScheme has been applied by then.

const GREEN = '#00FF41';

const ChartSpecs = [
    {
        title: 'Population',
        y_label: 'organisms',
        series: [
            { label: 'Total Population', color: GREEN, get: i => FossilRecord.pop_counts[i] },
        ],
    },
    {
        title: 'Species',
        y_label: 'species',
        series: [
            { label: 'Number of Species', color: GREEN, get: i => FossilRecord.species_counts[i] },
        ],
    },
    {
        title: 'Organism Size / Composition',
        y_label: 'avg. cells per organism',
        note: 'Note: to maintain efficiency, species with very small populations are discarded when collecting cell statistics.',
        get series() {
            return [
                { label: 'Avg. organism size', color: GREEN, get: i => FossilRecord.av_cells[i] },
                ...CellStates.living.map(c => ({
                    label: `Avg. ${c.name} cells`,
                    color: c.color,
                    get: i => FossilRecord.av_cell_counts[i]?.[c.name],
                })),
            ];
        },
    },
    {
        title: 'Mutation Rate',
        y_label: 'avg. mutability',
        series: [
            { label: 'Average Mutation Rate', color: GREEN, get: i => FossilRecord.av_mut_rates[i] },
        ],
    },
];

export default ChartSpecs;
