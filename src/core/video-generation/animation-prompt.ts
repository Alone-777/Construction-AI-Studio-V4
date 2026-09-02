import type { PhysicalActionIR } from '../actions/physical-action-ir';
import type { ImageGenerationResult } from '../image-generation';
import type { VisualReferenceRecord } from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import type {
  CanonicalAnimationPromptSpec,
  CanonicalAnimationPromptSpecResult,
  OfficialVideoSource,
  VideoPreparationErrorCode,
  VideoPreparationFailure,
  VideoResolution,
} from './types';

export interface CreateCanonicalAnimationPromptSpecInput {
  readonly physicalAction: PhysicalActionIR;
  readonly snapshot: VisualStateSnapshot;
  readonly source: VisualReferenceRecord | ImageGenerationResult;
  readonly output: {
    readonly durationSeconds: number;
    readonly resolution?: VideoResolution;
  };
}

export function createCanonicalAnimationPromptSpec(
  input: CreateCanonicalAnimationPromptSpecInput,
): CanonicalAnimationPromptSpecResult {
  const { physicalAction, snapshot } = input;
  if (!isOfficialReference(input.source)) {
    return failure(
      'INVALID_SOURCE_IMAGE',
      'Animation requires an explicitly approved OFFICIAL image reference.',
    );
  }
  const source = input.source;
  if (!isValidOfficialSource(source)) {
    return failure(
      'INVALID_SOURCE_IMAGE',
      'Animation source must be approved, committed, official and contain a valid asset.',
    );
  }
  if (!isOfficialCommittedSnapshot(snapshot)) {
    return failure(
      'TEMPORAL_BINDING_MISMATCH',
      'Animation requires the committed OFFICIAL AFTER snapshot for the stage.',
    );
  }
  if (!physicalActionMatchesSnapshot(physicalAction, snapshot)) {
    return failure(
      'PHYSICAL_ACTION_BINDING_MISMATCH',
      'PhysicalActionIR does not match the supplied visual snapshot.',
    );
  }
  if (!sourceMatchesSnapshot(source, snapshot)) {
    return failure(
      'TEMPORAL_BINDING_MISMATCH',
      'Approved source image does not match the snapshot temporal identity.',
    );
  }
  if (!isValidDuration(input.output.durationSeconds)) {
    return failure('INVALID_DURATION', 'Video duration must be a finite value greater than 0 seconds.');
  }
  if (input.output.resolution && !isValidResolution(input.output.resolution)) {
    return failure('INVALID_OUTPUT', 'Video resolution must contain positive integer dimensions.');
  }

  const officialSource = toOfficialVideoSource(source);
  const futureElements = uniqueSorted([
    ...physicalAction.constraints.forbiddenFutureComponents,
    ...physicalAction.constraints.preventPrematureElements,
    ...snapshot.continuity.futureForbidden,
    ...snapshot.continuity.forbiddenVisualElements,
  ]);
  const preservedComponents = uniqueSorted([
    ...physicalAction.constraints.preserveComponents,
    ...snapshot.continuity.preserveComponents,
  ]);
  const preservedMaterials = uniqueSorted([
    ...snapshot.continuity.preserveMaterialPlacements,
    ...snapshot.materials.visible.map(material => material.materialId),
  ]);
  const spec: CanonicalAnimationPromptSpec = {
    id: [
      'animation-spec',
      snapshot.identity.projectId,
      snapshot.identity.sceneId,
      snapshot.identity.stageId,
      snapshot.id,
      physicalAction.id,
      source.asset.id,
    ].join(':'),
    identity: {
      projectId: snapshot.identity.projectId,
      sceneId: snapshot.identity.sceneId,
      stageId: snapshot.identity.stageId,
      operationId: snapshot.identity.operationId,
      snapshotId: snapshot.id,
      physicalActionIRId: physicalAction.id,
      sourceReferenceId: source.id,
      sourceImageAssetId: source.asset.id,
    },
    temporal: {
      temporalAuthority: 'OFFICIAL',
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      temporalPoint: snapshot.temporalPoint,
      worldStateSource: snapshot.worldStateSource,
    },
    motion: {
      primaryAction: { ...physicalAction.primaryAction },
      secondaryActions: [],
      subjectMotion: {
        characterId: physicalAction.actor.characterId,
        zoneBefore: physicalAction.before.actorZone,
        zoneAfter: physicalAction.after.actorZone,
      },
      constructionMotion: {
        target: {
          ...physicalAction.target,
          elements: [...physicalAction.target.elements],
        },
        targetStatusBefore: physicalAction.before.targetStatus,
        targetStatusAfter: physicalAction.after.targetStatus,
        newlyCompletedComponents: [...physicalAction.expectedEffects.newlyCompletedComponents],
        newlyPartialComponents: [...physicalAction.expectedEffects.newlyPartialComponents],
      },
      toolMotion: { tools: [...physicalAction.tools] },
      materials: [...physicalAction.materials],
    },
    camera: {
      cameraMode: 'IMAGE_TO_VIDEO',
      cameraMovement: snapshot.camera.viewpoint.movement,
      framing: snapshot.camera.framing,
      viewpointConstraints: {
        cameraId: snapshot.camera.id,
        allowedMovement: snapshot.camera.allowedMovement,
        relativePosition: { ...snapshot.camera.relativePosition },
        orientation: snapshot.camera.orientation,
        viewpoint: {
          ...snapshot.camera.viewpoint,
          position: { ...snapshot.camera.viewpoint.position },
          target: { ...snapshot.camera.viewpoint.target },
        },
      },
    },
    continuity: {
      preserveCharacter: {
        characterId: snapshot.actor.characterId,
        visualIdentityId: snapshot.actor.visualIdentityId,
      },
      preserveClothing: snapshot.actor.clothing,
      preserveEnvironment: {
        preset: snapshot.environment.preset,
        climate: snapshot.environment.climate,
        light: snapshot.environment.light,
        timeOfDay: snapshot.environment.timeOfDay,
        weather: snapshot.environment.weather,
        permanentObjects: [...snapshot.environment.permanentObjects],
      },
      preserveConstructionGeometry: preservedComponents,
      preserveMaterials: preservedMaterials,
      preserveLighting: snapshot.environment.light,
      preserveCameraContinuity: {
        cameraId: snapshot.continuity.preserveCameraId,
        movement: snapshot.camera.viewpoint.movement,
      },
    },
    forbidden: {
      futureElements,
      forbiddenTransformations: [
        'do not introduce physical changes beyond the bound PhysicalActionIR',
        'do not complete, remove or relocate unrelated construction components',
        'do not create materials, tools or construction facts absent from the canonical snapshot',
      ],
      forbiddenCameraChanges: [
        `do not replace camera ${snapshot.continuity.preserveCameraId}`,
        'do not change framing, viewpoint or orientation outside the canonical camera constraints',
      ],
      forbiddenIdentityChanges: [
        `do not change character ${snapshot.actor.characterId}`,
        `do not change visual identity ${snapshot.actor.visualIdentityId}`,
        `do not change clothing: ${snapshot.actor.clothing}`,
      ],
    },
    output: {
      durationSeconds: input.output.durationSeconds,
      aspectRatio: snapshot.camera.viewpoint.aspectRatio,
      resolution: input.output.resolution ? { ...input.output.resolution } : undefined,
      audio: 'SILENT',
    },
  };

  return {
    status: 'SUCCESS',
    spec: deepFreeze(spec),
    source: officialSource,
  };
}

