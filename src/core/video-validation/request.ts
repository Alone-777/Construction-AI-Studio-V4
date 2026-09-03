import type { ImageMetadataValue } from '../image-generation';
import {
  createDeterministicVideoRequestId,
  hasValidVideoGenerationPrompt,
  videoRequestIdentity,
  type CanonicalAnimationPromptSpec,
  type VideoGenerationRequest,
  type VideoGenerationResult,
} from '../video-generation';
import type { ExpectedVideoFacts, VideoValidationRequest } from './types';

export interface CreateVideoValidationRequestInput {
  readonly request: VideoGenerationRequest;
  readonly result: VideoGenerationResult;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export function createVideoValidationRequest(
  input: CreateVideoValidationRequestInput,
): VideoValidationRequest {
  const { request, result } = input;
  if (result.status !== 'SUCCESS' || result.outputStatus !== 'UNREVIEWED') {
    throw new Error('Video validation requires an unreviewed SUCCESS video result.');
  }
  if (result.requestId !== request.requestId || result.providerId !== request.providerId) {
    throw new Error('Video validation result does not match its generation request.');
  }
  if (!result.asset.id.trim() || !result.asset.uri.trim()) {
    throw new Error('Video validation requires a video asset with id and uri.');
  }
  validateCanonicalRequest(request);

  const expected = deriveExpectedVideoFacts(request.canonicalAnimationSpec);
  return deepFreeze({
    validationId: createVideoValidationId(request.requestId, result.asset.id),
    projectId: request.temporalIdentity.projectId,
    sceneId: request.temporalIdentity.sceneId,
    stageId: request.temporalIdentity.stageId,
    operationId: request.temporalIdentity.operationId,
    snapshotId: request.temporalIdentity.snapshotId,
    videoRequestId: request.requestId,
    videoAsset: clone(result.asset),
    sourceImageAssetId: request.sourceImage.id,
    physicalActionIRId: request.canonicalAnimationSpec.identity.physicalActionIRId,
    canonicalAnimationSpecId: request.canonicalAnimationSpec.id,
    temporalAuthority: request.temporalIdentity.temporalAuthority,
    snapshotKind: request.temporalIdentity.snapshotKind,
    stageOutcome: request.temporalIdentity.stageOutcome,
    temporalPoint: request.temporalIdentity.temporalPoint,
    worldStateSource: request.temporalIdentity.worldStateSource,
    temporalPosition: { ...request.temporalIdentity.temporalPosition },
    expectedMotionFacts: expected.motion,
    expectedContinuityFacts: expected.continuity,
    expectedCameraFacts: expected.camera,
    expectedOutputFacts: expected.output,
    metadata: input.metadata ? clone(input.metadata) : undefined,
  });
}

export function createVideoValidationId(videoRequestId: string, videoAssetId: string): string {
  return `video-validation:${videoRequestId}:${videoAssetId}`;
}

export function deriveExpectedVideoFacts(
  spec: CanonicalAnimationPromptSpec,
): ExpectedVideoFacts {
  return deepFreeze({
    motion: {
      requiredPrimaryAction: {
        type: spec.motion.primaryAction.type,
        verb: spec.motion.primaryAction.verb,
        description: spec.motion.primaryAction.description,
        targetId: spec.motion.constructionMotion.target.id,
      },
      allowedSecondaryActions: uniqueSorted(spec.motion.secondaryActions),
      forbiddenFutureActions: uniqueSorted(spec.forbidden.futureElements),
      toolMotionConstraints: uniqueSorted(spec.motion.toolMotion.tools),
      constructionMotionConstraints: {
        targetId: spec.motion.constructionMotion.target.id,
        targetStatusBefore: spec.motion.constructionMotion.targetStatusBefore,
        targetStatusAfter: spec.motion.constructionMotion.targetStatusAfter,
        allowedCompletedComponents: uniqueSorted(
          spec.motion.constructionMotion.newlyCompletedComponents,
        ),
        allowedPartialComponents: uniqueSorted(
          spec.motion.constructionMotion.newlyPartialComponents,
        ),
      },
    },
    continuity: {
      character: { ...spec.continuity.preserveCharacter },
      clothing: spec.continuity.preserveClothing,
      environment: {
        ...spec.continuity.preserveEnvironment,
        permanentObjects: uniqueSorted(spec.continuity.preserveEnvironment.permanentObjects),
      },
      constructionGeometry: uniqueSorted(spec.continuity.preserveConstructionGeometry),
      materials: uniqueSorted(spec.continuity.preserveMaterials),
      lighting: spec.continuity.preserveLighting,
      sourceImageContinuity: {
        referenceId: spec.identity.sourceReferenceId,
        assetId: spec.identity.sourceImageAssetId,
      },
    },
    camera: {
      viewpoint: clone(spec.camera.viewpointConstraints),
      movement: spec.camera.cameraMovement,
      framing: spec.camera.framing,
      forbiddenCameraChanges: uniqueSorted(spec.forbidden.forbiddenCameraChanges),
    },
    output: {
      expectedDuration: spec.output.durationSeconds,
      aspectRatio: spec.output.aspectRatio,
    },
  });
}

function validateCanonicalRequest(request: VideoGenerationRequest): void {
  const spec = request.canonicalAnimationSpec;
  const temporal = request.temporalIdentity;
  const validId = request.requestId === createDeterministicVideoRequestId(videoRequestIdentity(request));
  const validIdentity = hasValidVideoGenerationPrompt(request) &&
    request.sourceImage.id === request.source.asset.id &&
    request.sourceImage.id === spec.identity.sourceImageAssetId &&
    request.source.referenceId === spec.identity.sourceReferenceId &&
    request.source.projectId === temporal.projectId &&
    request.source.sceneId === temporal.sceneId &&
    request.source.stageId === temporal.stageId &&
    request.source.operationId === temporal.operationId &&
    request.source.snapshotId === temporal.snapshotId &&
    temporal.projectId === spec.identity.projectId &&
    temporal.sceneId === spec.identity.sceneId &&
    temporal.stageId === spec.identity.stageId &&
    temporal.operationId === spec.identity.operationId &&
    temporal.snapshotId === spec.identity.snapshotId &&
    temporal.temporalAuthority === 'OFFICIAL' &&
    temporal.snapshotKind === 'OFFICIAL' &&
    temporal.stageOutcome === 'COMMITTED' &&
    spec.temporal.temporalAuthority === temporal.temporalAuthority &&
    spec.temporal.snapshotKind === temporal.snapshotKind &&
    spec.temporal.stageOutcome === temporal.stageOutcome &&
    spec.temporal.temporalPoint === temporal.temporalPoint &&
    spec.temporal.worldStateSource === temporal.worldStateSource;
  if (!validId || !validIdentity) {
    throw new Error('Video validation requires a canonical request with matching identity.');
  }
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
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
