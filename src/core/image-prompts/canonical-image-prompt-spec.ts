import type { PhysicalActionIR, PhysicalTargetStatus } from '../actions/physical-action-ir';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';

export interface CanonicalImagePromptSpec {
  id: string;
  identity: {
    snapshotId: string;
    projectId: string;
    sceneId: string;
    stageId: string;
    operationId: string;
    temporalPoint: VisualStateSnapshot['temporalPoint'];
    snapshotKind: VisualStateSnapshot['kind'];
    stageOutcome: VisualStateSnapshot['stageOutcome'];
    worldStateSource: VisualStateSnapshot['worldStateSource'];
    progress: number;
  };
  subject: {
    characterId: string;
    visualIdentityId: string;
    name: string;
    appearance: string;
    clothing: string;
    zone: string;
    orientation: string;
    toolInUse?: string;
  };
  primaryAction: {
    physicalActionIRId: string;
    visibility: VisualStateSnapshot['action']['visibility'];
    type: PhysicalActionIR['primaryAction']['type'];
    verb: string;
    description: string;
    target: {
      id: string;
      label: string;
      elements: string[];
    };
    tools: string[];
    materials: string[];
    expectedTargetStatus: PhysicalTargetStatus;
  };
  currentConstruction: {
    type: string;
    status: string;
    progress: number;
    presentComponents: string[];
    completedComponents: string[];
    partialComponents: string[];
    activeTarget?: string;
    targetState: PhysicalTargetStatus;
    pendingComponents: string[];
  };
  spatialContext: VisualStateSnapshot['space'];
  materials: VisualStateSnapshot['materials'];
  camera: VisualStateSnapshot['camera'];
  environment: VisualStateSnapshot['environment'];
  mustShow: {
    subject: string[];
    action: string[];
    construction: string[];
    toolsAndMaterials: string[];
    evidence: string[];
  };
  mustPreserve: string[];
  mustNotShow: {
    futureComponents: string[];
    visualElements: string[];
    prohibitedChanges: string[];
  };
  completionEvidence: string[];
  realismRequirements: string[];
}
