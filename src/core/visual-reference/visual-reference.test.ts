import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDeterministicMockImageProvider,
  createManualImageProvider,
  withImageGenerationReferences,
  type ImageAssetRef,
  type ImageGenerationFailure,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageReference,
} from '../image-generation';
import {
  appendApprovedVisualReference,
  approveGeneratedImageAsOfficial,
  createVisualReferenceMemory,
  enrichImageGenerationRequestWithOfficialReference,
  selectBestOfficialReference,
  type ApproveGeneratedImageAsOfficialInput,
  type VisualReferenceRecord,
  type VisualReferenceTemporalPosition,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface RequestOptions {
  readonly requestId?: string;
  readonly projectId?: string;
  readonly sceneId?: string;
  readonly stageId?: string;
  readonly providerId?: string;
  readonly mode?: 'GENERATE' | 'EDIT';
  readonly temporalAuthority?: 'OFFICIAL' | 'CANDIDATE';
  readonly stageOutcome?: 'COMMITTED' | 'REJECTED' | 'PENDING';
  readonly references?: readonly ImageReference[];
  readonly sceneOrder?: number;
  readonly stageOrder?: number;
  readonly snapshotId?: string;
  readonly canonicalSpecId?: string;
}

function request(options: RequestOptions = {}): ImageGenerationRequest {
  const authority = options.temporalAuthority ?? 'OFFICIAL';
  return {
    requestId: options.requestId ?? 'image-request:a',
    projectId: options.projectId ?? 'project-a',
    sceneId: options.sceneId ?? 'scene-a',
    stageId: options.stageId ?? 'stage-a',
    providerId: options.providerId ?? 'mock',
    mode: options.mode ?? 'GENERATE',
    prompt: 'Canonical provider prompt',
    negativePrompt: 'future construction',
    temporalAuthority: authority,
    snapshotKind: authority,
    references: options.references ?? [],
    aspectRatio: 16 / 9,
    metadata: {
      canonicalSpecId: options.canonicalSpecId ?? 'canonical-a',
      snapshotId: options.snapshotId ?? 'snapshot-a',
      operationId: 'operation-a',
      temporalPoint: 'AFTER',
      stageOutcome: options.stageOutcome ?? 'COMMITTED',
      worldStateSource: 'CANDIDATE',
      temporalPosition: position(options.sceneOrder ?? 0, options.stageOrder ?? 0),
      attributes: { continuity: 'official' },
    },
  };
}

function asset(id = 'asset-a', source: ImageAssetRef['source'] = 'MOCK'): ImageAssetRef {
  return {
    id,
    source,
    uri: `${source.toLowerCase()}://image/${id}`,
    checksum: `checksum:${id}`,
    metadata: { pixelsGenerated: false },
  };
}

function success(
  imageRequest: ImageGenerationRequest,
  imageAsset = asset(),
): ImageGenerationResult {
  return {
    status: 'SUCCESS',
    requestId: imageRequest.requestId,
    providerId: imageRequest.providerId,
    asset: imageAsset,
    warnings: [],
    outputStatus: 'UNREVIEWED',
  };
}

function position(sceneOrder: number, stageOrder: number): VisualReferenceTemporalPosition {
  return { sceneOrder, stageOrder };
}

function approvalInput(
  imageRequest = request(),
  imageResult = success(imageRequest),
): ApproveGeneratedImageAsOfficialInput {
  return {
    request: imageRequest,
    result: imageResult,
    providerKind: imageRequest.providerId === 'manual' ? 'MANUAL' : 'MOCK',
    approval: {
      approved: true,
      recordedAt: 100,
      role: 'PREVIOUS_OFFICIAL',
      metadata: { reviewer: 'manual' },
    },
  };
}

function record(
  options: RequestOptions & {
    readonly assetId?: string;
    readonly recordedAt?: number;
    readonly role?: VisualReferenceRecord['role'];
  } = {},
): VisualReferenceRecord {
  const imageRequest = request(options);
  return approveGeneratedImageAsOfficial({
    ...approvalInput(
      imageRequest,
      success(imageRequest, asset(options.assetId ?? imageRequest.requestId)),
    ),
    approval: {
      approved: true,
      recordedAt: options.recordedAt ?? 100,
      role: options.role ?? 'PREVIOUS_OFFICIAL',
    },
  });
}

describe('visual reference approval and memory', () => {
  it('creates a valid official record only after explicit approval', () => {
    const approved = approveGeneratedImageAsOfficial(approvalInput());

    expect(approved).toMatchObject({
      approvalStatus: 'APPROVED',
      temporalAuthority: 'OFFICIAL',
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      imageResultStatus: 'SUCCESS',
      requestId: 'image-request:a',
      asset: { id: 'asset-a' },
    });
    expect(Object.isFrozen(approved)).toBe(true);
    expect(Object.isFrozen(approved.asset)).toBe(true);
  });

  it('does not create a record from FAILURE', () => {
    const imageRequest = request();
    const failure: ImageGenerationFailure = {
      status: 'FAILURE',
      requestId: imageRequest.requestId,
      providerId: imageRequest.providerId,
      errorCode: 'EXPECTED_FAILURE',
      message: 'failed',
      retryable: false,
    };

    expect(() =>
      approveGeneratedImageAsOfficial(approvalInput(imageRequest, failure)),
    ).toThrow('cannot be approved');
  });

  it('does not auto-promote an unreviewed provider result', () => {
    const memory = createVisualReferenceMemory();
    const generated = success(request());

    expect(generated).toMatchObject({ outputStatus: 'UNREVIEWED' });
    expect(memory.records).toHaveLength(0);
  });

  it('requires the explicit approved flag', () => {
    const input = approvalInput();
    const invalid = {
      ...input,
      approval: { ...input.approval, approved: false },
    } as unknown as ApproveGeneratedImageAsOfficialInput;

    expect(() => approveGeneratedImageAsOfficial(invalid)).toThrow('Explicit manual approval');
  });

  it('append returns a new memory without mutating the previous one', () => {
    const original = createVisualReferenceMemory();
    const next = original.append(record());

    expect(original.records).toHaveLength(0);
    expect(next.records).toHaveLength(1);
    expect(next).not.toBe(original);
    expect(Object.isFrozen(next.records)).toBe(true);
  });

  it('isolates appended records, metadata and source arrays from later external mutation', () => {
    const mutableMetadata = { nested: { label: 'before' } };
    const mutableAssetMetadata = { nested: { checksumSource: 'before' } };
    const sourceRecord = {
      ...record(),
      metadata: mutableMetadata,
      asset: {
        ...asset('isolated'),
        metadata: mutableAssetMetadata,
      },
    };
    const sourceRecords = [sourceRecord as VisualReferenceRecord];
    const memory = createVisualReferenceMemory().append(sourceRecords[0]);

    sourceRecord.sceneId = 'externally-mutated';
    mutableMetadata.nested.label = 'after';
    mutableAssetMetadata.nested.checksumSource = 'after';
    sourceRecords.length = 0;

    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].sceneId).toBe('scene-a');
    expect(memory.records[0].metadata).toEqual({ nested: { label: 'before' } });
    expect(memory.records[0].asset.metadata).toEqual({
      nested: { checksumSource: 'before' },
    });
  });

  it('appends approval and record as an explicit separate operation', () => {
    const original = createVisualReferenceMemory();
    const next = appendApprovedVisualReference(original, approvalInput());

    expect(original.records).toHaveLength(0);
    expect(next.records).toHaveLength(1);
  });

  it('queries records by projectId', () => {
    const memory = createVisualReferenceMemory([
      record({ requestId: 'a', projectId: 'project-a' }),
      record({ requestId: 'b', projectId: 'project-b', assetId: 'b' }),
    ]);

    expect(memory.findByProject('project-a').map(item => item.projectId)).toEqual(['project-a']);
  });

  it('queries records by project, scene and stage', () => {
    const expected = record({ requestId: 'a', sceneId: 'scene-a', stageId: 'stage-a' });
    const memory = createVisualReferenceMemory([
      expected,
      record({ requestId: 'b', sceneId: 'scene-a', stageId: 'stage-b', assetId: 'b' }),
    ]);

    expect(memory.findBySceneStage('project-a', 'scene-a', 'stage-a')).toEqual([expected]);
  });

  it('is idempotent for an identical record and rejects conflicting duplicate ids', () => {
    const approved = record();
    const memory = createVisualReferenceMemory([approved]);
    const same = memory.append(approved);
    const conflicting = { ...approved, sceneId: 'changed' };

    expect(same).toBe(memory);
    expect(() => memory.append(conflicting)).toThrow('different content');
  });

  it('rejects non-official or rejected records at the memory boundary', () => {
    const approved = record();
    const rejected = {
      ...approved,
      stageOutcome: 'REJECTED',
      temporalAuthority: 'CANDIDATE',
      snapshotKind: 'CANDIDATE',
    } as unknown as VisualReferenceRecord;

    expect(() => createVisualReferenceMemory([rejected])).toThrow('only explicitly approved');
  });
});

