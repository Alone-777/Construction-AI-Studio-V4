import { Scene, Stage, ValidationResult, ValidationError, JumpRisk, Operation } from '../types';
import type { WorldState, Transformation } from '../types';
import type { SpatialMap } from '../types';
import type { DependencyGraph, ProjectDNA } from '../types';
import type { CharacterState } from '../types';
import type { QualityScore } from '../types';

export interface FiscalContext {
  scene: Scene;
  stage: Stage;
  worldStateBefore: WorldState;
  worldStateAfter: WorldState;
  transformation?: Transformation;
  spatialMap: SpatialMap;
  dependencyGraph: DependencyGraph;
  character: CharacterState;
  previousScene?: Scene;
  projectDNA: ProjectDNA;
  operation?: Operation;
}

export interface FiscalInspector {
  id: string;
  name: string;
  inspect(context: FiscalContext): ValidationError[];
}

export interface FiscalReport {
  results: ValidationResult;
  errors: ValidationError[];
  warnings: ValidationError[];
  approved: boolean;
  qualityScore: QualityScore;
  jumpRisk: JumpRisk;
  status: 'approved' | 'warnings' | 'blocked';
}
