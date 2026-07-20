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
  dropOrganism(organism: unknown, col: number, row: number): boolean;
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
  is_night: boolean;
  grid_map: { cols: number; rows: number };
  controller: EnvControllerAPI;
  averageMutability(): number;
  reset(reset_life?: boolean): boolean;
  serialize(): unknown;
  loadRaw(raw: unknown): void;
  renderFull(): void;
  buildPetriDish(): void;
  clearWalls(): void;
  reset_count: number;
  resizeFillWindow(cell_size: number): void;
  resizeGridColRow(cell_size: number, cols: number, rows: number): void;
}

export interface EditorAnatomyAPI {
  cells: { state: CellStateAPI; loc_col: number; loc_row: number }[];
  is_mover: boolean;
  has_eyes: boolean;
  has_healer: boolean;
  has_explosive: boolean;
  has_shooter: boolean;
  has_poison: boolean;
}

export interface BrainStateAPI {
  name: string;
  decisions: Record<string, number>;
  actions: Record<string, string>;
  transitions: { condition_type: string; operator: string; value: number; target: number }[];
}

export interface BrainAPI {
  states: BrainStateAPI[];
  active_state_index: number;
  createDefaultDecisions(): Record<string, number>;
}

export interface EditorOrganismAPI {
  anatomy: EditorAnatomyAPI;
  species: { name: string } | null;
  brain: BrainAPI;
  move_range: number;
  mutability: number;
  healer_food_cost: number;
  poison_duration: number;
  serialize(): unknown;
  isNatural(): boolean;
}

export interface OrganismEditorAPI {
  organism: EditorOrganismAPI;
  controller: EditorControllerAPI;
  cell_size: number;
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
  beginStroke(): void;
  commitStroke(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  canZoomIn(): boolean;
  canZoomOut(): boolean;
  resetWithRandomOrgs(env: WorldEnvAPI, numOrganisms?: number): void;
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
  changeEngineSpeed(fps: number): void;
  resetHyperparams(): void;
}

export interface EngineAPI {
  fps: number;
  actual_fps: number;
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
