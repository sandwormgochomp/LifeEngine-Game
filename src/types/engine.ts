// Minimal typed surface of the JS engine as consumed by the React HUD.
// The engine itself is untyped JS; keep this in sync when the seam changes.

export interface CellStateAPI {
  name: string;
  color: string;
}

export interface EnvControllerAPI {
  mode: number;
  scale: number;
  org_to_clone: unknown;
  resetView(): void;
  randomizeWalls(thickness?: number): void;
}

export interface EditorControllerAPI {
  mode: number;
  edit_cell_type: CellStateAPI | null;
  custom_color: string;
  use_custom_color: boolean;
}

export interface WorldEnvAPI {
  total_ticks: number;
  organisms: unknown[];
  largest_cell_count: number;
  radiation_map: Set<string>;
  controller: EnvControllerAPI;
  averageMutability(): number;
  reset(reset_life?: boolean): boolean;
}

export interface OrganismEditorAPI {
  organism: {
    anatomy: {
      cells: { state: CellStateAPI }[];
    };
  };
  controller: EditorControllerAPI;
  setDefaultOrg(): void;
}

export interface StatsPanelAPI {
  chart_selection: number;
  setChart(): void;
  startAutoRender(): void;
  stopAutoRender(): void;
}

export interface ControlPanelAPI {
  stats_panel: StatsPanelAPI;
  setPaused(paused: boolean): void;
}

export interface EngineAPI {
  fps: number;
  running: boolean;
  env: WorldEnvAPI;
  organism_editor: OrganismEditorAPI;
  controlpanel: ControlPanelAPI;
  start(fps?: number): void;
  stop(): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
}