describe('deterministic official reference selection', () => {
  it('returns no invented reference for empty memory', () => {
    expect(
      selectBestOfficialReference(createVisualReferenceMemory(), request({
        requestId: 'target-empty',
        projectId: 'project-a',
        sceneId: 'scene-a',
        stageId: 'stage-b',
        sceneOrder: 0,
        stageOrder: 1,
      })),
    ).toBeUndefined();
  });

  it('selects the latest official prior record in the same project', () => {
    const earlier = record({ requestId: 'earlier', sceneOrder: 0, stageOrder: 0 });
    const latest = record({ requestId: 'latest', assetId: 'latest', sceneOrder: 1, stageOrder: 0 });
    const memory = createVisualReferenceMemory([earlier, latest]);

    expect(
      selectBestOfficialReference(memory, request({
        requestId: 'target-latest',
        projectId: 'project-a',
        sceneId: 'scene-next',
        stageId: 'stage-next',
        sceneOrder: 2,
        stageOrder: 0,
      })),
    ).toEqual(latest);
  });

  it('prefers a prior official from the same scene when applicable', () => {
    const sameScene = record({
      requestId: 'same',
      sceneId: 'scene-target',
      sceneOrder: 0,
      stageOrder: 0,
    });
    const closerOtherScene = record({
      requestId: 'other',
      assetId: 'other',
      sceneId: 'scene-other',
      sceneOrder: 1,
      stageOrder: 0,
    });
    const memory = createVisualReferenceMemory([sameScene, closerOtherScene]);

    expect(
      selectBestOfficialReference(memory, request({
        requestId: 'target-same-scene',
        projectId: 'project-a',
        sceneId: 'scene-target',
        stageId: 'stage-target',
        sceneOrder: 2,
        stageOrder: 0,
      })),
    ).toEqual(sameScene);
  });

  it('falls back to the closest prior official record from another scene', () => {
    const closest = record({
      requestId: 'closest',
      sceneId: 'scene-b',
      sceneOrder: 1,
      stageOrder: 1,
    });
    const memory = createVisualReferenceMemory([
      record({ requestId: 'old', sceneOrder: 0, stageOrder: 0 }),
      closest,
    ]);

    expect(
      selectBestOfficialReference(memory, request({
        requestId: 'target-fallback',
        projectId: 'project-a',
        sceneId: 'scene-c',
        stageId: 'stage-c',
        sceneOrder: 2,
        stageOrder: 0,
      })),
    ).toEqual(closest);
  });

  it('never selects a record from another project', () => {
    const memory = createVisualReferenceMemory([
      record({ requestId: 'other', projectId: 'other-project' }),
    ]);

    expect(
      selectBestOfficialReference(memory, request({
        requestId: 'target-project',
        projectId: 'project-a',
        sceneId: 'scene-a',
        stageId: 'stage-b',
        sceneOrder: 1,
        stageOrder: 0,
      })),
    ).toBeUndefined();
  });

  it('never selects a current or future record', () => {
    const memory = createVisualReferenceMemory([
      record({ requestId: 'current', sceneOrder: 1, stageOrder: 0 }),
      record({ requestId: 'future', assetId: 'future', sceneOrder: 2, stageOrder: 0 }),
    ]);

    expect(
      selectBestOfficialReference(memory, request({
        requestId: 'target-future',
        projectId: 'project-a',
        sceneId: 'scene-target',
        stageId: 'stage-target',
        sceneOrder: 1,
        stageOrder: 0,
      })),
    ).toBeUndefined();
  });

  it('uses deterministic recordedAt and id tie-breakers', () => {
    const first = record({
      requestId: 'request-z',
      assetId: 'z',
      sceneOrder: 0,
      stageOrder: 0,
      recordedAt: 100,
    });
    const preferred = record({
      requestId: 'request-a',
      assetId: 'a',
      sceneOrder: 0,
      stageOrder: 0,
      recordedAt: 100,
    });
    const target = request({
      requestId: 'target-tie',
      projectId: 'project-a',
      sceneId: 'scene-next',
      stageId: 'stage-next',
      sceneOrder: 1,
      stageOrder: 0,
    });

    expect(selectBestOfficialReference(createVisualReferenceMemory([first, preferred]), target)).toEqual(preferred);
    expect(selectBestOfficialReference(createVisualReferenceMemory([preferred, first]), target)).toEqual(preferred);
  });
});

