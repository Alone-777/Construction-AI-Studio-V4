import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeManualImageGeneration,
  createImageGenerationService,
  createManualImageProvider,
  type ImageAssetRef,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ManualImageSubmission,
} from './index';
import {
  approveGeneratedImageAsOfficial,
  createVisualContinuityImageService,
  createVisualReferenceMemory,
  type VisualReferenceMemory,
} from '../visual-reference';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface RequestOptions {
  readonly label?: string;
  readonly projectId?: string;
  readonly sceneId?: string;
  readonly stageId?: string;
  readonly sceneOrder?: number;
  readonly stageOrder?: number;
}

function request(options: RequestOptions = {}): ImageGenerationRequest {
  const label = options.label ?? 'a';
  return {
    requestId: `manual-request:${label}`,
    projectId: options.projectId ?? 'project-a',
    sceneId: options.sceneId ?? `scene-${label}`,
    stageId: options.stageId ?? `stage-${label}`,
    providerId: 'manual',
    mode: 'GENERATE',
    prompt: `canonical prompt ${label}`,
    negativePrompt: 'future construction',
    temporalAuthority: 'OFFICIAL',
    snapshotKind: 'OFFICIAL',
    references: [],
    aspectRatio: 16 / 9,
    metadata: {
      canonicalSpecId: `canonical-${label}`,
      snapshotId: `snapshot-${label}`,
      operationId: `operation-${label}`,
      temporalPoint: 'AFTER',
      stageOutcome: 'COMMITTED',
      worldStateSource: 'CANDIDATE',
      temporalPosition: {
        sceneOrder: options.sceneOrder ?? 0,
        stageOrder: options.stageOrder ?? 0,
      },
    },
  };
}

function importedAsset(label = 'a'): ImageAssetRef {
  return {
    id: `imported-${label}`,
    source: 'IMPORTED',
    uri: `local://manual-image/${label}`,
    mimeType: 'image/png',
    width: 1920,
    height: 1080,
    metadata: { externalTool: 'user-selected' },
  };
}

function submission(
  imageRequest: ImageGenerationRequest,
  label = 'a',
): ManualImageSubmission {
  return {
    submissionId: `submission-${label}`,
    requestId: imageRequest.requestId,
    asset: importedAsset(label),
    submittedAt: 100,
    metadata: { submittedBy: 'user' },
  };
}

async function manualReady(imageRequest: ImageGenerationRequest): Promise<ImageGenerationResult> {
  return createManualImageProvider().generate(imageRequest);
}

function continuityFlow(memory: VisualReferenceMemory) {
  return createVisualContinuityImageService({
    visualReferenceMemory: memory,
    imageGenerationService: createImageGenerationService({
      providers: [createManualImageProvider()],
    }),
  });
}

async function completeFlowRequest(
  memory: VisualReferenceMemory,
  imageRequest: ImageGenerationRequest,
  label: string,
) {
  const generation = await continuityFlow(memory).generate(imageRequest);
  const completion = completeManualImageGeneration({
    request: generation.finalRequest,
    manualReadyResult: generation.generationResult,
    submission: submission(generation.finalRequest, label),
  });
  return { generation, completion };
}

function approve(
  imageRequest: ImageGenerationRequest,
  result: ImageGenerationResult,
  recordedAt: number,
) {
  return approveGeneratedImageAsOfficial({
    request: imageRequest,
    result,
    providerKind: 'MANUAL',
    approval: {
      approved: true,
      recordedAt,
      role: 'PREVIOUS_OFFICIAL',
    },
  });
}

