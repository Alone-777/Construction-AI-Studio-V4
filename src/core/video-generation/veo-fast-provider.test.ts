import { describe, expect, it, vi } from 'vitest';
import {
  createVeoFastVideoProvider,
  VEO_FAST_DURATION_SECONDS,
  VEO_FAST_MAX_CONCURRENCY,
  VEO_FAST_MODEL,
  VEO_FAST_VIDEO_PROVIDER_ID,
} from './veo-fast-provider';
import type { VideoGenerationRequest } from './types';

function request(
  requestId: string,
  durationSeconds = VEO_FAST_DURATION_SECONDS,
  providerId = VEO_FAST_VIDEO_PROVIDER_ID,
): VideoGenerationRequest {
  return {
    requestId,
    providerId,
    durationSeconds,
  } as unknown as VideoGenerationRequest;
}

function remoteAsset(requestId: string) {
  return {
    id: `veo-fast:${requestId}`,
    source: 'REMOTE' as const,
    uri: `https://example.test/videos/${requestId}.mp4`,
    mimeType: 'video/mp4',
    durationSeconds: VEO_FAST_DURATION_SECONDS,
  };
}

describe('VEO_FAST video provider', () => {
  it('enforces exactly 8 seconds before executing a job', async () => {
    const execute = vi.fn(async (input: VideoGenerationRequest) => ({
      asset: remoteAsset(input.requestId),
    }));
    const provider = createVeoFastVideoProvider({ execute });

    const result = await provider.generate(request('job-6s', 6));

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'INVALID_DURATION',
      retryable: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes concurrent requests strictly one job at a time in FIFO order', async () => {
    const releases: Array<() => void> = [];
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;

    const provider = createVeoFastVideoProvider({
      execute: async input => {
        started.push(input.requestId);
        active += 1;
        maxActive = Math.max(maxActive, active);

        await new Promise<void>(resolve => {
          releases.push(resolve);
        });

        active -= 1;
        return { asset: remoteAsset(input.requestId) };
      },
    });

    const first = provider.generate(request('job-a'));
    const second = provider.generate(request('job-b'));

    await vi.waitFor(() => expect(started).toEqual(['job-a']));
    expect(active).toBe(1);
    expect(releases).toHaveLength(1);

    releases[0]();
    await first;

    await vi.waitFor(() => expect(started).toEqual(['job-a', 'job-b']));
    expect(active).toBe(1);
    expect(releases).toHaveLength(2);

    releases[1]();
    await second;

    expect(maxActive).toBe(VEO_FAST_MAX_CONCURRENCY);
    expect(active).toBe(0);
  });

  it('returns an unreviewed REMOTE result with the fixed VEO_FAST profile metadata', async () => {
    const provider = createVeoFastVideoProvider({
      execute: async input => ({
        asset: remoteAsset(input.requestId),
        providerMetadata: { operationId: 'operation-123' },
      }),
    });

    const result = await provider.generate(request('job-ok'));

    expect(result).toMatchObject({
      status: 'SUCCESS',
      providerId: VEO_FAST_VIDEO_PROVIDER_ID,
      outputStatus: 'UNREVIEWED',
      asset: {
        source: 'REMOTE',
        durationSeconds: VEO_FAST_DURATION_SECONDS,
      },
      providerMetadata: {
        providerKind: 'REMOTE',
        profile: 'VEO_FAST',
        model: VEO_FAST_MODEL,
        durationSeconds: VEO_FAST_DURATION_SECONDS,
        maxConcurrency: 1,
        operationId: 'operation-123',
      },
    });
  });

  it('rejects provider mismatches without entering the queue', async () => {
    const execute = vi.fn(async (input: VideoGenerationRequest) => ({
      asset: remoteAsset(input.requestId),
    }));
    const provider = createVeoFastVideoProvider({ execute });

    const result = await provider.generate(request('wrong-provider', 8, 'manual-video'));

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'PROVIDER_MISMATCH',
      retryable: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
