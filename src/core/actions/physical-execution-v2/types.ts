import type { WorldState } from '../../types/world-state';

export type PhysicalProgressMetricV2 = 'AREA' | 'VOLUME' | 'LENGTH' | 'COUNT' | 'MASS' | 'STAGE';
export type PhysicalProgressConfidenceV2 = 'EXACT' | 'DERIVED' | 'LEGACY_DERIVED' | 'UNKNOWN';
export type PhysicalNodeKindV2 =
  | 'ACQUIRE_TOOL'
  | 'APPROACH'
  | 'GRIP'
  | 'POSITION'
  | 'CONTACT'
  | 'APPLY_FORCE'
  | 'CUT'
  | 'SCRAPE'
  | 'DIG'
  | 'LIFT'
  | 'MOVE_MATERIAL'
  | 'PLACE'
  | 'FASTEN'
  | 'RELEASE'
  | 'SETTLE'
  | 'INSPECT'
  | 'STOP';
export type PhysicalEdgeRelationV2 = 'SEQUENCE' | 'REQUIRES' | 'REPEATS_UNTIL' | 'PARALLEL_SAFE';
export type PhysicalEffectTypeV2 =
  | 'SURFACE_REMOVED'
  | 'MATERIAL_MOVED'
  | 'COMPONENT_MOVED'
  | 'COMPONENT_ATTACHED'
  | 'MATERIAL_APPLIED'
  | 'MATERIAL_CONSUMED'
  | 'MATERIAL_DEPOSITED'
  | 'STATE_CHANGED'
  | 'PROGRESS_ADVANCED';
export type PhysicalPredicateTypeV2 =
  | 'ACTOR_IN_ZONE'
  | 'TOOL_AVAILABLE'
  | 'TOOL_HELD'
  | 'TARGET_EXISTS'
  | 'MATERIAL_AVAILABLE'
  | 'COMPONENT_STATUS'
  | 'REGION_ACCESSIBLE'
  | 'CONTACT_ESTABLISHED'
  | 'PROGRESS_AT'
  | 'FUTURE_COMPONENT_ABSENT';
export type PhysicalEvidenceMomentV2 = 'SOURCE' | 'TRAJECTORY' | 'TERMINAL_FRAME';

export interface CanonicalProgressContractV2 {
  fromPercent: number;
  targetPercent: number;
}

export interface ObservableProgressContractV2 {
  metric: PhysicalProgressMetricV2;
  from: number;
  target: number;
  unit: string;
  tolerance: number;
  regionId: string;
  confidence: PhysicalProgressConfidenceV2;
  basis: string;
}

export interface ConstructionIntentV2 {
  schemaVersion: 'construction-intent/2';
  operationId: string;
  targetEntityId: string;
  methodId: string;
  authorizedRegionId: string;
  officialRevision: string;
  canonicalProgress: CanonicalProgressContractV2;
  observableProgress: ObservableProgressContractV2;
  temporalConstraints: {
    forbiddenFutureComponentIds: string[];
    preserveComponentIds: string[];
    preserveRegionIds: string[];
  };
}

export interface PhysicalQuantityV2 {
  value: number;
  unit: string;
}

export interface PhysicalPredicateV2 {
  type: PhysicalPredicateTypeV2;
  actorId?: string;
  toolId?: string;
  targetId?: string;
  materialId?: string;
  regionId?: string;
  status?: string;
  value?: number;
}

export interface PhysicalEffectV2 {
  type: PhysicalEffectTypeV2;
  flowId?: string;
  materialId?: string;
  componentId?: string;
  targetId?: string;
  sourceEntityId?: string;
  destinationEntityId?: string;
  sourceRegionId?: string;
  destinationRegionId?: string;
  fromState?: string;
  toState?: string;
  quantity?: PhysicalQuantityV2;
  fromPercent?: number;
  toPercent?: number;
  qualitative?: boolean;
}

export interface PhysicalObservationContractV2 {
  id: string;
  entityIds: string[];
  relation: string;
  metric: string;
  expected: Record<string, unknown>;
  tolerance: number;
  visibleIn: PhysicalEvidenceMomentV2;
  mustPersist: boolean;
}

