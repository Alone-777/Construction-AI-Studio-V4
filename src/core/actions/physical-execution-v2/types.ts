import type { WorldState } from '../../types/world-state';

export const PHYSICAL_EXECUTION_PLAN_SCHEMA = 'construction-physical-execution-plan/2' as const;
export const CONSTRUCTION_INTENT_SCHEMA = 'construction-intent/2' as const;
export const SIMULATION_RECEIPT_SCHEMA = 'construction-physical-simulation/2' as const;
export const PROVIDER_NEUTRAL_PROMPT_SCHEMA = 'construction-provider-neutral-prompt/2' as const;

export type ProgressMetric = 'AREA' | 'VOLUME' | 'LENGTH' | 'COUNT' | 'MASS' | 'STAGE';
export type PhysicalNodeKind =
  | 'ACQUIRE_TOOL' | 'APPROACH' | 'GRIP' | 'POSITION' | 'CONTACT' | 'APPLY_FORCE'
  | 'CUT' | 'SCRAPE' | 'DIG' | 'LIFT' | 'MOVE_MATERIAL' | 'PLACE' | 'FASTEN'
  | 'RELEASE' | 'SETTLE' | 'INSPECT' | 'STOP';
export type EdgeRelation = 'SEQUENCE' | 'REQUIRES' | 'REPEATS_UNTIL' | 'PARALLEL_SAFE';
export type ObservationPhase = 'SOURCE' | 'TRAJECTORY' | 'TERMINAL_FRAME';
export type ValidationSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export interface Quantity {
  value: number;
  unit: string;
}

export interface CanonicalProgressContract {
  beforePercentage: number;
  targetPercentage: number;
  tolerancePercentage: number;
}

export interface PhysicalProgressContract {
  metric: Exclude<ProgressMetric, 'STAGE'>;
  unit: string;
  from: number;
  target: number;
  tolerance: number;
  total?: number;
  zoneId: string;
  sectors?: string[];
}

export interface ConstructionIntentV2 {
  schemaVersion: typeof CONSTRUCTION_INTENT_SCHEMA;
  operationId: string;
  targetEntityId: string;
  methodId: string;
  authorizedZoneId: string;
  officialRevision: string;
  canonicalProgress: CanonicalProgressContract;
  physicalProgress?: PhysicalProgressContract;
  temporalConstraints: {
    preserveComponentIds: string[];
    forbiddenFutureComponentIds: string[];
    preserveZoneIds: string[];
    allowedMaterialDestinationZoneIds: string[];
  };
}

export type PhysicalPredicate =
  | { type: 'ACTOR_IN_ZONE'; zoneId: string }
  | { type: 'TOOL_AVAILABLE'; toolId: string }
  | { type: 'TOOL_HELD'; toolId: string }
  | { type: 'TARGET_EXISTS'; entityId: string }
  | { type: 'MATERIAL_AVAILABLE'; materialId: string; minQuantity?: number }
  | { type: 'COMPONENT_STATUS'; componentId: string; status: 'ABSENT' | 'FUTURE' | 'PARTIAL' | 'COMPLETE' }
  | { type: 'ZONE_ACCESSIBLE'; zoneId: string }
  | { type: 'CONTACT_ESTABLISHED'; contactId: string }
  | { type: 'CANONICAL_PROGRESS_AT'; targetId: string; percentage: number; tolerancePercentage?: number }
  | { type: 'FUTURE_COMPONENT_ABSENT'; componentId: string };

export type PhysicalEffect =
  | { type: 'SURFACE_REMOVED'; materialId: string; quantity?: Quantity; zoneId: string; destinationZoneId?: string }
  | { type: 'MATERIAL_TRANSFER'; materialId: string; quantity: Quantity; fromZoneId: string; toZoneId: string }
  | { type: 'MATERIAL_CONSUMED'; materialId: string; quantity: Quantity; fromZoneId?: string }
  | { type: 'MATERIAL_APPLIED'; materialId: string; quantity: Quantity; targetEntityId: string; fromZoneId?: string; zoneId: string }
  | { type: 'COMPONENT_MOVED'; componentId: string; fromZoneId: string; toZoneId: string }
  | { type: 'COMPONENT_ATTACHED'; componentId: string; targetEntityId: string; sourceZoneId?: string; quantity?: Quantity; zoneId: string }
  | { type: 'STATE_CHANGED'; entityId: string; property: string; from?: string; to: string; zoneId?: string }
  | { type: 'CANONICAL_PROGRESS_ADVANCED'; targetId: string; fromPercentage: number; toPercentage: number }
  | { type: 'PHYSICAL_PROGRESS_ADVANCED'; targetId: string; metric: Exclude<ProgressMetric, 'STAGE'>; unit: string; from: number; to: number; zoneId: string };

