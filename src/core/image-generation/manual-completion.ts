import type {
  ImageAssetRef,
  ImageGenerationFailure,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageMetadataValue,
} from './types';

export interface ManualImageSubmission {
  readonly submissionId: string;
  readonly requestId: string;
  readonly asset: ImageAssetRef;
  readonly submittedAt: number;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface CompleteManualImageGenerationInput {
  readonly request: ImageGenerationRequest;
  readonly manualReadyResult: ImageGenerationResult;
  readonly submission: ManualImageSubmission;
}

/**
 * Binds an externally generated asset to its original manual package.
 * Completion produces unreviewed image output only; official approval remains a separate action.
 */
export function completeManualImageGeneration(
  input: CompleteManualImageGenerationInput,
): ImageGenerationResult {
  const { request, manualReadyResult, submission } = input;

  if (isBlank(request.requestId) || isBlank(request.providerId)) {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_REQUEST',
      'Manual completion requires a requestId and providerId.',
    );
  }

  if (manualReadyResult.status !== 'MANUAL_READY') {
    return failure(
      request,
      'MANUAL_COMPLETION_RESULT_REQUIRED',
      'Manual completion requires a MANUAL_READY result.',
    );
  }

  if (
    manualReadyResult.requestId !== request.requestId ||
    manualReadyResult.package.requestId !== request.requestId ||
    submission.requestId !== request.requestId
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_REQUEST_MISMATCH',
      'Manual result and submission must belong to the completed request.',
    );
  }

  if (
    manualReadyResult.providerId !== request.providerId ||
    manualReadyResult.providerMetadata?.providerKind !== 'MANUAL'
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_PROVIDER_MISMATCH',
      'Manual completion requires a matching MANUAL provider result.',
    );
  }

  if (
    manualReadyResult.package.projectId !== request.projectId ||
    manualReadyResult.package.sceneId !== request.sceneId ||
    manualReadyResult.package.stageId !== request.stageId
  ) {
    return failure(
      request,
      'MANUAL_COMPLETION_REQUEST_MISMATCH',
      'Manual package context does not match the completed request.',
    );
  }

  if (isBlank(submission.submissionId) || !Number.isFinite(submission.submittedAt)) {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_SUBMISSION',
      'Manual submission requires an id and finite submittedAt value.',
    );
  }

  if (isBlank(submission.asset.id) || isBlank(submission.asset.uri)) {
    return failure(
      request,
      'MANUAL_COMPLETION_INVALID_ASSET',
      'Manual submission asset requires an id and uri.',
    );
  }

  return {
    status: 'SUCCESS',
    requestId: request.requestId,
    providerId: request.providerId,
    asset: clone(submission.asset),
    warnings: [
      ...manualReadyResult.warnings,
      'Image asset was supplied externally and remains unreviewed.',
    ],
    outputStatus: 'UNREVIEWED',
    providerMetadata: {
      ...cloneOptional(manualReadyResult.providerMetadata),
      providerKind: 'MANUAL',
      completionSource: 'USER_SUBMISSION',
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      submissionMetadata: submission.metadata ? clone(submission.metadata) : null,
    },
  };
}

function failure(
  request: ImageGenerationRequest,
  errorCode: string,
  message: string,
): ImageGenerationFailure {
  return {
    status: 'FAILURE',
    requestId: request.requestId,
    providerId: request.providerId,
    errorCode,
    message,
    retryable: false,
  };
}

function isBlank(value: string): boolean {
  return !value.trim();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clone(value);
}