export interface PhysicalActionNodeV2 {
  id: string;
  kind: PhysicalNodeKindV2;
  actorId: string;
  toolId?: string;
  sourceEntityIds: string[];
  targetEntityIds: string[];
  regionId: string;
  contact?: {
    mode: string;
    required: boolean;
    location: string;
  };
  motion?: {
    forceMode?: string;
    direction?: string;
    repetitions?: number;
  };
  effects: PhysicalEffectV2[];
  preconditions: PhysicalPredicateV2[];
  postconditions: PhysicalPredicateV2[];
  evidenceIds: string[];
}

export interface PhysicalActionEdgeV2 {
  from: string;
  to: string;
  relation: PhysicalEdgeRelationV2;
}

export interface PhysicalExecutionPlanV2 {
  schemaVersion: 'construction-physical-intelligence/2';
  planId: string;
  officialBefore: {
    revision: string;
    timestamp: number;
  };
  intent: ConstructionIntentV2;
  nodes: PhysicalActionNodeV2[];
  edges: PhysicalActionEdgeV2[];
  evidence: PhysicalObservationContractV2[];
  constraints: {
    stopAtTarget: boolean;
    requirePersistentEffects: boolean;
    allowedAuxiliaryRegions: string[];
    maxSubactions: number;
  };
  metadata: {
    mode: 'SHADOW' | 'ENFORCE';
    source: 'DIRECT_STAGE_PLANNER' | 'LEGACY_PHYSICAL_ACTION_IR';
    confidence: PhysicalProgressConfidenceV2;
    limitations: string[];
  };
}

export interface PhysicalValidationIssueV2 {
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  nodeId?: string;
  details?: Record<string, unknown>;
}

export interface PhysicalValidationReportV2 {
  ok: boolean;
  blockerCount: number;
  warningCount: number;
  issues: PhysicalValidationIssueV2[];
  topologicalOrder: string[];
}

export interface PhysicalAppliedEffectV2 {
  nodeId: string;
  effect: PhysicalEffectV2;
}

export interface PhysicalSimulationReceiptV2 {
  schemaVersion: 'physical-simulation-receipt/2';
  planId: string;
  officialBeforeRevision: string;
  projectedState: WorldState;
  projectedFingerprint: string;
  appliedEffects: PhysicalAppliedEffectV2[];
  validation: PhysicalValidationReportV2;
  canonicalProgress: {
    fromPercent: number;
    targetPercent: number;
    projectedPercent: number;
  };
  observableProgress: ObservableProgressContractV2;
  commitAvailable: false;
  officialUnchanged: boolean;
}

export interface ToolAffordanceV2 {
  id: string;
  aliases: string[];
  contactModes: string[];
  supportedNodeKinds: PhysicalNodeKindV2[];
  supportedEffects: PhysicalEffectTypeV2[];
  compatibleMaterialClasses: string[];
  forceModes: string[];
  requiresTwoHands: boolean;
}

export interface MaterialAffordanceV2 {
  materialClass: string;
  aliases: string[];
  compatibleTools: string[];
  supportedEffects: PhysicalEffectTypeV2[];
  canBeCut: boolean;
  canBeScraped: boolean;
  canBeLifted: boolean;
  canBeAttached: boolean;
}

export interface ProviderNeutralPromptArtifactV2 {
  schemaVersion: 'provider-neutral-prompt-artifact/2';
  sourcePlanId: string;
  officialBeforeRevision: string;
  executionBeats: Array<{
    nodeId: string;
    kind: PhysicalNodeKindV2;
    text: string;
    required: boolean;
  }>;
  progress: ConstructionIntentV2['canonicalProgress'] & {
    observable: ObservableProgressContractV2;
  };
  terminalEvidence: PhysicalObservationContractV2[];
  trajectoryEvidence: PhysicalObservationContractV2[];
  forbiddenFutureComponentIds: string[];
  continuity: {
    preserveCamera: boolean;
    preserveTerrain: boolean;
    preserveWorkerIdentity: boolean;
  };
}

export interface CompiledAdobeFireflyPromptV2 {
  platform: 'ADOBE_FIREFLY';
  model: string;
  prompt: string;
  characterCount: number;
  maxChars: number;
  sourceArtifactSchema: 'provider-neutral-prompt-artifact/2';
}
