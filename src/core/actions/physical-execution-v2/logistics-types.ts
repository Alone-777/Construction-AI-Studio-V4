import type { HandlingProfile, LogisticsEquipment } from '../../types/materials';
import type { SpatialMap } from '../../types/spatial';
import type { PhysicalNodeKind, ValidationIssueV2 } from './types';

export interface LogisticsArea {
  zoneId: string;
  layout: 'COMPACT_STAGING_POINT';
  description: string;
}

/** Observations must refer to the CURRENT source, never the design reference. */
export interface LogisticsSourceEvidence {
  frameId: string;
  frameHash: string;
  officialRevision: string;
  observations: Array<{
    resourceKey: string;
    zoneId: string;
    visibility: 'VISIBLE' | 'OFFSCREEN_ACCESSIBLE' | 'ABSENT' | 'UNKNOWN';
    evidenceId: string;
    /** Required for offscreen stock: a documented entry/retrieval route. */
    entryRoute?: string[];
  }>;
  workers: Array<{ id: string; zoneId: string; evidenceId: string }>;
}

export interface LogisticsPlanningContext {
  workerCount?: number;
  spatialMap?: SpatialMap;
  restrictedRouteZoneIds?: string[];
  handling?: HandlingProfile;
  handlingByMaterial?: Record<string, HandlingProfile>;
  area?: LogisticsArea;
  sourceEvidence?: LogisticsSourceEvidence;
  /** No caller means no visual evidence: never infer visibility from inventory. */
  sourceFrameId?: string;
  sourceFrameHash?: string;
}

export interface LogisticsResource {
  key: string;
  kind: 'TOOL' | 'MATERIAL' | 'EQUIPMENT';
  id: string;
  sourceZoneId: string;
  origin: string;
  registered: boolean;
  available: boolean;
  quantity?: number;
  requiredQuantity?: number;
  heldBy?: string;
  equipment?: LogisticsEquipment;
}

export interface LogisticsHandlingStep {
  id: string;
  /** Reuses the existing V2 action vocabulary, not a second action language. */
  kind: PhysicalNodeKind;
  resourceKey: string;
  zoneId: string;
  instruction: string;
}

export interface LogisticsMovement {
  resourceKey: string;
  destinationZoneId: string;
  approachRoute: string[];
  transportRoute: string[];
  routesVerified: boolean;
  method: 'ALREADY_HELD' | 'HAND_CARRY' | 'TEAM_CARRY' | 'CART' | 'HOIST' | 'UNRESOLVED';
  transportMethod: 'HAND_CARRY' | 'TEAM_CARRY' | 'CART' | 'UNRESOLVED';
  placementKind: 'FASTEN' | 'PLACE';
  handling: HandlingProfile;
  requiredWorkers: number;
  equipmentKinds: LogisticsEquipment['kind'][];
  equipmentKeys: string[];
  /** Complete causal chain; a diagnostic child contract of the V2 plan. */
  steps: LogisticsHandlingStep[];
}

export interface EquipmentLogisticsPlan {
  schemaVersion: 'construction-equipment-logistics/1';
  mode: 'SHADOW';
  officialRevision: string;
  officialFingerprint: string;
  sourceFrameId?: string;
  sourceFrameHash?: string;
  sourceEvidence?: LogisticsSourceEvidence;
  configuredWorkers: number;
  primaryActorId: string;
  authorizedWorkZoneId: string;
  workerArrivalRoutes: Array<{ workerId: string; route: string[]; verified: boolean }>;
  durationSeconds: number;
  area?: LogisticsArea;
  resources: LogisticsResource[];
  movements: LogisticsMovement[];
  issues: ValidationIssueV2[];
  assumptions: string[];
}

export interface LogisticsPreflight {
  mode: 'SHADOW';
  status: 'READY' | 'PREP_REQUIRED' | 'WOULD_BLOCK';
  wouldBlockGeneration: boolean;
  commitAvailable: false;
  issues: ValidationIssueV2[];
  preparation: {
    required: boolean;
    resourceKeys: string[];
    workerCount: number;
    strategy: 'VERIFY_CURRENT_SOURCE' | 'RETRIEVAL_OR_DELIVERY_REQUIRED';
    /** Proposal only. Never an edited OFFICIAL frame or an automatically inserted Job. */
    instructions: string[];
  };
  projection: null | {
    resources: Array<{
      resourceKey: string;
      location: string;
      state: 'HELD' | 'SUPPORTED' | 'INCORPORATED';
      remainingAtSource?: number;
    }>;
    transitions: Array<{
      stepId: string;
      resourceKey: string;
      location: string;
      state: string;
    }>;
  };
}
