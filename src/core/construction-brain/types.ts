import type { WorldState } from '../types/world-state';
import type { ExecutionProof, StagePercentage } from '../types';

export const CONSTRUCTION_BRAIN_SCHEMA_VERSION = '0.1.3' as const;

export type ConstructionBrainProviderId = 'KLING' | 'VEO_FAST';
export type ConstructionBrainReferenceRole = 'INITIAL' | 'FINAL' | 'PREVIOUS_ACCEPTED';

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
  startStagePercentage: StagePercentage;
  targetStagePercentage: StagePercentage;
  startState: ConstructionBrainStateDigest;
  targetState: ConstructionBrainStateDigest;
  actionRequirements: string[];
  executionEvidence: string[];
  forbiddenFutureElements: string[];
  prompt: {
    kling?: string;
    image?: string;
  };
}

export interface ConstructionBrainReferenceSlot {
  role: ConstructionBrainReferenceRole;
  uri?: string;
  sourceSceneId?: string;
  required: boolean;
}

export interface ConstructionBrainStateDigest {
  constructionProgress: number;
  constructionStatus: string;
  activeZone: string;
  existingComponents: string[];
  partialComponents: string[];
  futureComponents: string[];
  visibleMaterials: Array<{
    materialId: string;
    quantity: number;
    status: string;
    location: string;
  }>;
  residues: Array<{
    id: string;
    materialId: string;
    quantity: number;
    status: string;
    location: string;
  }>;
  tools: Array<{
    toolId: string;
    status: string;
    location: string;
    inUse: boolean;
  }>;
  worker: {
    characterId: string;
    zone: string;
    orientation: string;
    currentAction?: string;
    currentTool?: string;
    carriedObjects: string[];
  };
  permanentObjects: string[];
  temporaryObjects: string[];
  terrain: WorldState['terrain'];
  climate: string;
  light: string;
  camera: string;
}

export interface ConstructionBrainKeyframeSpec {
  id: string;
  sceneId: string;
  kind: 'ENTRY' | 'EXIT';
  expectedState: ConstructionBrainStateDigest;
  referencePlan: ConstructionBrainReferenceSlot[];
  continuityLocks: {
    preserveWorkerIdentity: string;
    preserveExistingComponents: string[];
    preservePermanentObjects: string[];
    preserveZones: string[];
    preserveTerrain: boolean;
    forbiddenFutureElements: string[];
  };
  requiredVisibleEvidence: string[];
  approvalChecklist: string[];
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
  keyframes: {
    entry: ConstructionBrainKeyframeSpec;
    exit: ConstructionBrainKeyframeSpec;
  };
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


export type FireflyBridgeModelId = 'KLING' | 'VEO_FAST';

export type FireflyJobSource =
  | {
      kind: 'KEYFRAME';
      keyframeId: string;
    }
  | {
      kind: 'PREVIOUS_JOB_LAST_FRAME';
      previousJobId: string;
    };

export interface FireflyExecutionJob {
  id: string;
  projectId: string;
  sceneId: string;
  sceneNumber: number;
  segmentId: string;
  segmentIndex: number;
  startStagePercentage: StagePercentage;
  targetStagePercentage: StagePercentage;
  model: FireflyBridgeModelId;
  durationSeconds: number;
  aspectRatio: '16:9';
  resolution: {
    width: 1920;
    height: 1080;
  };
  source: FireflyJobSource;
  terminalRequirement: 'INTERMEDIATE_CONTINUATION' | 'SCENE_EXIT';
  entryKeyframeId: string;
  exitKeyframeId: string;
  prompt: string;
  negativeConstraints: string[];
  continuityLocks: ConstructionBrainKeyframeSpec['continuityLocks'];
  acceptanceChecklist: string[];
  output: {
    videoSlot: string;
    lastFrameSlot: string;
  };
  status: 'READY';
}

export interface FireflyExecutionPlan {
  schemaVersion: typeof CONSTRUCTION_BRAIN_SCHEMA_VERSION;
  projectId: string;
  jobs: FireflyExecutionJob[];
}

export interface FireflyExecutionPlanValidationResult {
  valid: boolean;
  issues: ConstructionBrainValidationIssue[];
}