describe('request enrichment', () => {
  it('adds an official image reference and recalculates request identity', () => {
    const original = request({ sceneOrder: 1, stageOrder: 0 });
    const previous = record({ sceneOrder: 0, stageOrder: 0 });
    const enriched = enrichImageGenerationRequestWithOfficialReference(original, previous);
    const expected = withImageGenerationReferences(original, [
      { asset: previous.asset, role: previous.role },
    ]);

    expect(enriched.references).toHaveLength(1);
    expect(enriched.references[0]).toMatchObject({
      role: 'PREVIOUS_OFFICIAL',
      asset: { id: 'image-request:a' },
    });
    expect(enriched.requestId).not.toBe(original.requestId);
    expect(enriched.requestId).toBe(expected.requestId);
    expect(original.requestId).toBe('image-request:a');
  });

  it('does not mutate the original request or nested metadata', () => {
    const original = request({ sceneOrder: 1, stageOrder: 0 });
    const before = structuredClone(original);

    enrichImageGenerationRequestWithOfficialReference(original, record());

    expect(original).toEqual(before);
  });

  it('does not duplicate an already present asset', () => {
    const previous = record();
    const existingReference: ImageReference = {
      asset: previous.asset,
      role: 'PREVIOUS_OFFICIAL',
    };
    const original = request({ references: [existingReference], sceneOrder: 1, stageOrder: 0 });
    const enriched = enrichImageGenerationRequestWithOfficialReference(original, previous);

    expect(enriched.references).toHaveLength(1);
    expect(enriched.requestId).toBe(original.requestId);
  });

  it('keeps GENERATE valid without requiring a reference', () => {
    const original = request({ mode: 'GENERATE' });
    const enriched = enrichImageGenerationRequestWithOfficialReference(original);

    expect(enriched).toEqual(original);
    expect(enriched.mode).toBe('GENERATE');
    expect(enriched.references).toEqual([]);
  });

  it('keeps EDIT and its valid references while adding continuity', () => {
    const editReference: ImageReference = {
      asset: asset('edit-base', 'IMPORTED'),
      role: 'MANUAL_REFERENCE',
    };
    const original = request({
      mode: 'EDIT',
      references: [editReference],
      sceneOrder: 1,
      stageOrder: 0,
    });
    const enriched = enrichImageGenerationRequestWithOfficialReference(original, record());

    expect(enriched.mode).toBe('EDIT');
    expect(enriched.references.map(item => item.asset.id).sort()).toEqual([
      'edit-base',
      'image-request:a',
    ]);
  });

  it('ignores a reference from a divergent project', () => {
    const original = request({ projectId: 'project-a', sceneOrder: 1, stageOrder: 0 });
    const divergent = record({ projectId: 'project-b' });
    const enriched = enrichImageGenerationRequestWithOfficialReference(original, divergent);

    expect(enriched).toEqual(original);
    expect(enriched.references).toHaveLength(0);
  });

  it('produces the same enriched request for the same semantic inputs', () => {
    const original = request({ sceneOrder: 1, stageOrder: 0 });
    const previous = record();

    expect(enrichImageGenerationRequestWithOfficialReference(original, previous)).toEqual(
      enrichImageGenerationRequestWithOfficialReference(original, previous),
    );
  });

  it('ignores a future record passed directly to enrichment', () => {
    const target = request({ sceneOrder: 1, stageOrder: 0 });
    const future = record({ requestId: 'future-direct', sceneOrder: 2, stageOrder: 0 });
    const enriched = enrichImageGenerationRequestWithOfficialReference(target, future);

    expect(enriched).toEqual(target);
    expect(enriched.references).toEqual([]);
    expect(enriched.requestId).toBe(target.requestId);
  });
});

