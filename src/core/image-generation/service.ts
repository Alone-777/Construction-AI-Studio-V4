import { cloneImageGenerationRequest } from './request-builder';
import type {
  ImageGenerationFailure,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
} from './types';

export interface ImageGenerationService {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface CreateImageGenerationServiceInput {
  readonly providers: readonly ImageProvider[];
}

export function createImageGenerationService(
  input: CreateImageGenerationServiceInput,
): ImageGenerationService {
  const providers = new Map<string, ImageProvider>();
  for (const provider of input.providers) {
    if (!provider.id.trim()) throw new Error('Image provider id is required.');
    if (providers.has(provider.id)) throw new Error(`Duplicate image provider id '${provider.id}'.`);
    providers.set(provider.id, provider);
  }

  return {
    async generate(sourceRequest): Promise<ImageGenerationResult> {
      const request = cloneImageGenerationRequest(sourceRequest);
      const validationFailure = validateRequest(request);
      if (validationFailure) return validationFailure;

      const provider = providers.get(request.providerId);
      if (!provider) {
        return failure(
          request,
          'UNKNOWN_PROVIDER',
          `Image provider '${request.providerId}' is not registered.`,
        );
      }

      try {
        return await provider.generate(request);
      } catch (error) {
        return failure(
          request,
          'PROVIDER_EXECUTION_ERROR',
          error instanceof Error ? error.message : 'Image provider execution failed.',
        );
      }
    },
  };
}

function validateRequest(request: ImageGenerationRequest): ImageGenerationFailure | undefined {
  if (!request.requestId || !request.projectId || !request.sceneId || !request.stageId ||
      !request.providerId || !request.prompt.trim()) {
    return failure(request, 'INVALID_REQUEST', 'Image generation request is incomplete.');
  }

  if (request.temporalAuthority !== request.snapshotKind) {
    return failure(
      request,
      'INVALID_REQUEST',
      'Image generation temporalAuthority must match snapshotKind.',
    );
  }

  if (request.mode === 'EDIT' && request.references.length === 0) {
    return failure(
      request,
      'EDIT_REFERENCE_REQUIRED',
      'EDIT mode requires at least one valid image reference.',
    );
  }

  const invalidReference = request.references.some(reference =>
    !reference.role || !reference.asset.id.trim() || !reference.asset.source || !reference.asset.uri.trim()
  );
  if (invalidReference) {
    return failure(request, 'INVALID_REQUEST', 'Image generation request contains an invalid reference.');
  }

  return undefined;
}

function failure(
  request: ImageGenerationRequest,
  errorCode: ImageGenerationFailure['errorCode'],
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
