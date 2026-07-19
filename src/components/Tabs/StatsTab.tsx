import React, { useEffect, useState } from 'react';
import styles from '../styles/Hud.module.css';

interface StatsTabProps {
  engine: any;
}

const StatsTab: React.FC<StatsTabProps> = ({ engine }) => {
  const [chartSelection, setChartSelection] = useState<number>(0);

  useEffect(() => {
    if (engine && engine.controlpanel && engine.controlpanel.stats_panel) {
      engine.controlpanel.stats_panel.chart_selection = chartSelection;
      engine.controlpanel.stats_panel.setChart();
    }
  }, [chartSelection, engine]);

  const stats = engine?.env ? {
    population: engine.env.organisms.length,
    largest: engine.env.largest_cell_count,
    avgMut: Math.round(engine.env.averageMutability() * 100) / 100
  } : { population: 0, largest: 0, avgMut: 0 };

  return (
    <div>
      <h3>Statistics</h3>
      
      <div className={styles.statsDetails}>
        <p id="org-count">Total Population: {stats.population}</p>
        <p id="largest-org">Largest Organism Ever: {stats.largest} cells</p>
        <p id="avg-mut">Average Mutation Rate: {stats.avgMut}</p>
        <p id="species-count">Number of Species: ...</p>
        <p id="top-species">Most Populous Species: ...</p>
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
