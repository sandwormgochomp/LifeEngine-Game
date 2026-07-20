import React, { useEffect, useRef, useState } from 'react';
import styles from '../styles/Hud.module.css';
import useEngineValue from '../useEngineValue';
import type { EngineAPI } from '../../types/engine';
import FossilRecord from '../../Stats/FossilRecord';

interface StatsTabProps {
  engine: EngineAPI | null;
}

const StatsTab: React.FC<StatsTabProps> = ({ engine }) => {
  const [chartSelection, setChartSelection] = useState<number>(0);
  const [chartNote, setChartNote] = useState<string>('');
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Attach the chart container and run the 1s chart update loop while
  // this panel is mounted
  useEffect(() => {
    const statsPanel = engine?.controlpanel?.stats_panel;
    if (!statsPanel || !chartContainerRef.current) return;
    statsPanel.setContainer(chartContainerRef.current);
    statsPanel.startAutoRender();
    return () => {
      statsPanel.stopAutoRender();
      statsPanel.setContainer(null);
    };
  }, [engine]);

  useEffect(() => {
    const statsPanel = engine?.controlpanel?.stats_panel;
    if (!statsPanel) return;
    statsPanel.chart_selection = chartSelection;
    statsPanel.setChart();
    setChartNote(statsPanel.chart_controller?.note || '');
  }, [chartSelection, engine]);

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
      <div className={styles.statsGrid}>
        <p id="org-count" title="Living organisms in the world right now">
          <span>Population</span><b>{population}</b>
        </p>
        <p id="species-count" title="Distinct living species">
          <span>Species</span><b>{speciesCount}</b>
        </p>
        <p id="largest-org" title="Cell count of the largest organism that has ever lived">
          <span>Largest ever</span><b>{largest} cells</b>
        </p>
        <p id="avg-mut" title="Average mutation rate across all living organisms">
          <span>Avg. mutation</span><b>{avgMut}</b>
        </p>
        <p id="top-species" className={styles.statsWide} title="Species with the highest population (name and count)">
          <span>Top species</span><b>{topSpecies}</b>
        </p>
      </div>

      <div className={styles.chartControls}>
        <select
          id="chart-option"
          value={chartSelection}
          onChange={(e) => setChartSelection(parseInt(e.target.value))}
          title="Choose which statistic to chart over time"
        >
          <option value={0}>Population vs Time</option>
          <option value={1}>Species Population vs Time</option>
          <option value={2}>Cell Types vs Time</option>
          <option value={3}>Mutations vs Time</option>
        </select>
      </div>

      <div id="chartContainer" ref={chartContainerRef} style={{ width: '100%', marginTop: '8px' }}></div>
      {chartNote && <p id="chart-note" style={{ fontStyle: 'italic', fontSize: '0.85em', marginTop: '6px' }}>{chartNote}</p>}
    </div>
  );
};

export default StatsTab;
