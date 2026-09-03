import {
  cloneVideoGenerationRequest,
  createDeterministicVideoRequestId,
  hasValidVideoGenerationPrompt,
  videoRequestIdentity,
} from './request-builder';
import type {
  VideoGenerationErrorCode,
  VideoGenerationFailure,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProvider,
} from './types';

export interface VideoGenerationService {
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}

export interface CreateVideoGenerationServiceInput {
  readonly providers: readonly VideoProvider[];
}

export function createVideoGenerationService(
  input: CreateVideoGenerationServiceInput,
): VideoGenerationService {
  const providers = new Map<string, VideoProvider>();
  for (const provider of input.providers) {
    if (!provider.id.trim()) throw new Error('Video provider id is required.');
    if (providers.has(provider.id)) throw new Error(`Duplicate video provider id '${provider.id}'.`);
    providers.set(provider.id, provider);
  }

  return {
    async generate(sourceRequest): Promise<VideoGenerationResult> {
      const request = cloneVideoGenerationRequest(sourceRequest);
      const validationFailure = validateRequest(request);
      if (validationFailure) return validationFailure;

      const provider = providers.get(request.providerId);
      if (!provider) {
        return failure(
          request,
          'UNKNOWN_PROVIDER',
          `Video provider '${request.providerId}' is not registered.`,
        );
      }

      try {
        const result = await provider.generate(request);
        return validateProviderResult(request, provider, result);
      } catch (error) {
        return failure(
          request,
          'PROVIDER_EXECUTION_ERROR',
          error instanceof Error ? error.message : 'Video provider execution failed.',
        );
      }
    },
  };
}

function validateRequest(request: VideoGenerationRequest): VideoGenerationFailure | undefined {
  const spec = request.canonicalAnimationSpec;
  const source = request.source;
  if (!request.requestId.trim() || !request.providerId.trim() || !request.renderedPrompt.trim()) {
    return failure(request, 'INVALID_REQUEST', 'Video generation request is incomplete.');
  }
  if (!request.sourceImage.id.trim() || !request.sourceImage.uri.trim() ||
      !source.referenceId.trim() || !source.projectId.trim() || !source.sceneId.trim() ||
      !source.stageId.trim() || !source.operationId.trim() || !source.snapshotId.trim() ||
      !source.asset.id.trim() || !source.asset.uri.trim()) {
    return failure(request, 'INVALID_SOURCE_IMAGE', 'Video source image is invalid.');
  }
  if (source.approvalStatus !== 'APPROVED' ||
      source.temporalAuthority !== 'OFFICIAL' ||
      source.snapshotKind !== 'OFFICIAL' ||
      source.stageOutcome !== 'COMMITTED' ||
      source.temporalPoint !== 'AFTER' ||
      source.worldStateSource !== 'CANDIDATE' ||
      (source.imageResultStatus !== 'SUCCESS' && source.imageResultStatus !== 'MANUAL_READY')) {
    return failure(request, 'INVALID_SOURCE_IMAGE', 'Video source is not an approved official image.');
  }
  if (!stableEqual(request.sourceImage, source.asset) ||
      spec.identity.sourceImageAssetId !== source.asset.id ||
      spec.identity.sourceReferenceId !== source.referenceId) {
    return failure(request, 'INVALID_SOURCE_IMAGE', 'Video source image identity is inconsistent.');
  }
  const temporal = request.temporalIdentity;
  const temporalMatch = temporal.temporalAuthority === 'OFFICIAL' &&
    temporal.snapshotKind === 'OFFICIAL' &&
    temporal.stageOutcome === 'COMMITTED' &&
    temporal.temporalPoint === 'AFTER' &&
    temporal.worldStateSource === 'CANDIDATE' &&
    spec.temporal.temporalAuthority === temporal.temporalAuthority &&
    spec.temporal.snapshotKind === temporal.snapshotKind &&
    spec.temporal.stageOutcome === temporal.stageOutcome &&
    spec.temporal.temporalPoint === temporal.temporalPoint &&
    spec.temporal.worldStateSource === temporal.worldStateSource &&
    temporal.projectId === spec.identity.projectId &&
    temporal.sceneId === spec.identity.sceneId &&
    temporal.stageId === spec.identity.stageId &&
    temporal.operationId === spec.identity.operationId &&
    temporal.snapshotId === spec.identity.snapshotId &&
    source.projectId === spec.identity.projectId &&
    source.sceneId === spec.identity.sceneId &&
    source.stageId === spec.identity.stageId &&
    source.operationId === spec.identity.operationId &&
    source.snapshotId === spec.identity.snapshotId &&
    source.temporalPoint === spec.temporal.temporalPoint &&
    source.worldStateSource === spec.temporal.worldStateSource &&
    stableEqual(source.temporalPosition, temporal.temporalPosition);
  if (!temporalMatch) {
    return failure(request, 'TEMPORAL_BINDING_MISMATCH', 'Video temporal identity is inconsistent.');
  }
  if (!isValidDuration(request.durationSeconds) ||
      request.durationSeconds !== spec.output.durationSeconds) {
    return failure(request, 'INVALID_DURATION', 'Video duration is invalid or inconsistent.');
  }
  if (!Number.isFinite(request.aspectRatio) || request.aspectRatio <= 0 ||
      request.aspectRatio !== spec.output.aspectRatio) {
    return failure(request, 'INVALID_REQUEST', 'Video aspect ratio is invalid or inconsistent.');
  }
  if (request.resolution &&
      (!Number.isInteger(request.resolution.width) || request.resolution.width <= 0 ||
       !Number.isInteger(request.resolution.height) || request.resolution.height <= 0)) {
    return failure(request, 'INVALID_REQUEST', 'Video resolution is invalid.');
  }
  if (!sameResolution(request.resolution, spec.output.resolution)) {
    return failure(request, 'INVALID_REQUEST', 'Video resolution does not match the canonical spec.');
  }
  if (!hasValidVideoGenerationPrompt(request)) {
    return failure(request, 'INVALID_REQUEST', 'Rendered animation prompt does not match its canonical spec.');
  }
  if (request.requestId !== createDeterministicVideoRequestId(videoRequestIdentity(request))) {
    return failure(request, 'INVALID_REQUEST', 'Video requestId does not match request content.');
  }
  return undefined;
}

