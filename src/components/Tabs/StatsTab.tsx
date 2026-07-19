import React, { useEffect, useState } from 'react';
import styles from '../styles/Hud.module.css';
import useEngineValue from '../useEngineValue';

const FossilRecord = require('../../Stats/FossilRecord');

interface StatsTabProps {
  engine: any;
  active: boolean;
}

const StatsTab: React.FC<StatsTabProps> = ({ engine, active }) => {
  const [chartSelection, setChartSelection] = useState<number>(0);

  useEffect(() => {
    if (engine && engine.controlpanel && engine.controlpanel.stats_panel) {
      engine.controlpanel.stats_panel.chart_selection = chartSelection;
      engine.controlpanel.stats_panel.setChart();
    }
  }, [chartSelection, engine]);

  // Only run the 1s chart update loop while the panel is open
  useEffect(() => {
    const statsPanel = engine?.controlpanel?.stats_panel;
    if (!active || !statsPanel) return;
    statsPanel.startAutoRender();
    return () => statsPanel.stopAutoRender();
  }, [active, engine]);

  const population = useEngineValue(engine, e => e.env.organisms.length, 0);
  const largest = useEngineValue(engine, e => e.env.largest_cell_count, 0);
  const avgMut = useEngineValue(engine, e => Math.round(e.env.averageMutability() * 100) / 100, 0);
  const speciesCount = useEngineValue(engine, () => FossilRecord.numExtantSpecies(), 0);
  const topSpecies = useEngineValue(engine, () => {
    let top: any = null;
    for (const species of Object.values(FossilRecord.extant_species) as any[]) {
      if (!top || species.population > top.population) top = species;
    }
    return top ? `${top.name} (${top.population})` : '—';
  }, '—');

  return (
    <div>
      <h3>Statistics</h3>

      <div className={styles.statsDetails}>
        <p id="org-count">Total Population: {population}</p>
        <p id="largest-org">Largest Organism Ever: {largest} cells</p>
        <p id="avg-mut">Average Mutation Rate: {avgMut}</p>
        <p id="species-count">Number of Species: {speciesCount}</p>
        <p id="top-species">Most Populous Species: {topSpecies}</p>
      </div>

      <div className={styles.chartControls}>
        <select 
          id="chart-option" 
          value={chartSelection} 
          onChange={(e) => setChartSelection(parseInt(e.target.value))}
        >
          <option value={0}>Population vs Time</option>
          <option value={1}>Species Population vs Time</option>
          <option value={2}>Cell Types vs Time</option>
          <option value={3}>Mutations vs Time</option>
        </select>
      </div>

      <p id="chart-note" style={{ fontStyle: 'italic', fontSize: '0.9em', marginTop: '10px' }}></p>
      <div id="chartContainer" style={{ height: '300px', width: '100%', marginTop: '10px' }}></div>
    </div>
  );
};

export default StatsTab;
