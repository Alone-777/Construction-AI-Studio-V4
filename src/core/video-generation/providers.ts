import type {
  VideoGenerationFailure,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProvider,
} from './types';

function providerMismatch(
  provider: VideoProvider,
  request: VideoGenerationRequest,
): VideoGenerationFailure | undefined {
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

export function createManualVideoProvider(id = 'manual-video'): VideoProvider {
  const provider: VideoProvider = {
    id,
    kind: 'MANUAL',
    async generate(request): Promise<VideoGenerationResult> {
      const mismatch = providerMismatch(provider, request);
      if (mismatch) return mismatch;

      return {
        status: 'MANUAL_READY',
        requestId: request.requestId,
        providerId: provider.id,
        package: {
          requestId: request.requestId,
          prompt: request.renderedPrompt,
          sourceImage: structuredClone(request.sourceImage),
          durationSeconds: request.durationSeconds,
          aspectRatio: request.aspectRatio,
          resolution: request.resolution ? { ...request.resolution } : undefined,
          audio: request.canonicalAnimationSpec.output.audio,
        },
        warnings: ['No video was generated. This package is ready for an external manual workflow.'],
        outputStatus: 'UNREVIEWED',
        providerMetadata: { providerKind: 'MANUAL', networkUsed: false },
      };
    },
  };
  return provider;
}

export function createDeterministicMockVideoProvider(id = 'mock-video'): VideoProvider {
  const provider: VideoProvider = {
    id,
    kind: 'MOCK',
    async generate(request): Promise<VideoGenerationResult> {
      const mismatch = providerMismatch(provider, request);
      if (mismatch) return mismatch;

      return {
        status: 'SUCCESS',
        requestId: request.requestId,
        providerId: provider.id,
        asset: {
          id: `mock-video:${request.requestId}`,
          source: 'MOCK',
          uri: `mock://video/${request.requestId}`,
          checksum: request.requestId,
          durationSeconds: request.durationSeconds,
          metadata: { synthetic: true, containsVideoBytes: false },
        },
        warnings: ['Deterministic mock result; no video bytes were generated.'],
        outputStatus: 'UNREVIEWED',
        providerMetadata: { providerKind: 'MOCK', deterministic: true, networkUsed: false },
      };
    },
  };
  return provider;
}
