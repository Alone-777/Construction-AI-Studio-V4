import type { WorldState } from '../types/world-state';
import type { ExecutionProof, StagePercentage } from '../types';

export const CONSTRUCTION_BRAIN_SCHEMA_VERSION = '0.1.0' as const;

export type ConstructionBrainProviderId = 'KLING' | 'VEO_FAST';

export interface ConstructionBrainProjectArtifact {
  schemaVersion: typeof CONSTRUCTION_BRAIN_SCHEMA_VERSION;
  projectId: string;
  name: string;
  domain: 'construction';
  master: {
    aspectRatio: '16:9';
    width: 1920;
    height: 1080;
    targetDurationSeconds: number;
  };
  providers: Record<ConstructionBrainProviderId, {
    maxGenerationSeconds: number;
    role: 'PRIMARY_LONG_ACTION' | 'SECONDARY_SHORT_ACTION';
  }>;
  globalRules: string[];
}

export interface ConstructionBrainMapArtifact {
  schemaVersion: typeof CONSTRUCTION_BRAIN_SCHEMA_VERSION;
  projectId: string;
  orderedComponentIds: string[];
  components: Array<{
    id: string;
    name: string;
    type: string;
    dependencies: string[];
    zones: string[];
    status: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    required: boolean;
  }>;
  operations: Array<{
    id: string;
    name: string;
    type: string;
    componentId?: string;
    zones: string[];
    elements: string[];
  }>;
}

export interface ConstructionBrainWorldSnapshot {
  sceneId: string;
  stagePercentage: StagePercentage;
  status: 'approved' | 'rejected' | 'pending';
  before?: WorldState;
  after?: WorldState;
  executionProof?: ExecutionProof;
}

export interface ConstructionBrainWorldStateArtifact {
  schemaVersion: typeof CONSTRUCTION_BRAIN_SCHEMA_VERSION;
  projectId: string;
  initial: WorldState;
  snapshots: ConstructionBrainWorldSnapshot[];
}

export interface ConstructionBrainGenerationSegment {
  id: string;
  provider: ConstructionBrainProviderId;
  durationSeconds: number;
  maxProviderSeconds: number;
  sourceSceneId: string;
}

export interface ConstructionBrainSceneArtifact {
  id: string;
  number: number;
  operationId: string;
  durationSeconds: number;
  generationSegments: ConstructionBrainGenerationSegment[];
  actionRequirements: string[];
  executionEvidence: string[];
  forbiddenFutureElements: string[];
  preservedZones: string[];
  prompts: {
    kling?: string;
    image?: string;
  };
}

export interface ConstructionBrainScenesArtifact {
  schemaVersion: typeof CONSTRUCTION_BRAIN_SCHEMA_VERSION;
  projectId: string;
  scenes: ConstructionBrainSceneArtifact[];
}

export interface ConstructionBrainBundle {
  project: ConstructionBrainProjectArtifact;
  constructionMap: ConstructionBrainMapArtifact;
  worldState: ConstructionBrainWorldStateArtifact;
  scenes: ConstructionBrainScenesArtifact;
}

export interface ConstructionBrainValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  sceneId?: string;
  componentId?: string;
}

export interface ConstructionBrainValidationResult {
  valid: boolean;
  issues: ConstructionBrainValidationIssue[];
}
