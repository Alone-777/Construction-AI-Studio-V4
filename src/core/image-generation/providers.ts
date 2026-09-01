import type {
  ImageGenerationFailure,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
} from './types';

function providerMismatch(
  provider: ImageProvider,
  request: ImageGenerationRequest,
): ImageGenerationFailure | undefined {
  if (request.providerId === provider.id) return undefined;
  return {
    status: 'FAILURE',
    requestId: request.requestId,
    providerId: provider.id,
    errorCode: 'PROVIDER_MISMATCH',
    message: `Request targets provider '${request.providerId}', not '${provider.id}'.`,
    retryable: false,
  };
}

export function createManualImageProvider(id = 'manual'): ImageProvider {
  const provider: ImageProvider = {
    id,
    kind: 'MANUAL',
    async generate(request): Promise<ImageGenerationResult> {
      const mismatch = providerMismatch(provider, request);
      if (mismatch) return mismatch;

      return {
        status: 'MANUAL_READY',
        requestId: request.requestId,
        providerId: provider.id,
        package: {
          requestId: request.requestId,
          projectId: request.projectId,
          sceneId: request.sceneId,
          stageId: request.stageId,
          prompt: request.prompt,
          negativePrompt: request.negativePrompt,
          references: request.references,
          aspectRatio: request.aspectRatio,
          resolution: request.resolution,
        },
        warnings: ['No image was generated. This package is ready for an external manual workflow.'],
        outputStatus: 'UNREVIEWED',
        providerMetadata: { providerKind: 'MANUAL', networkUsed: false },
      };
    },
  };

  return provider;
}

export function createDeterministicMockImageProvider(id = 'mock'): ImageProvider {
  const provider: ImageProvider = {
    id,
    kind: 'MOCK',
    async generate(request): Promise<ImageGenerationResult> {
      const mismatch = providerMismatch(provider, request);
      if (mismatch) return mismatch;

      return {
        status: 'SUCCESS',
        requestId: request.requestId,
        providerId: provider.id,
        asset: {
          id: `mock-image:${request.requestId}`,
          source: 'MOCK',
          uri: `mock://image/${request.requestId}`,
          checksum: request.requestId,
          metadata: { synthetic: true, containsPixels: false },
        },
        warnings: ['Deterministic mock result; no image pixels were generated.'],
        outputStatus: 'UNREVIEWED',
        providerMetadata: { providerKind: 'MOCK', deterministic: true, networkUsed: false },
      };
    },
  };

  return provider;
}
