import type {
  ProjectConfig,
  Project,
  ProjectDNA,
  VisualDNA,
  SpatialMap,
  DependencyGraph,
  WorldState,
  Operation,
  Scene,
  StoryboardEntry,
  AdaptiveZoneDefinition,
  ConstructionComponent,
  ConstructionRule,
  Transformation,
  JumpRisk,
  Residue,
  ToolInstance,
} from '../../types';
import type { FiscalRunner } from '../../fiscals/fiscal-runner';
import type { BlueprintOperation, ConstructionBlueprint } from '../project-orchestrator';
import type { ConstructionDecision } from '../../decision/ConstructionDecision';
import type { CinematicScene } from '../../types/scene-director';
import type { ConstructionEpisode } from '../../types/construction-series';
import type { PlannedEpisode, EpisodePlan } from '../../series/EpisodePlanner';

/** Context passed through all pipeline stages */
export interface PipelineContext {
  config: ProjectConfig;
  blueprint: ConstructionBlueprint;
  createdAt: number;

  /** Populated by DNA stage */
  dna?: ProjectDNA;

  /** Populated by Assembly stage */
  visualDNA?: VisualDNA;

  /** Populated by Spatial stage */
  spatialMap?: SpatialMap;
  visibleZones?: string[];

  /** Populated by Dependency stage */
  dependencyGraph?: DependencyGraph;

  /** Populated by World stage */
  worldState?: WorldState;

  /** Populated by Operations stage */
  operations?: Operation[];

  /** Populated by Scenes stage */
  scenes?: Scene[];
  storyboard?: StoryboardEntry[];

  /** Populated by SceneDirector stage */
  cinematicScenes?: CinematicScene[];
  episodes?: ConstructionEpisode[];

  /** Populated by EpisodePlanner stage */
  plannedEpisodes?: PlannedEpisode[];
  episodePlan?: EpisodePlan;

  /** Populated by Stages stage */
  fiscalRunner?: FiscalRunner;
  previousScene?: Scene;

  /** Populated by Decision stage */
  decision?: ConstructionDecision;

  /** Final output */
  project?: Project;
}

/** Result from each pipeline stage */
export interface StageResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
  warnings?: string[];
}

/** Pipeline stage interface */
export interface PipelineStage {
  name: string;
  execute(context: PipelineContext): StageResult<any>;
  validate?(context: PipelineContext): StageResult;
}

/** Complete pipeline execution result */
export interface PipelineResult {
  success: boolean;
  project?: Project;
  errors: string[];
  warnings: string[];
  stageResults: Record<string, StageResult>;
}