export function renderCanonicalAnimationPrompt(spec: CanonicalAnimationPromptSpec): string {
  return [
    'VISUAL SOURCE',
    `Animate only approved image asset ${spec.identity.sourceImageAssetId}.`,
    `Temporal point: ${spec.temporal.temporalPoint} / ${spec.temporal.stageOutcome}.`,
    '',
    'MOTION',
    `Primary action: ${spec.motion.primaryAction.description}.`,
    `Actor: ${spec.motion.subjectMotion.characterId}.`,
    `Actor zone: ${spec.motion.subjectMotion.zoneBefore} -> ${spec.motion.subjectMotion.zoneAfter}.`,
    `Target: ${spec.motion.constructionMotion.target.label}.`,
    `Target transition: ${spec.motion.constructionMotion.targetStatusBefore} -> ${spec.motion.constructionMotion.targetStatusAfter}.`,
    `Tools: ${list(spec.motion.toolMotion.tools)}.`,
    `Materials: ${list(spec.motion.materials)}.`,
    '',
    'CAMERA',
    `Mode: ${spec.camera.cameraMode}.`,
    `Camera: ${spec.camera.viewpointConstraints.cameraId}; framing: ${spec.camera.framing}; movement: ${spec.camera.cameraMovement}.`,
    'Preserve the canonical viewpoint, orientation and framing.',
    '',
    'PRESERVE',
    `Character: ${spec.continuity.preserveCharacter.characterId} / ${spec.continuity.preserveCharacter.visualIdentityId}.`,
    `Clothing: ${spec.continuity.preserveClothing}.`,
    `Environment: ${spec.continuity.preserveEnvironment.preset}; light: ${spec.continuity.preserveEnvironment.light}.`,
    `Lighting: ${spec.continuity.preserveLighting}.`,
    `Construction geometry: ${list(spec.continuity.preserveConstructionGeometry)}.`,
    `Materials: ${list(spec.continuity.preserveMaterials)}.`,
    '',
    'FORBID',
    `Future elements: ${list(spec.forbidden.futureElements)}.`,
    ...spec.forbidden.forbiddenTransformations.map(value => `- ${value}`),
    ...spec.forbidden.forbiddenCameraChanges.map(value => `- ${value}`),
    ...spec.forbidden.forbiddenIdentityChanges.map(value => `- ${value}`),
    '',
    'OUTPUT',
    `Duration: ${spec.output.durationSeconds} seconds.`,
    `Aspect ratio: ${spec.output.aspectRatio}.`,
    `Audio: ${spec.output.audio}.`,
  ].join('\n');
}

