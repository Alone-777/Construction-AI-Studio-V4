import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDeterministicMockImageProvider,
  createImageGenerationService,
  createManualImageProvider,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ImageReference,
} from '../image-generation';
import {
  approveGeneratedImageAsOfficial,
  createVisualReferenceMemory,
  createVisualContinuityImageService,
  type VisualReferenceMemory,
  type VisualReferenceRecord,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface RequestOptions {
  readonly projectId?: string;
  readonly sceneId?: string;
  readonly stageId?: string;
  readonly sceneOrder?: number;
  readonly stageOrder?: number;
  readonly mode?: 'GENERATE' | 'EDIT';
  readonly providerId?: string;
  readonly references?: readonly ImageReference[];
}

function request(options: RequestOptions = {}): ImageGenerationRequest {
  return {
    requestId: `request:${options.projectId ?? 'project-a'}:${options.sceneId ?? 'scene-a'}:${options.stageId ?? 'stage-a'}:${options.sceneOrder ?? 0}:${options.stageOrder ?? 0}`,
    projectId: options.projectId ?? 'project-a',
    sceneId: options.sceneId ?? 'scene-a',
    stageId: options.stageId ?? 'stage-a',
    providerId: options.providerId ?? 'mock',
    mode: options.mode ?? 'GENERATE',
    prompt: 'canonical prompt from upstream',
    negativePrompt: 'future components',
    temporalAuthority: 'OFFICIAL',
    snapshotKind: 'OFFICIAL',
    references: options.references ?? [],
    aspectRatio: 16 / 9,
    metadata: {
      canonicalSpecId: 'canonical-a',
      snapshotId: 'snapshot-a',
      operationId: 'operation-a',
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

function asset(id: string): {
  readonly id: string;
  readonly source: 'MOCK';
  readonly uri: string;
} {
  return { id, source: 'MOCK', uri: `mock://image/${id}` };
}

function success(imageRequest: ImageGenerationRequest, imageAsset = asset('official-a')): ImageGenerationResult {
  return {
    status: 'SUCCESS',
    requestId: imageRequest.requestId,
    providerId: imageRequest.providerId,
    asset: imageAsset,
    warnings: [],
    outputStatus: 'UNREVIEWED',
  };
}

function officialRecord(options: RequestOptions & { readonly assetId?: string } = {}): VisualReferenceRecord {
  const imageRequest = request(options);
  return approveGeneratedImageAsOfficial({
    request: imageRequest,
    result: success(imageRequest, asset(options.assetId ?? imageRequest.requestId)),
    providerKind: imageRequest.providerId === 'manual' ? 'MANUAL' : 'MOCK',
    approval: { approved: true, recordedAt: 100 },
  });
}

function memoryWith(...records: readonly VisualReferenceRecord[]): VisualReferenceMemory {
  return createVisualReferenceMemory(records);
}

function flow(
  visualReferenceMemory: VisualReferenceMemory,
  provider: ImageProvider = createDeterministicMockImageProvider(),
) {
  return createVisualContinuityImageService({
    visualReferenceMemory,
    imageGenerationService: createImageGenerationService({ providers: [provider] }),
  });
}

describe('VisualContinuityImageService', () => {
  it('runs normally with no reference in an empty first frame', async () => {
    const base = request({ sceneOrder: 0, stageOrder: 0 });
    const result = await flow(memoryWith()).generate(base);

    expect(result.selectedReference).toBeNull();
    expect(result.finalRequest.references).toEqual([]);
    expect(result.generationResult.status).toBe('SUCCESS');
  });

  it('selects and enriches with the previous official reference', async () => {
    const previous = officialRecord({ sceneOrder: 0, stageOrder: 0 });
    const base = request({ sceneOrder: 1, stageOrder: 0 });
    const result = await flow(memoryWith(previous)).generate(base);

    expect(result.selectedReference).toEqual(previous);
    expect(result.finalRequest.references).toHaveLength(1);
    expect(result.finalRequest.references[0].asset.id).toBe(previous.asset.id);
  });

  it('prefers a prior official reference from the same scene', async () => {
    const sameScene = officialRecord({ sceneId: 'target-scene', sceneOrder: 0 });
    const otherScene = officialRecord({ sceneId: 'other-scene', sceneOrder: 1, assetId: 'other' });
    const result = await flow(memoryWith(sameScene, otherScene)).generate(
      request({ sceneId: 'target-scene', sceneOrder: 2 }),
    );

    expect(result.selectedReference?.asset.id).toBe(sameScene.asset.id);
  });

  it('falls back to the closest previous official from another scene', async () => {
    const old = officialRecord({ sceneOrder: 0, assetId: 'old' });
    const closest = officialRecord({ sceneId: 'scene-b', sceneOrder: 1, assetId: 'closest' });
    const result = await flow(memoryWith(old, closest)).generate(
      request({ sceneId: 'scene-c', sceneOrder: 2 }),
    );

    expect(result.selectedReference?.asset.id).toBe('closest');
  });

  it('blocks future references even when they are present in memory', async () => {
    const previous = officialRecord({ sceneOrder: 0, assetId: 'previous' });
    const future = officialRecord({ sceneOrder: 2, assetId: 'future' });
    const result = await flow(memoryWith(previous, future)).generate(
      request({ sceneOrder: 1 }),
    );

    expect(result.selectedReference?.asset.id).toBe('previous');
    expect(result.finalRequest.references.map(reference => reference.asset.id)).toEqual(['previous']);
  });

  it('blocks cross-project references', async () => {
    const otherProject = officialRecord({ projectId: 'project-b', sceneOrder: 0 });
    const result = await flow(memoryWith(otherProject)).generate(
      request({ projectId: 'project-a', sceneOrder: 1 }),
    );

    expect(result.selectedReference).toBeNull();
    expect(result.finalRequest.references).toEqual([]);
  });

  it('does not select a rejected record even through a defensive memory implementation', async () => {
    const rejected = {
      ...officialRecord(),
      stageOutcome: 'REJECTED',
      temporalAuthority: 'CANDIDATE',
      snapshotKind: 'CANDIDATE',
    } as unknown as VisualReferenceRecord;
    const defensiveMemory: VisualReferenceMemory = {
      records: [rejected],
      append: () => defensiveMemory,
      findByProject: () => [rejected],
      findBySceneStage: () => [rejected],
    };

    const result = await flow(defensiveMemory).generate(request({ sceneOrder: 1 }));

    expect(result.selectedReference).toBeNull();
    expect(result.finalRequest.references).toEqual([]);
  });

  it('preserves the base request and returns an enriched final request', async () => {
    const base = request({ sceneOrder: 1 });
    const before = structuredClone(base);
    const previous = officialRecord({ sceneOrder: 0 });
    const result = await flow(memoryWith(previous)).generate(base);

    expect(result.baseRequest).toEqual(before);
    expect(base).toEqual(before);
    expect(result.finalRequest).not.toBe(result.baseRequest);
  });

  it('recalculates requestId only when a reference is added', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const withReference = await flow(memoryWith(previous)).generate(request({ sceneOrder: 1 }));
    const withoutReference = await flow(memoryWith()).generate(request({ sceneOrder: 1 }));

    expect(withReference.finalRequest.requestId).not.toBe(withReference.baseRequest.requestId);
    expect(withoutReference.finalRequest.requestId).toBe(withoutReference.baseRequest.requestId);
  });

  it('does not add a duplicate selected asset', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const existing: ImageReference = { asset: previous.asset, role: 'PREVIOUS_OFFICIAL' };
    const base = request({ sceneOrder: 1, references: [existing] });
    const result = await flow(memoryWith(previous)).generate(base);

    expect(result.finalRequest.references).toHaveLength(1);
    expect(result.finalRequest.requestId).toBe(result.baseRequest.requestId);
  });

  it('keeps GENERATE as GENERATE while adding continuity', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const result = await flow(memoryWith(previous)).generate(request({ sceneOrder: 1, mode: 'GENERATE' }));

    expect(result.finalRequest.mode).toBe('GENERATE');
    expect(result.finalRequest.references).toHaveLength(1);
  });

  it('keeps EDIT and its existing references while adding official continuity', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const editReference: ImageReference = { asset: asset('edit-input'), role: 'MANUAL_REFERENCE' };
    const result = await flow(memoryWith(previous)).generate(
      request({ mode: 'EDIT', sceneOrder: 1, references: [editReference] }),
    );

    expect(result.finalRequest.mode).toBe('EDIT');
    expect(result.finalRequest.references.map(reference => reference.asset.id).sort()).toEqual([
      'edit-input',
      previous.asset.id,
    ].sort());
  });

  it('integrates with the real MANUAL provider without network', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const memory = memoryWith(previous);
    const result = await flow(
      memory,
      createManualImageProvider(),
    ).generate(request({ providerId: 'manual', sceneOrder: 1 }));

    expect(result.generationResult).toMatchObject({ status: 'MANUAL_READY', outputStatus: 'UNREVIEWED' });
    expect(memory.records).toHaveLength(1);
    if (result.generationResult.status === 'MANUAL_READY') {
      expect(result.generationResult.package.references[0].asset.id).toBe(previous.asset.id);
    }
  });

  it('integrates with the deterministic MOCK provider', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const base = request({ sceneOrder: 1 });
    const result = await flow(memoryWith(previous)).generate(base);

    expect(result.generationResult).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
    if (result.generationResult.status === 'SUCCESS') {
      expect(result.generationResult.asset.uri).toBe(`mock://image/${result.finalRequest.requestId}`);
    }
  });

  it('does not auto-approve SUCCESS or MANUAL_READY', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const memory = memoryWith(previous);
    const result = await flow(memory).generate(request({ sceneOrder: 1 }));

    expect(result.generationResult).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0]).toEqual(previous);
  });

  it('does not mutate VisualReferenceMemory during generation', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const memory = memoryWith(previous);
    const before = structuredClone(memory.records);

    await flow(memory).generate(request({ sceneOrder: 1 }));

    expect(memory.records).toEqual(before);
    expect(memory.records).toHaveLength(1);
  });

  it('is deterministic for repeated identical flow inputs', async () => {
    const previous = officialRecord({ sceneOrder: 0 });
    const first = await flow(memoryWith(previous)).generate(request({ sceneOrder: 1 }));
    const second = await flow(memoryWith(previous)).generate(request({ sceneOrder: 1 }));

    expect(first.finalRequest).toEqual(second.finalRequest);
    expect(first.generationResult).toEqual(second.generationResult);
  });

  it('performs no network call in the integrated flow', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const previous = officialRecord({ sceneOrder: 0 });

    await flow(memoryWith(previous), createManualImageProvider()).generate(
      request({ providerId: 'manual', sceneOrder: 1 }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
