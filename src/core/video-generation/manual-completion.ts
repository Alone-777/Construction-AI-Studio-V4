import {
  createDeterministicVideoRequestId,
  videoRequestIdentity,
} from './request-builder';
import type {
  ManualVideoCompletionErrorCode,
  ManualVideoSubmission,
  VideoGenerationFailure,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoResolution,
} from './types';

export interface CompleteManualVideoGenerationInput {
  readonly request: VideoGenerationRequest;
  readonly manualReadyResult: VideoGenerationResult;
  readonly submission: ManualVideoSubmission;
}

/**
 * Binds an externally generated video asset to its original manual request.
 * Completion creates unreviewed visual output only and never changes official state.
 */
export function completeManualVideoGeneration(
  input: CompleteManualVideoGenerationInput,
): VideoGenerationResult {
  const { request, manualReadyResult, submission } = input;

  if (!isValidRequestIdentity(request)) {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_REQUEST',
      'Manual video completion requires a valid canonical video request.',
    );
  }

  if (
    isBlank(submission.submissionId) ||
    isBlank(submission.requestId) ||
    !Number.isFinite(submission.submittedAt)
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_SUBMISSION',
      'Manual video submission requires non-blank ids and a finite submittedAt value.',
    );
  }

  const assetError = validateAsset(submission.asset);
  if (assetError) return failure(request, assetError.code, assetError.message);

  if (manualReadyResult.status !== 'MANUAL_READY') {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_RESULT_STATUS',
      'Manual video completion requires a MANUAL_READY result.',
    );
  }

  if (
    manualReadyResult.requestId !== request.requestId ||
    manualReadyResult.package.requestId !== request.requestId ||
    submission.requestId !== request.requestId
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_REQUEST_ID_MISMATCH',
      'Manual result, package and submission must belong to the completed video request.',
    );
  }

  if (
    manualReadyResult.providerId !== request.providerId ||
    manualReadyResult.providerMetadata?.providerKind !== 'MANUAL'
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_PROVIDER_MISMATCH',
      'Manual video completion requires a matching MANUAL provider result.',
    );
  }

  if (!manualPackageMatchesRequest(manualReadyResult, request)) {
    return failure(
      request,
      'MANUAL_COMPLETION_REQUEST_ID_MISMATCH',
      'Manual package content does not match the completed video request.',
    );
  }

  return deepFreeze({
    status: 'SUCCESS',
    requestId: request.requestId,
    providerId: request.providerId,
    asset: clone(submission.asset),
    warnings: [
      ...manualReadyResult.warnings,
      'Video asset was supplied externally and remains unreviewed.',
    ],
    outputStatus: 'UNREVIEWED',
    providerMetadata: {
      ...cloneOptional(manualReadyResult.providerMetadata),
      providerKind: 'MANUAL',
      completionSource: 'USER_SUBMISSION',
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      submissionMetadata: submission.metadata ? clone(submission.metadata) : null,
      sourceReferenceId: request.source.referenceId,
      sourceImageAssetId: request.sourceImage.id,
      temporalIdentity: {
        ...request.temporalIdentity,
        temporalPosition: { ...request.temporalIdentity.temporalPosition },
      },
    },
  });
}

function isValidRequestIdentity(request: VideoGenerationRequest): boolean {
  return !isBlank(request.requestId) &&
    !isBlank(request.providerId) &&
    request.requestId === createDeterministicVideoRequestId(videoRequestIdentity(request));
}

function manualPackageMatchesRequest(
  result: Extract<VideoGenerationResult, { status: 'MANUAL_READY' }>,
  request: VideoGenerationRequest,
): boolean {
  return result.outputStatus === 'UNREVIEWED' &&
    result.package.prompt === request.renderedPrompt &&
    stableEqual(result.package.sourceImage, request.sourceImage) &&
    result.package.durationSeconds === request.durationSeconds &&
    result.package.aspectRatio === request.aspectRatio &&
    sameResolution(result.package.resolution, request.resolution) &&
    result.package.audio === request.canonicalAnimationSpec.output.audio;
}

function validateAsset(
  asset: ManualVideoSubmission['asset'],
): { readonly code: ManualVideoCompletionErrorCode; readonly message: string } | undefined {
  if (isBlank(asset.id) || isBlank(asset.uri)) {
    return {
      code: 'MANUAL_COMPLETION_INVALID_ASSET',
      message: 'Manual video asset requires a non-blank id and uri.',
    };
  }
  if (asset.source === 'MOCK' || asset.uri.trim().toLowerCase().startsWith('data:')) {
    return {
      code: 'MANUAL_COMPLETION_INVALID_ASSET',
      message: 'Manual video asset must be a lightweight non-mock reference, not embedded data.',
    };
  }
  if (asset.mimeType !== undefined &&
      (isBlank(asset.mimeType) || !asset.mimeType.trim().toLowerCase().startsWith('video/'))) {
    return {
      code: 'MANUAL_COMPLETION_INVALID_ASSET',
      message: 'Manual video asset mimeType must represent video when supplied.',
    };
  }
  if (asset.checksum !== undefined && isBlank(asset.checksum)) {
    return {
      code: 'MANUAL_COMPLETION_INVALID_ASSET',
      message: 'Manual video asset checksum cannot be blank when supplied.',
    };
  }
  if (asset.durationSeconds !== undefined &&
      (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0)) {
    return {
      code: 'MANUAL_COMPLETION_INVALID_DURATION',
      message: 'Manual video asset duration must be finite and greater than 0 when supplied.',
    };
  }
  return undefined;
}

function sameResolution(left: VideoResolution | undefined, right: VideoResolution | undefined): boolean {
  if (!left || !right) return left === right;
  return left.width === right.width && left.height === right.height;
}

function failure(
  request: Pick<VideoGenerationRequest, 'requestId' | 'providerId'>,
  errorCode: ManualVideoCompletionErrorCode,
  message: string,
): VideoGenerationFailure {
  return deepFreeze({
    status: 'FAILURE',
    requestId: request.requestId,
    providerId: request.providerId,
    errorCode,
    message,
    retryable: false,
  });
}

function isBlank(value: string): boolean {
  return !value.trim();
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