function isOfficialReference(
  source: VisualReferenceRecord | ImageGenerationResult,
): source is VisualReferenceRecord {
  return !('status' in source);
}

function isValidOfficialSource(source: VisualReferenceRecord): boolean {
  return source.approvalStatus === 'APPROVED' &&
    source.temporalAuthority === 'OFFICIAL' &&
    source.snapshotKind === 'OFFICIAL' &&
    source.stageOutcome === 'COMMITTED' &&
    source.temporalPoint === 'AFTER' &&
    source.worldStateSource === 'CANDIDATE' &&
    (source.imageResultStatus === 'SUCCESS' || source.imageResultStatus === 'MANUAL_READY') &&
    !!source.id.trim() &&
    !!source.projectId.trim() &&
    !!source.sceneId.trim() &&
    !!source.stageId.trim() &&
    !!source.operationId?.trim() &&
    !!source.snapshotId.trim() &&
    !!source.canonicalSpecId.trim() &&
    !!source.requestId.trim() &&
    !!source.asset.id.trim() &&
    !!source.asset.uri.trim() &&
    Number.isInteger(source.temporalPosition.sceneOrder) &&
    Number.isInteger(source.temporalPosition.stageOrder) &&
    source.temporalPosition.sceneOrder >= 0 &&
    source.temporalPosition.stageOrder >= 0;
}

function isOfficialCommittedSnapshot(snapshot: VisualStateSnapshot): boolean {
  return snapshot.kind === 'OFFICIAL' &&
    snapshot.stageOutcome === 'COMMITTED' &&
    snapshot.temporalPoint === 'AFTER' &&
    snapshot.worldStateSource === 'CANDIDATE' &&
    snapshot.action.visibility === 'COMMITTED' &&
    !!snapshot.id.trim() &&
    !!snapshot.identity.projectId.trim() &&
    !!snapshot.identity.sceneId.trim() &&
    !!snapshot.identity.stageId.trim() &&
    !!snapshot.identity.operationId.trim() &&
    snapshot.continuity.preserveActorIdentity === snapshot.actor.characterId &&
    snapshot.continuity.preserveClothing === snapshot.actor.clothing &&
    snapshot.continuity.preserveCameraId === snapshot.camera.id &&
    snapshot.continuity.futureForbidden.every(
      element => !snapshot.construction.visibleComponents.includes(element),
    );
}