describe('manual approval bridge and temporal isolation', () => {
  it('rejects a SUCCESS result without a valid asset', () => {
    const imageRequest = request();
    const invalid = success(imageRequest, { id: '', source: 'MOCK', uri: '' });

    expect(() =>
      approveGeneratedImageAsOfficial(approvalInput(imageRequest, invalid)),
    ).toThrow('asset with id and uri');
  });

  it('rejects a CANDIDATE request', () => {
    const candidate = request({ temporalAuthority: 'CANDIDATE', stageOutcome: 'PENDING' });

    expect(() => approveGeneratedImageAsOfficial(approvalInput(candidate))).toThrow(
      'Only an OFFICIAL',
    );
  });

  it('rejects an official request whose stage outcome is rejected', () => {
    const rejected = request({ stageOutcome: 'REJECTED' });

    expect(() => approveGeneratedImageAsOfficial(approvalInput(rejected))).toThrow(
      'Only a COMMITTED',
    );
  });

  it('rejects a result that does not match request identity', () => {
    const imageRequest = request();
    const mismatched = { ...success(imageRequest), requestId: 'different' } as ImageGenerationResult;

    expect(() =>
      approveGeneratedImageAsOfficial(approvalInput(imageRequest, mismatched)),
    ).toThrow('does not match');
  });

  it.each<[string, RequestOptions]>([
    ['requestId', { requestId: '' }],
    ['requestId', { requestId: '   ' }],
    ['providerId', { providerId: '' }],
    ['providerId', { providerId: '\t' }],
    ['snapshotId', { snapshotId: '' }],
    ['snapshotId', { snapshotId: '   ' }],
    ['canonicalSpecId', { canonicalSpecId: '' }],
    ['canonicalSpecId', { canonicalSpecId: '\n' }],
    ['projectId', { projectId: '   ' }],
    ['sceneId', { sceneId: '' }],
    ['stageId', { stageId: '\t' }],
  ])('rejects a blank required approval %s', (field, options) => {
    const invalidRequest = request(options);

    expect(() => approveGeneratedImageAsOfficial(approvalInput(invalidRequest))).toThrow(
      `Image approval ${field} is required.`,
    );
  });

  it('requires a supplied asset to approve MANUAL_READY', async () => {
    const imageRequest = request({ providerId: 'manual' });
    const manualResult = await createManualImageProvider().generate(imageRequest);

    expect(() =>
      approveGeneratedImageAsOfficial(approvalInput(imageRequest, manualResult)),
    ).toThrow('asset with id and uri');
  });

  it('approves MANUAL_READY only with an explicitly supplied manual asset', async () => {
    const imageRequest = request({ providerId: 'manual' });
    const manualResult = await createManualImageProvider().generate(imageRequest);
    const approved = approveGeneratedImageAsOfficial({
      ...approvalInput(imageRequest, manualResult),
      approvedAsset: asset('manual-import', 'IMPORTED'),
    });

    expect(approved).toMatchObject({
      imageResultStatus: 'MANUAL_READY',
      providerKind: 'MANUAL',
      asset: { id: 'manual-import', source: 'IMPORTED' },
    });
  });

  it('keeps the manual provider free-first and functional', async () => {
    const imageRequest = request({ providerId: 'manual' });
    const result = await createManualImageProvider().generate(imageRequest);

    expect(result).toMatchObject({ status: 'MANUAL_READY', outputStatus: 'UNREVIEWED' });
  });

  it('keeps the mock provider deterministic and unreviewed', async () => {
    const imageRequest = request();
    const provider = createDeterministicMockImageProvider();

    expect(await provider.generate(imageRequest)).toEqual(await provider.generate(imageRequest));
    await expect(provider.generate(imageRequest)).resolves.toMatchObject({
      status: 'SUCCESS',
      outputStatus: 'UNREVIEWED',
    });
  });

  it('introduces no network call in manual, mock, approval or enrichment paths', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const mockRequest = request();
    const manualRequest = request({ providerId: 'manual' });
    const mockResult = await createDeterministicMockImageProvider().generate(mockRequest);
    const manualResult = await createManualImageProvider().generate(manualRequest);

    approveGeneratedImageAsOfficial(approvalInput(mockRequest, mockResult));
    approveGeneratedImageAsOfficial({
      ...approvalInput(manualRequest, manualResult),
      approvedAsset: asset('manual-import', 'IMPORTED'),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not mutate request or upstream temporal evidence during approval', () => {
    const imageRequest = request();
    const requestBefore = structuredClone(imageRequest);
    const upstreamEvidence = Object.freeze({
      snapshot: Object.freeze({ id: 'snapshot-a', kind: 'OFFICIAL' }),
      canonicalSpec: Object.freeze({ id: 'canonical-a' }),
      worldState: Object.freeze({ progress: 25 }),
      stage: Object.freeze({ status: 'COMPLETED' }),
      transaction: Object.freeze({ status: 'COMMITTED' }),
    });
    const evidenceBefore = structuredClone(upstreamEvidence);

    approveGeneratedImageAsOfficial(approvalInput(imageRequest));

    expect(imageRequest).toEqual(requestBefore);
    expect(upstreamEvidence).toEqual(evidenceBefore);
  });
});
