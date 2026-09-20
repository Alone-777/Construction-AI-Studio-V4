import type { ImageMetadataValue } from '../image-generation';
import type {
  VideoAssetRef,
  VideoGenerationFailure,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProvider,
} from './types';

export const VEO_FAST_VIDEO_PROVIDER_ID = 'veo-fast';
export const VEO_FAST_MODEL = 'veo-3.1-fast-generate-preview';
export const VEO_FAST_DURATION_SECONDS = 8;
export const VEO_FAST_MAX_CONCURRENCY = 1;

export interface VeoFastExecutionOutput {
  readonly asset: VideoAssetRef;
  readonly warnings?: readonly string[];
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface CreateVeoFastVideoProviderInput {
  readonly execute: (request: VideoGenerationRequest) => Promise<VeoFastExecutionOutput>;
  readonly id?: string;
  readonly model?: string;
}

export function createVeoFastVideoProvider(
  input: CreateVeoFastVideoProviderInput,
): VideoProvider {
  const id = (input.id ?? VEO_FAST_VIDEO_PROVIDER_ID).trim();
  const model = (input.model ?? VEO_FAST_MODEL).trim();

  if (!id) throw new Error('VEO_FAST provider id is required.');
  if (!model) throw new Error('VEO_FAST model is required.');

  let queueTail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queueTail.then(task, task);
    queueTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const provider: VideoProvider = {
    id,
    kind: 'REMOTE',

    async generate(request): Promise<VideoGenerationResult> {
      if (request.providerId !== provider.id) {
        return failure(
          request,
          provider.id,
          'PROVIDER_MISMATCH',
          `Request targets provider '${request.providerId}', not '${provider.id}'.`,
          false,
        );
      }

      if (request.durationSeconds !== VEO_FAST_DURATION_SECONDS) {
        return failure(
          request,
          provider.id,
          'INVALID_DURATION',
          `VEO_FAST requires exactly ${VEO_FAST_DURATION_SECONDS} seconds per job.`,
          false,
        );
      }

      return enqueue(async () => {
        try {
          const output = await input.execute(request);

          if (output.asset.source !== 'REMOTE') {
            return failure(
              request,
              provider.id,
              'PROVIDER_EXECUTION_ERROR',
              'VEO_FAST executor must return a REMOTE video asset.',
              false,
            );
          }

          if (output.asset.durationSeconds !== undefined &&
              output.asset.durationSeconds !== VEO_FAST_DURATION_SECONDS) {
            return failure(
              request,
              provider.id,
              'PROVIDER_EXECUTION_ERROR',
              `VEO_FAST executor returned a video with duration different from ${VEO_FAST_DURATION_SECONDS} seconds.`,
              false,
            );
          }

          return {
            status: 'SUCCESS',
            requestId: request.requestId,
            providerId: provider.id,
            asset: structuredClone(output.asset),
            warnings: output.warnings ? [...output.warnings] : [],
            outputStatus: 'UNREVIEWED',
            providerMetadata: {
              ...(output.providerMetadata ?? {}),
              providerKind: 'REMOTE',
              profile: 'VEO_FAST',
              model,
              durationSeconds: VEO_FAST_DURATION_SECONDS,
              maxConcurrency: VEO_FAST_MAX_CONCURRENCY,
            },
          };
        } catch (error) {
          return failure(
            request,
            provider.id,
            'PROVIDER_EXECUTION_ERROR',
            error instanceof Error ? error.message : 'VEO_FAST execution failed.',
            true,
          );
        }
      });
    },
  };

  return provider;
}

function failure(
  request: Pick<VideoGenerationRequest, 'requestId'>,
  providerId: string,
  errorCode: string,
  message: string,
  retryable: boolean,
): VideoGenerationFailure {
  return {
    status: 'FAILURE',
    requestId: request.requestId,
    providerId,
    errorCode,
    message,
    retryable,
  };
}