function physicalActionMatchesSnapshot(
  action: PhysicalActionIR,
  snapshot: VisualStateSnapshot,
): boolean {
  return action.id === snapshot.action.physicalActionIRId &&
    action.sceneId === snapshot.identity.sceneId &&
    action.stageId === snapshot.identity.stageId &&
    action.operationId === snapshot.identity.operationId &&
    action.actor.characterId === snapshot.actor.characterId &&
    action.primaryAction.type === snapshot.action.primary.type &&
    action.primaryAction.verb === snapshot.action.primary.verb &&
    action.primaryAction.description === snapshot.action.primary.description &&
    stableEqual(action.target, snapshot.action.target) &&
    stableEqual(uniqueSorted(action.tools), uniqueSorted(snapshot.action.tools)) &&
    stableEqual(uniqueSorted(action.materials), uniqueSorted(snapshot.action.materials)) &&
    action.constraints.preserveActorId === action.actor.characterId &&
    action.constraints.allowedZone === action.zone &&
    action.zone === snapshot.space.activeZone &&
    action.before.actorZone === action.expectedEffects.actorZone.before &&
    action.after.actorZone === snapshot.actor.zone &&
    action.after.actorZone === action.expectedEffects.actorZone.after &&
    action.before.targetStatus === action.expectedEffects.targetStatus.before &&
    action.after.targetStatus === snapshot.construction.targetState &&
    action.after.targetStatus === action.expectedEffects.targetStatus.after &&
    action.before.constructionProgress === action.expectedEffects.constructionProgress.before &&
    action.after.constructionProgress === snapshot.construction.progress &&
    action.after.constructionProgress === action.expectedEffects.constructionProgress.after &&
    action.expectedEffects.targetStatus.after === snapshot.action.expectedTargetStatus &&
    stableEqual(action.expectedEffects.materialQuantityChanges, snapshot.evidence.materialQuantityChanges) &&
    action.expectedEffects.newlyCompletedComponents.every(
      component => snapshot.construction.completedComponents.includes(component),
    ) &&
    action.expectedEffects.newlyPartialComponents.every(
      component => snapshot.construction.partialComponents.includes(component),
    ) &&
    action.constraints.preserveComponents.every(
      component => snapshot.construction.visibleComponents.includes(component),
    );
}

function sourceMatchesSnapshot(
  source: VisualReferenceRecord,
  snapshot: VisualStateSnapshot,
): boolean {
  return source.projectId === snapshot.identity.projectId &&
    source.sceneId === snapshot.identity.sceneId &&
    source.stageId === snapshot.identity.stageId &&
    source.operationId === snapshot.identity.operationId &&
    source.snapshotId === snapshot.id &&
    source.temporalPoint === snapshot.temporalPoint &&
    source.worldStateSource === snapshot.worldStateSource;
}

function toOfficialVideoSource(source: VisualReferenceRecord): OfficialVideoSource {
  return deepFreeze({
    referenceId: source.id,
    approvalStatus: 'APPROVED',
    temporalAuthority: 'OFFICIAL',
    snapshotKind: 'OFFICIAL',
    stageOutcome: 'COMMITTED',
    projectId: source.projectId,
    sceneId: source.sceneId,
    stageId: source.stageId,
    operationId: source.operationId ?? '',
    snapshotId: source.snapshotId,
    canonicalSpecId: source.canonicalSpecId,
    requestId: source.requestId,
    imageResultStatus: source.imageResultStatus,
    asset: clone(source.asset),
    temporalPoint: source.temporalPoint,
    worldStateSource: source.worldStateSource,
    temporalPosition: { ...source.temporalPosition },
  });
}

function isValidDuration(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidResolution(value: VideoResolution): boolean {
  return Number.isInteger(value.width) && value.width > 0 &&
    Number.isInteger(value.height) && value.height > 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function stableEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function list(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function failure(
  errorCode: VideoPreparationErrorCode,
  message: string,
): VideoPreparationFailure {
  return { status: 'FAILURE', errorCode, message };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