function isValidDuration(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function sameResolution(
  left: VideoGenerationRequest['resolution'],
  right: VideoGenerationRequest['resolution'],
): boolean {
  if (!left || !right) return left === right;
  return left.width === right.width && left.height === right.height;
}

function failure(
  request: Pick<VideoGenerationRequest, 'requestId' | 'providerId'>,
  errorCode: VideoGenerationErrorCode,
  message: string,
): VideoGenerationFailure {
  return {
    status: 'FAILURE',
    requestId: request.requestId,
    providerId: request.providerId,
    errorCode,
    message,
    retryable: false,
  };
}

function validateProviderResult(
  request: VideoGenerationRequest,
  provider: VideoProvider,
  result: VideoGenerationResult,
): VideoGenerationResult {
  if (!result || result.requestId !== request.requestId || result.providerId !== provider.id) {
    return failure(
      request,
      'PROVIDER_EXECUTION_ERROR',
      'Video provider returned a result for another request or provider.',
    );
  }

  if (result.status === 'SUCCESS') {
    if (result.outputStatus !== 'UNREVIEWED' ||
        !result.asset.id.trim() || !result.asset.uri.trim() ||
        (result.asset.durationSeconds !== undefined &&
         result.asset.durationSeconds !== request.durationSeconds)) {
      return failure(
        request,
        'PROVIDER_EXECUTION_ERROR',
        'Video provider returned an invalid or auto-approved SUCCESS result.',
      );
    }
    return deepFreeze(structuredClone(result));
  }

  if (result.status === 'MANUAL_READY') {
    const packageMatches = result.outputStatus === 'UNREVIEWED' &&
      result.package.requestId === request.requestId &&
      result.package.prompt === request.renderedPrompt &&
      stableEqual(result.package.sourceImage, request.sourceImage) &&
      result.package.durationSeconds === request.durationSeconds &&
      result.package.aspectRatio === request.aspectRatio &&
      sameResolution(result.package.resolution, request.resolution) &&
      result.package.audio === request.canonicalAnimationSpec.output.audio;
    if (!packageMatches) {
      return failure(
        request,
        'PROVIDER_EXECUTION_ERROR',
        'Video provider returned an invalid or auto-approved MANUAL_READY result.',
      );
    }
    return deepFreeze(structuredClone(result));
  }

  if (result.status === 'FAILURE' && result.message.trim()) {
    return deepFreeze(structuredClone(result));
  }

  return failure(request, 'PROVIDER_EXECUTION_ERROR', 'Video provider returned an invalid result.');
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