describe('manual image completion bridge', () => {
  it('converts a matching MANUAL_READY package and valid asset to unreviewed SUCCESS', async () => {
    const imageRequest = request();
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: submission(imageRequest),
    });

    expect(result).toMatchObject({
      status: 'SUCCESS',
      requestId: imageRequest.requestId,
      providerId: 'manual',
      outputStatus: 'UNREVIEWED',
      asset: { id: 'imported-a', source: 'IMPORTED' },
      providerMetadata: {
        providerKind: 'MANUAL',
        completionSource: 'USER_SUBMISSION',
        submissionId: 'submission-a',
      },
    });
  });

  it('does not mutate memory or auto-approve a completed image', async () => {
    const memory = createVisualReferenceMemory();
    const imageRequest = request();
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: submission(imageRequest),
    });

    expect(result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
    expect(memory.records).toEqual([]);
  });

  it('returns structured failure for a submission bound to another request', async () => {
    const imageRequest = request();
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: { ...submission(imageRequest), requestId: 'manual-request:b' },
    });

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_REQUEST_MISMATCH',
      retryable: false,
    });
  });

  it('returns structured failure for MANUAL_READY belonging to another request', async () => {
    const imageRequest = request({ label: 'a' });
    const otherResult = await manualReady(request({ label: 'b' }));
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: otherResult,
      submission: submission(imageRequest),
    });

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_REQUEST_MISMATCH',
    });
  });

  it.each(['', '   '])('rejects blank requestId %j before completion', async invalidId => {
    const imageRequest = { ...request(), requestId: invalidId };
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: submission(imageRequest),
    });

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_INVALID_REQUEST',
    });
  });

  it.each([
    ['asset id', { asset: { ...importedAsset(), id: '' } }],
    ['asset id whitespace', { asset: { ...importedAsset(), id: '   ' } }],
    ['asset uri', { asset: { ...importedAsset(), uri: '' } }],
    ['asset uri whitespace', { asset: { ...importedAsset(), uri: '\t' } }],
  ])('rejects invalid %s with a structured asset failure', async (_label, change) => {
    const imageRequest = request();
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: { ...submission(imageRequest), ...change },
    });

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_INVALID_ASSET',
    });
  });

  it.each(['', '   ', '\t'])('rejects blank submissionId %j', async invalidId => {
    const imageRequest = request();
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: { ...submission(imageRequest), submissionId: invalidId },
    });

    expect(result).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_INVALID_SUBMISSION',
    });
  });

  it('does not complete a FAILURE result', () => {
    const imageRequest = request();
    const failure: ImageGenerationResult = {
      status: 'FAILURE',
      requestId: imageRequest.requestId,
      providerId: imageRequest.providerId,
      errorCode: 'MANUAL_WORKFLOW_FAILED',
      message: 'failed',
      retryable: false,
    };

    expect(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: failure,
      submission: submission(imageRequest),
    })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_RESULT_REQUIRED',
    });
  });

  it('does not complete an existing SUCCESS result again', () => {
    const imageRequest = request();
    const success: ImageGenerationResult = {
      status: 'SUCCESS',
      requestId: imageRequest.requestId,
      providerId: imageRequest.providerId,
      asset: importedAsset(),
      warnings: [],
      outputStatus: 'UNREVIEWED',
    };

    expect(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: success,
      submission: submission(imageRequest),
    })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_RESULT_REQUIRED',
    });
  });

  it('rejects a provider-incompatible MANUAL_READY result', async () => {
    const imageRequest = request();
    const ready = await manualReady(imageRequest);
    const incompatible = {
      ...ready,
      providerMetadata: { providerKind: 'MOCK' },
    } as ImageGenerationResult;

    expect(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: incompatible,
      submission: submission(imageRequest),
    })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_PROVIDER_MISMATCH',
    });
  });

  it('rejects a MANUAL_READY result from a different provider id', async () => {
    const imageRequest = request();
    const ready = await manualReady(imageRequest);
    const incompatible = {
      ...ready,
      providerId: 'other-manual-provider',
    } as ImageGenerationResult;

    expect(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: incompatible,
      submission: submission(imageRequest),
    })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'MANUAL_COMPLETION_PROVIDER_MISMATCH',
    });
  });

  it('does not mutate request, MANUAL_READY, submission or nested asset metadata', async () => {
    const imageRequest = request();
    const ready = await manualReady(imageRequest);
    const manualSubmission = submission(imageRequest);
    const before = structuredClone({ imageRequest, ready, manualSubmission });
    const result = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: ready,
      submission: manualSubmission,
    });

    expect({ imageRequest, ready, manualSubmission }).toEqual(before);
    if (result.status !== 'SUCCESS') throw new Error('Expected manual completion success.');

    (manualSubmission.asset.metadata as { externalTool: string }).externalTool = 'mutated';
    expect(result.asset.metadata).toEqual({ externalTool: 'user-selected' });
  });

  it('is deterministic for the same request, package and submission', async () => {
    const imageRequest = request();
    const ready = await manualReady(imageRequest);
    const manualSubmission = submission(imageRequest);

    expect(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: ready,
      submission: manualSubmission,
    })).toEqual(completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: ready,
      submission: manualSubmission,
    }));
  });

  it('completes and explicitly approves the first image without inventing a reference', async () => {
    const memory = createVisualReferenceMemory();
    const { generation, completion } = await completeFlowRequest(
      memory,
      request({ label: 'a', sceneOrder: 0 }),
      'a',
    );

    expect(generation.selectedReference).toBeNull();
    expect(generation.finalRequest.references).toEqual([]);
    expect(completion).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });

    const record = approve(generation.finalRequest, completion, 100);
    const approvedMemory = memory.append(record);
    expect(memory.records).toHaveLength(0);
    expect(approvedMemory.records).toHaveLength(1);
    expect(approvedMemory.records[0].asset.id).toBe('imported-a');
  });

  it('preserves temporal request authority through completion and explicit approval', async () => {
    const imageRequest = request({ label: 'temporal', sceneOrder: 2, stageOrder: 3 });
    const completion = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: submission(imageRequest, 'temporal'),
    });
    const record = approve(imageRequest, completion, 100);

    expect(record).toMatchObject({
      projectId: imageRequest.projectId,
      sceneId: imageRequest.sceneId,
      stageId: imageRequest.stageId,
      snapshotId: imageRequest.metadata.snapshotId,
      canonicalSpecId: imageRequest.metadata.canonicalSpecId,
      temporalPoint: imageRequest.metadata.temporalPoint,
      stageOutcome: 'COMMITTED',
      snapshotKind: 'OFFICIAL',
      temporalAuthority: 'OFFICIAL',
    });
  });

  it('completes the first real A -> B -> C official continuity cycle', async () => {
    const memoryEmpty = createVisualReferenceMemory();
    const a = await completeFlowRequest(
      memoryEmpty,
      request({ label: 'a', sceneOrder: 0 }),
      'a',
    );
    const recordA = approve(a.generation.finalRequest, a.completion, 100);
    const memoryA = memoryEmpty.append(recordA);

    const b = await completeFlowRequest(
      memoryA,
      request({ label: 'b', sceneOrder: 1 }),
      'b',
    );
    expect(b.generation.selectedReference?.asset.id).toBe('imported-a');
    expect(b.generation.finalRequest.references.map(item => item.asset.id)).toEqual(['imported-a']);
    const recordB = approve(b.generation.finalRequest, b.completion, 200);
    const memoryAB = memoryA.append(recordB);

    const c = await continuityFlow(memoryAB).generate(
      request({ label: 'c', sceneOrder: 2 }),
    );
    expect(c.selectedReference?.asset.id).toBe('imported-b');
    expect(c.finalRequest.references.map(item => item.asset.id)).toEqual(['imported-b']);
    expect(memoryEmpty.records).toHaveLength(0);
    expect(memoryA.records.map(item => item.asset.id)).toEqual(['imported-a']);
    expect(memoryAB.records.map(item => item.asset.id)).toEqual(['imported-a', 'imported-b']);
  });

  it('keeps future and cross-project official assets out of manual generation', async () => {
    const pastRequest = request({ label: 'past', sceneOrder: 0 });
    const futureRequest = request({ label: 'future', sceneOrder: 3 });
    const otherRequest = request({ label: 'other', projectId: 'project-b', sceneOrder: 1 });
    const past = approve(
      pastRequest,
      completeManualImageGeneration({
        request: pastRequest,
        manualReadyResult: await manualReady(pastRequest),
        submission: submission(pastRequest, 'past'),
      }),
      100,
    );
    const future = approve(
      futureRequest,
      completeManualImageGeneration({
        request: futureRequest,
        manualReadyResult: await manualReady(futureRequest),
        submission: submission(futureRequest, 'future'),
      }),
      300,
    );
    const other = approve(
      otherRequest,
      completeManualImageGeneration({
        request: otherRequest,
        manualReadyResult: await manualReady(otherRequest),
        submission: submission(otherRequest, 'other'),
      }),
      200,
    );
    const memory = createVisualReferenceMemory([future, other, past]);

    const target = await continuityFlow(memory).generate(
      request({ label: 'target', sceneOrder: 2 }),
    );
    expect(target.selectedReference?.asset.id).toBe('imported-past');
    expect(target.finalRequest.references.map(item => item.asset.id)).toEqual(['imported-past']);
  });

  it('requires no network or API for manual generation and completion', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const imageRequest = request();
    const completion = completeManualImageGeneration({
      request: imageRequest,
      manualReadyResult: await manualReady(imageRequest),
      submission: submission(imageRequest),
    });

    expect(completion.status).toBe('SUCCESS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
