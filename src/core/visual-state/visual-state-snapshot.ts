import type { PhysicalActionIR, PhysicalTargetStatus } from '../actions/physical-action-ir';
import type { Camera } from '../types/camera';
import type { ProjectDNA, VisualDNA } from '../types/project';
import type { Operation, Scene, Stage } from '../types/scene';
import type { SpatialMap } from '../types/spatial';
import type { WorldState } from '../types/world-state';
import type { CameraConfig, SceneMetadata } from '../visual/VisualSceneState';

export type VisualStateKind = 'OFFICIAL' | 'CANDIDATE';
export type VisualTemporalPoint = 'BEFORE' | 'AFTER';
export type VisualStageOutcome = 'COMMITTED' | 'REJECTED' | 'PENDING';
export type VisualWorldStateSource = 'BEFORE' | 'CANDIDATE';

export interface VisualStateSnapshot {
  id: string;
  kind: VisualStateKind;
  temporalPoint: VisualTemporalPoint;
  stageOutcome: VisualStageOutcome;
  worldStateSource: VisualWorldStateSource;
  identity: {
    projectId: string;
    visualDNAId: string;
    sceneId: string;
    stageId: string;
    operationId: string;
    progress: number;
  };
  actor: {
    characterId: string;
    visualIdentityId: string;
    name: string;
    appearance: string;
    clothing: string;
    zone: string;
    orientation: string;
    toolInUse?: string;
  };
  action: {
    physicalActionIRId: string;
    visibility: 'NOT_APPLIED' | 'ATTEMPTED' | 'COMMITTED' | 'REJECTED_NOT_APPLIED';
    primary: PhysicalActionIR['primaryAction'];
    target: PhysicalActionIR['target'];
    tools: string[];
    materials: string[];
    expectedTargetStatus: PhysicalTargetStatus;
  };
  construction: {
    type: string;
    status: string;
    progress: number;
    visibleComponents: string[];
    completedComponents: string[];
    partialComponents: string[];
    activeComponent?: string;
    targetState: PhysicalTargetStatus;
    pendingComponents: string[];
  };
  materials: {
    visible: Array<{
      materialId: string;
      quantity: number;
      status: string;
      location: string;
    }>;
    active: string[];
    incorporated: Array<{ materialId: string; quantity: number; location?: string }>;
  };
  space: {
    activeZone: string;
    stateZone: string;
    relevantZones: Array<{
      id: string;
      name: string;
      type: string;
      orientation?: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  };
  camera: {
    id: Camera['id'];
    relativePosition: { x: number; y: number };
    orientation: number;
    conceptualHeight: Camera['conceptualHeight'];
    framing: Camera['framing'];
    allowedMovement: Camera['allowedMovement'];
    visibleZones: string[];
    partiallyVisibleZones: string[];
    hiddenZones: string[];
    viewpoint: {
      position: { x: number; y: number };
      target: { x: number; y: number };
      fov: number;
      aspectRatio: number;
      movement: CameraConfig['movement'];
    };
    lens: {
      focalLength: number;
      aperture: string;
      focusDistance: number;
      depthOfField: boolean;
    };
  };
  environment: {
    preset: VisualDNA['environment']['preset'];
    terrain: WorldState['terrain'];
    climate: string;
    light: string;
    timeOfDay: SceneMetadata['timeOfDay'];
    weather: SceneMetadata['weather'];
    permanentObjects: string[];
    zoneVegetation: Array<{ zoneId: string; state: string }>;
  };
  continuity: {
    preserveActorIdentity: string;
    preserveClothing: string;
    preserveComponents: string[];
    preserveZones: string[];
    preserveMaterialPlacements: string[];
    preserveCameraId: Camera['id'];
    requiredVisualElements: string[];
    forbiddenVisualElements: string[];
    futureForbidden: string[];
    terrainOutsideActiveZoneUnchanged: true;
  };
  evidence: {
    actionEvidence: string[];
    target: { id: string; status: PhysicalTargetStatus };
    completedComponents: string[];
    partialComponents: string[];
    materialQuantityChanges: PhysicalActionIR['expectedEffects']['materialQuantityChanges'];
  };
}

export interface BuildStageVisualStateSnapshotsInput {
  projectId: string;
  scene: Scene;
  stage: Stage;
  operation: Operation;
  visualDNA: VisualDNA;
  spatialMap: SpatialMap;
  cameras: ProjectDNA['cameras'];
}

export interface StageVisualStateSnapshots {
  before?: VisualStateSnapshot;
  candidate?: VisualStateSnapshot;
  official?: VisualStateSnapshot;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function targetStatus(state: WorldState, targetId: string): PhysicalTargetStatus {
  if (state.existingComponents.includes(targetId)) return 'COMPLETE';
  if (state.partialComponents.includes(targetId)) return 'PARTIAL';
  if (state.futureComponents.includes(targetId)) return 'FUTURE';
  return 'ABSENT';
}

function stageOutcome(stage: Stage): VisualStageOutcome {
  if (stage.status === 'rejected') return 'REJECTED';
  if (stage.decision) return 'COMMITTED';
  return 'PENDING';
}

function selectedCamera(
  stage: Stage,
  visualDNA: VisualDNA,
  cameras: ProjectDNA['cameras'],
): { camera: Camera; viewpoint: CameraConfig } {
  if (stage.cameraId === 'A') return { camera: cameras.a, viewpoint: visualDNA.camera.cameraA };
  if (stage.cameraId === 'B') return { camera: cameras.b, viewpoint: visualDNA.camera.cameraB };
  throw new Error(`Unknown camera ${stage.cameraId} for stage ${stage.percentage}`);
}

function actionVisibility(
  kind: VisualStateKind,
  temporalPoint: VisualTemporalPoint,
  outcome: VisualStageOutcome,
): VisualStateSnapshot['action']['visibility'] {
  if (kind === 'CANDIDATE') return 'ATTEMPTED';
  if (temporalPoint === 'BEFORE') return 'NOT_APPLIED';
  if (outcome === 'COMMITTED') return 'COMMITTED';
  return 'REJECTED_NOT_APPLIED';
}

interface BuildSnapshotInput extends BuildStageVisualStateSnapshotsInput {
  state: WorldState;
  actionIR: PhysicalActionIR;
  kind: VisualStateKind;
  temporalPoint: VisualTemporalPoint;
  outcome: VisualStageOutcome;
  worldStateSource: VisualWorldStateSource;
}

function buildVisualStateSnapshot({
  projectId,
  scene,
  stage,
  operation,
  visualDNA,
  spatialMap,
  cameras,
  state,
  actionIR,
  kind,
  temporalPoint,
  outcome,
  worldStateSource,
}: BuildSnapshotInput): VisualStateSnapshot {
  const { camera, viewpoint } = selectedCamera(stage, visualDNA, cameras);
  const activeZone = spatialMap.zones.find(zone => zone.id === actionIR.zone);
  if (!activeZone) throw new Error(`Unknown active zone ${actionIR.zone}`);

  const currentTargetStatus = targetStatus(state, actionIR.target.id);
  const visibleComponents = uniqueSorted([
    ...state.existingComponents,
    ...state.partialComponents,
  ]);
  const pendingComponents = uniqueSorted([
    ...state.futureComponents.filter(component =>
      component !== actionIR.target.id || currentTargetStatus === 'FUTURE'
    ),
    ...actionIR.constraints.forbiddenFutureComponents,
  ]);
  const futureForbidden = uniqueSorted([
    ...pendingComponents,
    ...actionIR.constraints.preventPrematureElements,
  ]);
  const visibility = actionVisibility(kind, temporalPoint, outcome);
  const relevantZoneIds = uniqueSorted([actionIR.zone, ...actionIR.constraints.preserveZones]);
  const relevantZones = relevantZoneIds.map(zoneId => {
    const zone = spatialMap.zones.find(candidate => candidate.id === zoneId);
    if (!zone) throw new Error(`Unknown continuity zone ${zoneId}`);
    return {
      id: zone.id,
      name: zone.name,
      type: zone.type,
      orientation: zone.orientation,
      bounds: { ...zone.bounds },
    };
  });
  const toolInUse = state.tools.find(tool => tool.inUse || tool.status === 'em_uso')?.toolId;
  const preserveMaterialPlacements = uniqueSorted(state.materials.map(material =>
    `${material.materialId}@${material.location}`
  ));

  return {
    id: `visual-state:${projectId}:${scene.id}:${stage.percentage}:${kind.toLowerCase()}:${temporalPoint.toLowerCase()}`,
    kind,
    temporalPoint,
    stageOutcome: outcome,
    worldStateSource,
    identity: {
      projectId,
      visualDNAId: visualDNA.id,
      sceneId: scene.id,
      stageId: String(stage.percentage),
      operationId: operation.id,
      progress: state.construction.progress,
    },
    actor: {
      characterId: state.character.characterId,
      visualIdentityId: visualDNA.character.id,
      name: visualDNA.character.name,
      appearance: visualDNA.character.appearance,
      clothing: visualDNA.character.clothing,
      zone: state.character.currentZone,
      orientation: state.character.orientation,
      toolInUse,
    },
    action: {
      physicalActionIRId: actionIR.id,
      visibility,
      primary: { ...actionIR.primaryAction },
      target: {
        ...actionIR.target,
        elements: [...actionIR.target.elements],
      },
      tools: [...actionIR.tools],
      materials: [...actionIR.materials],
      expectedTargetStatus: actionIR.expectedEffects.targetStatus.after,
    },
    construction: {
      type: state.construction.type,
      status: state.construction.status,
      progress: state.construction.progress,
      visibleComponents,
      completedComponents: uniqueSorted(state.existingComponents),
      partialComponents: uniqueSorted(state.partialComponents),
      activeComponent: state.partialComponents.includes(actionIR.target.id)
        ? actionIR.target.id
        : undefined,
      targetState: currentTargetStatus,
      pendingComponents,
    },
    materials: {
      visible: state.materials
        .filter(material => material.quantity > 0)
        .map(material => ({
          materialId: material.materialId,
          quantity: material.quantity,
          status: material.status,
          location: material.location,
        }))
        .sort((a, b) => a.materialId.localeCompare(b.materialId)),
      active: [...actionIR.materials],
      incorporated: state.consumedMaterials
        .map(material => ({
          materialId: material.materialId,
          quantity: material.quantity,
          location: material.location,
        }))
        .sort((a, b) => a.materialId.localeCompare(b.materialId)),
    },
    space: {
      activeZone: actionIR.zone,
      stateZone: state.activeZone,
      relevantZones,
    },
    camera: {
      id: camera.id,
      relativePosition: { ...camera.relativePosition },
      orientation: camera.orientation,
      conceptualHeight: camera.conceptualHeight,
      framing: camera.framing,
      allowedMovement: camera.allowedMovement,
      visibleZones: [...camera.visibleZones],
      partiallyVisibleZones: [...camera.partiallyVisibleZones],
      hiddenZones: [...camera.hiddenZones],
      viewpoint: {
        position: { ...viewpoint.position },
        target: { ...viewpoint.target },
        fov: viewpoint.fov,
        aspectRatio: viewpoint.aspectRatio,
        movement: viewpoint.movement,
      },
      lens: { ...visualDNA.camera.lensDefaults },
    },
    environment: {
      preset: visualDNA.environment.preset,
      terrain: { ...state.terrain },
      climate: state.climate,
      light: state.light,
      timeOfDay: visualDNA.environment.timeOfDay,
      weather: visualDNA.environment.weather,
      permanentObjects: uniqueSorted(state.permanentObjects),
      zoneVegetation: Object.entries(state.vegetation)
        .map(([zoneId, vegetationState]) => ({ zoneId, state: vegetationState }))
        .sort((a, b) => a.zoneId.localeCompare(b.zoneId)),
    },
    continuity: {
      preserveActorIdentity: actionIR.constraints.preserveActorId,
      preserveClothing: visualDNA.character.clothing,
      preserveComponents: uniqueSorted([
        ...state.existingComponents,
        ...actionIR.constraints.preserveComponents,
      ]),
      preserveZones: uniqueSorted(actionIR.constraints.preserveZones),
      preserveMaterialPlacements,
      preserveCameraId: camera.id,
      requiredVisualElements: uniqueSorted(visualDNA.consistencyRules.requiredVisualElements),
      forbiddenVisualElements: uniqueSorted([
        ...visualDNA.consistencyRules.forbiddenVisualElements,
        ...futureForbidden,
      ]),
      futureForbidden,
      terrainOutsideActiveZoneUnchanged: true,
    },
    evidence: {
      actionEvidence: visibility === 'ATTEMPTED' || visibility === 'COMMITTED'
        ? [...actionIR.evidence]
        : [],
      target: { id: actionIR.target.id, status: currentTargetStatus },
      completedComponents: uniqueSorted(state.existingComponents),
      partialComponents: uniqueSorted(state.partialComponents),
      materialQuantityChanges: visibility === 'ATTEMPTED' || visibility === 'COMMITTED'
        ? actionIR.expectedEffects.materialQuantityChanges.map(change => ({ ...change }))
        : [],
    },
  };
}

export function buildStageVisualStateSnapshots(
  input: BuildStageVisualStateSnapshotsInput,
): StageVisualStateSnapshots {
  const { stage } = input;
  if (!stage.worldStateBefore || !stage.worldStateAfter || !stage.physicalActionIR) {
    return {};
  }

  const outcome = stageOutcome(stage);
  const common = { ...input, actionIR: stage.physicalActionIR, outcome };
  const before = buildVisualStateSnapshot({
    ...common,
    state: stage.worldStateBefore,
    kind: 'OFFICIAL',
    temporalPoint: 'BEFORE',
    worldStateSource: 'BEFORE',
  });
  const candidate = buildVisualStateSnapshot({
    ...common,
    state: stage.worldStateAfter,
    kind: 'CANDIDATE',
    temporalPoint: 'AFTER',
    worldStateSource: 'CANDIDATE',
  });

  if (outcome === 'COMMITTED') {
    return {
      before,
      candidate,
      official: buildVisualStateSnapshot({
        ...common,
        state: stage.worldStateAfter,
        kind: 'OFFICIAL',
        temporalPoint: 'AFTER',
        worldStateSource: 'CANDIDATE',
      }),
    };
  }

  if (outcome === 'REJECTED') {
    return {
      before,
      candidate,
      official: buildVisualStateSnapshot({
        ...common,
        state: stage.worldStateBefore,
        kind: 'OFFICIAL',
        temporalPoint: 'AFTER',
        worldStateSource: 'BEFORE',
      }),
    };
  }

  return { before, candidate };
}