export interface ContactContract {
  id: string;
  mode: 'CUT' | 'SCRAPE' | 'DIG' | 'STRIKE' | 'PRESS' | 'GRIP' | 'PLACE' | 'FASTEN' | 'INSPECT';
  required: boolean;
  zoneId: string;
  targetEntityId?: string;
}

export interface MotionContract {
  mode: 'PUSH' | 'PULL' | 'STRIKE' | 'CUT' | 'PRESS' | 'LIFT' | 'CARRY' | 'PLACE' | 'SCRAPE' | 'INSPECT';
  repetitions?: number;
  boundedZoneId: string;
}

export interface ObservationContract {
  id: string;
  entityIds: string[];
  relation: string;
  metric: string;
  expected: Record<string, string | number | boolean>;
  tolerance?: number;
  visibleIn: ObservationPhase;
  mustPersist: boolean;
}

export interface PhysicalActionNodeV2 {
  id: string;
  kind: PhysicalNodeKind;
  instruction: string;
  actorId: string;
  toolId?: string;
  sourceEntityIds: string[];
  targetEntityIds: string[];
  zoneId: string;
  contact?: ContactContract;
  motion?: MotionContract;
  effects: PhysicalEffect[];
  preconditions: PhysicalPredicate[];
  postconditions: PhysicalPredicate[];
  evidenceIds: string[];
}

export interface PhysicalActionEdgeV2 {
  from: string;
  to: string;
  relation: EdgeRelation;
}

export interface PhysicalExecutionPlanV2 {
  schemaVersion: typeof PHYSICAL_EXECUTION_PLAN_SCHEMA;
  planId: string;
  officialBefore: {
    revision: string;
    timestamp: number;
    snapshotFingerprint: string;
  };
  intent: ConstructionIntentV2;
  nodes: PhysicalActionNodeV2[];
  edges: PhysicalActionEdgeV2[];
  evidence: ObservationContract[];
  constraints: {
    stopAtTarget: boolean;
    requirePersistentEffects: boolean;
    maxSubactions?: number;
  };
  metadata: {
    source: 'NATIVE_V2' | 'LEGACY_PHYSICAL_ACTION_IR' | 'EXECUTION_RECIPE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    limitations: string[];
  };
}

export interface ValidationIssueV2 {
  severity: ValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  details?: Record<string, unknown>;
}

export interface ValidationReportV2 {
  ok: boolean;
  issues: ValidationIssueV2[];
  order: string[];
}

export interface MaterialTransferRecord {
  materialId: string;
  quantity?: Quantity;
  fromZoneId: string;
  toZoneId: string;
  causeNodeId: string;
}

export interface PhysicalSimulationProjection {
  worldState: WorldState;
  actorZone: string;
  heldToolId?: string;
  contacts: string[];
  canonicalProgressByTarget: Record<string, number>;
  physicalProgressByTarget: Record<string, {
    metric: string;
    unit: string;
    value: number;
    zoneId: string;
  }>;
  materialTransfers: MaterialTransferRecord[];
  physicalChanges: Array<{ nodeId: string; effect: PhysicalEffect }>;
}

export interface PhysicalSimulationReceiptV2 {
  schemaVersion: typeof SIMULATION_RECEIPT_SCHEMA;
  planId: string;
  officialBeforeRevision: string;
  projectedAfterFingerprint: string | null;
  projected: PhysicalSimulationProjection | null;
  appliedEffects: Array<{ nodeId: string; effect: PhysicalEffect }>;
  validation: ValidationReportV2;
  commitAvailable: false;
}

export interface ProviderNeutralPromptArtifactV2 {
  schemaVersion: typeof PROVIDER_NEUTRAL_PROMPT_SCHEMA;
  sourcePlanId: string;
  officialBeforeRevision: string;
  executionBeats: Array<{
    id: string;
    instruction: string;
    toolId?: string;
    zoneId: string;
  }>;
  transformationEffects: PhysicalEffect[];
  evidence: ObservationContract[];
  canonicalProgress: CanonicalProgressContract;
  physicalProgress?: PhysicalProgressContract;
  forbiddenFutureComponentIds: string[];
  retryCorrections: Array<{ code: string; correction: string }>;
}
