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
  loadOrg(raw: unknown): void;
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

export interface EditorAnatomyAPI {
  cells: { state: CellStateAPI; loc_col: number; loc_row: number }[];
}

export interface EditorOrganismAPI {
  anatomy: EditorAnatomyAPI;
  species: { name: string } | null;
  serialize(): unknown;
}

export interface OrganismEditorAPI {
  organism: EditorOrganismAPI;
  controller: EditorControllerAPI;
  bindCanvas(canvas: HTMLCanvasElement, container: HTMLElement): void;
  releaseCanvas(): void;
  setDefaultOrg(): void;
  clearOrganism(): void;
  randomOrganism(): void;
  rotateOrganism(): void;
  flipOrganism(): void;
  loadRawOrg(raw: unknown, record?: boolean): void;
  renameSpecies(name: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  canZoomIn(): boolean;
  canZoomOut(): boolean;
}

export interface StatsPanelAPI {
  chart_selection: number;
  chart_controller: { note: string } | null;
  setContainer(container: HTMLElement | null): void;
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
  emitChange(force?: boolean): void;
}
