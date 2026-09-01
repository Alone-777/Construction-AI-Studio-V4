import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeManualImageGeneration,
  createDeterministicMockImageProvider,
  createImageGenerationService,
  createManualImageProvider,
  type ImageAssetRef,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageReference,
} from '../image-generation';
import {
  approveGeneratedImageAsOfficial,
  createVisualContinuityImageService,
  createVisualReferenceMemory,
  type VisualReferenceMemory,
  type VisualReferenceRecord,
} from '../visual-reference';
import {
  createDeterministicMockVisualObservationProvider,
  createVisualValidationId,
  evaluateVisualApprovalEligibility,
  validateVisualContinuity,
  type VisualValidationFinding,
  type VisualValidationRequest,
  type VisualValidationResult,
} from '../visual-validation';
import {
  createCorrectedImageGenerationRequest,
  createVisualCorrectionPlan,
  evaluateVisualRetryEligibility,
  getImageGenerationAttemptNumber,
  type VisualCorrectionIssueCode,
  type VisualCorrectionPlan,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface RequestOptions {
  readonly label?: string;
  readonly projectId?: string;
  readonly sceneId?: string;
  readonly stageId?: string;
  readonly sceneOrder?: number;
  readonly providerId?: string;
  readonly references?: readonly ImageReference[];
}

function request(options: RequestOptions = {}): ImageGenerationRequest {
  const label = options.label ?? 'b';
  return {
    requestId: `request:${options.projectId ?? 'project-a'}:${label}`,
    projectId: options.projectId ?? 'project-a',
    sceneId: options.sceneId ?? `scene-${label}`,
    stageId: options.stageId ?? `stage-${label}`,
    providerId: options.providerId ?? 'mock',
    mode: 'GENERATE',
    prompt: `canonical prompt ${label}`,
    negativePrompt: 'future construction',
    temporalAuthority: 'OFFICIAL',
    snapshotKind: 'OFFICIAL',
    references: options.references ?? [],
    aspectRatio: 16 / 9,
    metadata: {
      canonicalSpecId: `canonical-${label}`,
      snapshotId: `snapshot-${label}`,
      operationId: `operation-${label}`,
      temporalPoint: 'AFTER',
      stageOutcome: 'COMMITTED',
      worldStateSource: 'CANDIDATE',
      temporalPosition: { sceneOrder: options.sceneOrder ?? 1, stageOrder: 0 },
    },
  };
}

function asset(id: string, source: ImageAssetRef['source'] = 'MOCK'): ImageAssetRef {
  return { id, source, uri: `${source.toLowerCase()}://visual/${id}` };
}

function success(
  imageRequest: ImageGenerationRequest,
  candidateAsset = asset(`candidate:${imageRequest.requestId}`),
): ImageGenerationResult {
  return {
    status: 'SUCCESS',
    requestId: imageRequest.requestId,
    providerId: imageRequest.providerId,
    asset: candidateAsset,
    warnings: [],
    outputStatus: 'UNREVIEWED',
  };
}

function validationRequest(
  imageRequest: ImageGenerationRequest,
  candidate: ImageGenerationResult,
  previous?: VisualReferenceRecord | null,
): VisualValidationRequest {
  if (candidate.status !== 'SUCCESS') throw new Error('Expected success candidate.');
  return {
    validationId: createVisualValidationId(imageRequest.requestId, candidate.asset.id),
    projectId: imageRequest.projectId,
    sceneId: imageRequest.sceneId,
    stageId: imageRequest.stageId,
    operationId: imageRequest.metadata.operationId,
    requestId: imageRequest.requestId,
    snapshotId: imageRequest.metadata.snapshotId,
    canonicalSpecId: imageRequest.metadata.canonicalSpecId,
    candidateAsset: structuredClone(candidate.asset),
    previousOfficialReference: previous ? {
      recordId: previous.id,
      requestId: previous.requestId,
      projectId: previous.projectId,
      sceneId: previous.sceneId,
      stageId: previous.stageId,
      asset: structuredClone(previous.asset),
      temporalPosition: { ...previous.temporalPosition },
    } : undefined,
    temporalAuthority: imageRequest.temporalAuthority,
    snapshotKind: imageRequest.snapshotKind,
    stageOutcome: imageRequest.metadata.stageOutcome,
    temporalPoint: imageRequest.metadata.temporalPoint,
    worldStateSource: imageRequest.metadata.worldStateSource,
    temporalPosition: imageRequest.metadata.temporalPosition,
    expected: {
      requiredElements: ['component-a', 'component-b'],
      forbiddenFutureElements: ['component-c'],
      expectedCharacter: {
        characterId: 'builder-1',
        visualIdentityId: 'builder-visual-1',
        name: 'Builder',
      },
      expectedClothing: 'orange work jacket',
      expectedEnvironment: {
        preset: 'floresta_temperada',
        climate: 'clear',
        light: 'day',
        timeOfDay: 'day',
        weather: 'clear',
        permanentObjects: ['old-tree'],
      },
      expectedConstructionState: {
        progress: 50,
        targetId: 'component-b',
        targetState: 'COMPLETE',
        expectedTargetStatus: 'COMPLETE',
        presentComponents: ['component-a', 'component-b'],
        completedComponents: ['component-a', 'component-b'],
        partialComponents: [],
      },
      expectedMaterials: ['wood'],
      expectedTools: ['hammer'],
      continuityConstraints: ['preserve character, environment and component A'],
    },
  };
}

async function scenarioValidation(
  imageRequest: ImageGenerationRequest,
  candidate: ImageGenerationResult,
  scenario: Parameters<typeof createDeterministicMockVisualObservationProvider>[0],
  previous?: VisualReferenceRecord | null,
): Promise<VisualValidationResult> {
  const validationInput = validationRequest(imageRequest, candidate, previous);
  const observer = createDeterministicMockVisualObservationProvider(scenario);
  return validateVisualContinuity(validationInput, await observer.observe(validationInput));
}

function findingValidation(
  imageRequest: ImageGenerationRequest,
  candidate: ImageGenerationResult,
  finding: VisualValidationFinding,
  verdict: 'WARN' | 'FAIL' = 'FAIL',
): VisualValidationResult {
  if (candidate.status !== 'SUCCESS') throw new Error('Expected success candidate.');
  return {
    validationId: createVisualValidationId(imageRequest.requestId, candidate.asset.id),
    requestId: imageRequest.requestId,
    assetId: candidate.asset.id,
    projectId: imageRequest.projectId,
    sceneId: imageRequest.sceneId,
    stageId: imageRequest.stageId,
    operationId: imageRequest.metadata.operationId,
    snapshotId: imageRequest.metadata.snapshotId,
    canonicalSpecId: imageRequest.metadata.canonicalSpecId,
    temporalAuthority: imageRequest.temporalAuthority,
    snapshotKind: imageRequest.snapshotKind,
    stageOutcome: imageRequest.metadata.stageOutcome,
    temporalPoint: imageRequest.metadata.temporalPoint,
    verdict,
    findings: [finding],
    checkedRules: ['test-rule'],
    evidenceSource: { providerId: 'mock-visual-observer', providerKind: 'MOCK' },
    validatedAt: 100,
  };
}

function unwrapPlan(result: ReturnType<typeof createVisualCorrectionPlan>): VisualCorrectionPlan {
  if (result.status !== 'CREATED') throw new Error(`Expected correction plan, got ${result.status}.`);
  return result.plan;
}

function correctedRequest(
  source: ImageGenerationRequest,
  plan: VisualCorrectionPlan,
): ImageGenerationRequest {
  const result = createCorrectedImageGenerationRequest(source, plan);
  if (result.status !== 'CREATED') throw new Error(`Expected corrected request: ${result.message}`);
  return result.request;
}

async function officialA(): Promise<VisualReferenceRecord> {
  const requestA = request({ label: 'a', sceneOrder: 0 });
  const resultA = await createDeterministicMockImageProvider().generate(requestA);
  return approveGeneratedImageAsOfficial({
    request: requestA,
    result: resultA,
    providerKind: 'MOCK',
    approval: { approved: true, recordedAt: 100, role: 'PREVIOUS_OFFICIAL' },
  });
}

function mockFlow(memory: VisualReferenceMemory) {
  return createVisualContinuityImageService({
    visualReferenceMemory: memory,
    imageGenerationService: createImageGenerationService({
      providers: [createDeterministicMockImageProvider()],
    }),
  });
}

async function generatedB1(recordA: VisualReferenceRecord) {
  const memoryA = createVisualReferenceMemory([recordA]);
  const generation = await mockFlow(memoryA).generate(request({ label: 'b', sceneOrder: 1 }));
  if (generation.generationResult.status !== 'SUCCESS') throw new Error('Expected B1 success.');
  return { memoryA, generation };
}

describe('VisualCorrectionPlan creation and binding', () => {
  it('creates a correction plan from FAIL', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const result = createVisualCorrectionPlan({ request: source, candidate, validation });

    expect(result.status).toBe('CREATED');
    if (result.status === 'CREATED') {
      expect(result.plan).toMatchObject({
        sourceRequestId: source.requestId,
        sourceAssetId: candidate.status === 'SUCCESS' ? candidate.asset.id : '',
        sourceValidationId: validation.validationId,
        attemptNumber: 2,
      });
    }
  });

  it('does not create a normal correction plan for PASS', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'COHERENT');

    expect(createVisualCorrectionPlan({ request: source, candidate, validation })).toEqual({
      status: 'NOT_REQUIRED',
      reason: 'PASS',
    });
  });

  it('requires an explicit retry choice for WARN', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'MINOR_DIVERGENCE');

    expect(createVisualCorrectionPlan({ request: source, candidate, validation })).toEqual({
      status: 'NOT_REQUIRED',
      reason: 'WARN_RETRY_NOT_REQUESTED',
    });
    expect(createVisualCorrectionPlan({
      request: source,
      candidate,
      validation,
      retryWarn: true,
    }).status).toBe('CREATED');
  });

  it('rejects a candidate from another request', async () => {
    const source = request();
    const other = request({ label: 'other' });
    const candidate = success(other);
    const validation = await scenarioValidation(other, candidate, 'FUTURE_ELEMENT');
    expect(createVisualCorrectionPlan({ request: source, candidate, validation })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'SOURCE_REQUEST_MISMATCH',
    });
  });

  it('rejects validation from another request', async () => {
    const source = request();
    const candidate = success(source);
    const other = request({ label: 'other' });
    const otherCandidate = success(other);
    const validation = await scenarioValidation(other, otherCandidate, 'FUTURE_ELEMENT');
    expect(createVisualCorrectionPlan({ request: source, candidate, validation })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'SOURCE_REQUEST_MISMATCH',
    });
  });

  it('rejects validation bound to another asset', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const mismatched = { ...validation, assetId: 'other-asset' };
    expect(createVisualCorrectionPlan({ request: source, candidate, validation: mismatched })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'SOURCE_ASSET_MISMATCH',
    });
  });

  it('rejects a forged validationId', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const mismatched = { ...validation, validationId: 'forged-validation' };
    expect(createVisualCorrectionPlan({ request: source, candidate, validation: mismatched })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'SOURCE_VALIDATION_MISMATCH',
    });
  });

  it.each([
    ['EVIDENCE_REQUEST_MISMATCH', 'SOURCE_REQUEST_MISMATCH'],
    ['EVIDENCE_ASSET_MISMATCH', 'SOURCE_ASSET_MISMATCH'],
    ['EVIDENCE_VALIDATION_MISMATCH', 'SOURCE_VALIDATION_MISMATCH'],
  ] as const)('rejects invalid %s evidence before planning', (findingCode, errorCode) => {
    const source = request();
    const candidate = success(source);
    const validation = findingValidation(source, candidate, {
      code: findingCode,
      severity: 'FAIL',
      message: 'Evidence binding mismatch.',
    });

    expect(createVisualCorrectionPlan({ request: source, candidate, validation })).toMatchObject({
      status: 'FAILURE',
      errorCode,
    });
  });

  it('rejects validation with rewritten temporal identity', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const mismatched = { ...validation, canonicalSpecId: 'canonical-other' };
    expect(createVisualCorrectionPlan({ request: source, candidate, validation: mismatched })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'TEMPORAL_IDENTITY_MISMATCH',
    });
  });

  it('preserves source temporal identity in the plan', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));

    expect(plan).toMatchObject({
      projectId: source.projectId,
      sceneId: source.sceneId,
      stageId: source.stageId,
      operationId: source.metadata.operationId,
      snapshotId: source.metadata.snapshotId,
      canonicalSpecId: source.metadata.canonicalSpecId,
      temporalAuthority: source.temporalAuthority,
      snapshotKind: source.snapshotKind,
      stageOutcome: source.metadata.stageOutcome,
      temporalPoint: source.metadata.temporalPoint,
    });
  });
});

describe('validation finding mapping', () => {
  it.each<[
    VisualValidationFinding['code'],
    VisualCorrectionIssueCode,
    string | undefined,
  ]>([
    ['FUTURE_ELEMENT_LEAK', 'FUTURE_ELEMENT', 'component-c'],
    ['REQUIRED_ELEMENT_MISSING', 'MISSING_REQUIRED_ELEMENT', 'component-b'],
    ['CHARACTER_CONTINUITY', 'CHARACTER_MISMATCH', undefined],
    ['CLOTHING_CONTINUITY', 'CLOTHING_MISMATCH', undefined],
    ['ENVIRONMENT_CONTINUITY', 'ENVIRONMENT_MISMATCH', undefined],
    ['CONSTRUCTION_CONTINUITY', 'CONSTRUCTION_MISMATCH', undefined],
    ['MATERIAL_CONTINUITY', 'MATERIAL_MISMATCH', undefined],
    ['GEOMETRY_CONTINUITY', 'GEOMETRY_MISMATCH', undefined],
    ['PREVIOUS_OFFICIAL_CONTINUITY', 'CONTINUITY_BREAK', undefined],
  ])('maps %s to structured issue %s', (findingCode, issueCode, element) => {
    const source = request();
    const candidate = success(source);
    const validation = findingValidation(source, candidate, {
      code: findingCode,
      severity: 'FAIL',
      message: `reported ${findingCode}`,
      element,
    });
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));

    expect(plan.issues[0]).toMatchObject({
      code: issueCode,
      sourceFindingCode: findingCode,
      correctionHint: expect.any(String),
    });
  });
});

describe('corrected request identity and preservation', () => {
  it('creates a new immutable request without mutating the original', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const before = structuredClone(source);
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));
    const corrected = correctedRequest(source, plan);

    expect(source).toEqual(before);
    expect(corrected).not.toBe(source);
    expect(Object.isFrozen(corrected)).toBe(true);
  });

  it('creates a different requestId for corrected semantic content', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));
    const corrected = correctedRequest(source, plan);

    expect(corrected.requestId).not.toBe(source.requestId);
    expect(corrected.prompt).toContain('VISUAL CORRECTION LAYER');
    expect(corrected.prompt).toContain('remove future element component-c');
  });

  it('is deterministic for the same source and correction plan', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));

    expect(correctedRequest(source, plan)).toEqual(correctedRequest(source, plan));
  });

  it('preserves all temporal fields and official references', async () => {
    const recordA = await officialA();
    const { generation } = await generatedB1(recordA);
    const source = generation.finalRequest;
    const candidate = generation.generationResult;
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT', recordA);
    const plan = unwrapPlan(createVisualCorrectionPlan({
      request: source,
      candidate,
      validation,
      previousOfficialReference: recordA,
    }));
    const corrected = correctedRequest(source, plan);

    expect(corrected.references).toEqual(source.references);
    expect(corrected.references.map(reference => reference.asset.id)).toEqual([recordA.asset.id]);
    expect(corrected).toMatchObject({
      projectId: source.projectId,
      sceneId: source.sceneId,
      stageId: source.stageId,
      temporalAuthority: source.temporalAuthority,
      snapshotKind: source.snapshotKind,
      metadata: expect.objectContaining({
        canonicalSpecId: source.metadata.canonicalSpecId,
        snapshotId: source.metadata.snapshotId,
        operationId: source.metadata.operationId,
        stageOutcome: source.metadata.stageOutcome,
      }),
    });
  });

  it('never adds the failed candidate as an official reference', async () => {
    const recordA = await officialA();
    const { generation } = await generatedB1(recordA);
    const validation = await scenarioValidation(
      generation.finalRequest,
      generation.generationResult,
      'FUTURE_ELEMENT',
      recordA,
    );
    const plan = unwrapPlan(createVisualCorrectionPlan({
      request: generation.finalRequest,
      candidate: generation.generationResult,
      validation,
      previousOfficialReference: recordA,
    }));
    const corrected = correctedRequest(generation.finalRequest, plan);
    const failedAssetId = generation.generationResult.status === 'SUCCESS'
      ? generation.generationResult.asset.id
      : '';

    expect(corrected.references.map(reference => reference.asset.id)).toEqual([recordA.asset.id]);
    expect(corrected.references.some(reference => reference.asset.id === failedAssetId)).toBe(false);
  });

  it('blocks applying a project B plan to project A', async () => {
    const sourceB = request({ projectId: 'project-b' });
    const candidate = success(sourceB);
    const validation = await scenarioValidation(sourceB, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: sourceB, candidate, validation }));

    expect(createCorrectedImageGenerationRequest(request({ projectId: 'project-a' }), plan)).toMatchObject({
      status: 'FAILURE',
      errorCode: 'PLAN_REQUEST_MISMATCH',
    });
  });

  it('blocks applying a stage B plan to stage C', async () => {
    const sourceB = request({ label: 'b', stageId: 'stage-b' });
    const candidate = success(sourceB);
    const validation = await scenarioValidation(sourceB, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: sourceB, candidate, validation }));

    expect(createCorrectedImageGenerationRequest(
      request({ label: 'c', stageId: 'stage-c' }),
      plan,
    )).toMatchObject({ status: 'FAILURE', errorCode: 'PLAN_REQUEST_MISMATCH' });
  });

  it('refuses blind regeneration for an insufficient-evidence-only plan', () => {
    const source = request();
    const candidate = success(source);
    const validation = findingValidation(source, candidate, {
      code: 'INSUFFICIENT_EVIDENCE',
      severity: 'WARN',
      message: 'Evidence is insufficient.',
    }, 'WARN');
    const plan = unwrapPlan(createVisualCorrectionPlan({
      request: source,
      candidate,
      validation,
      retryWarn: true,
    }));

    expect(createCorrectedImageGenerationRequest(source, plan)).toMatchObject({
      status: 'FAILURE',
      errorCode: 'REVALIDATION_REQUIRED',
    });
  });
});

describe('retry policy and attempt limits', () => {
  it('does not retry PASS', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'COHERENT');
    expect(evaluateVisualRetryEligibility({ request: source, validation, maxAttempts: 3 })).toMatchObject({
      decision: 'NO_RETRY', retry: false, reason: 'PASS_NO_RETRY',
    });
  });

  it('allows FAIL retry below the configured limit', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    expect(evaluateVisualRetryEligibility({ request: source, validation, maxAttempts: 3 })).toMatchObject({
      decision: 'RETRY', retry: true, currentAttempt: 1, nextAttempt: 2,
    });
  });

  it('rejects retry eligibility when validation rewrites temporal identity', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const rewritten: typeof validation = { ...validation, temporalPoint: 'BEFORE' };

    expect(evaluateVisualRetryEligibility({
      request: source,
      validation: rewritten,
      maxAttempts: 3,
    })).toMatchObject({ decision: 'INVALID_BINDING', retry: false });
  });

  it('makes WARN depend on explicit caller policy', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'MINOR_DIVERGENCE');
    expect(evaluateVisualRetryEligibility({ request: source, validation, maxAttempts: 3 })).toMatchObject({
      decision: 'NO_RETRY', retry: false,
    });
    expect(evaluateVisualRetryEligibility({
      request: source, validation, maxAttempts: 3, retryWarn: true,
    })).toMatchObject({ decision: 'RETRY', retry: true });
  });

  it('recommends revalidation instead of blind retry for insufficient evidence', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'INSUFFICIENT');
    expect(evaluateVisualRetryEligibility({
      request: source, validation, maxAttempts: 3, retryWarn: true,
    })).toMatchObject({ decision: 'REVALIDATE', retry: false });
  });

  it('respects an explicit maxAttempts of one', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    expect(evaluateVisualRetryEligibility({ request: source, validation, maxAttempts: 1 })).toMatchObject({
      decision: 'RETRY_EXHAUSTED', retry: false, currentAttempt: 1,
    });
  });

  it('returns RETRY_EXHAUSTED at the corrected request limit', async () => {
    const source = request();
    const candidate = success(source);
    const firstValidation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation: firstValidation }));
    const second = correctedRequest(source, plan);
    const secondCandidate = success(second);
    const secondValidation = await scenarioValidation(second, secondCandidate, 'FUTURE_ELEMENT');

    expect(getImageGenerationAttemptNumber(second)).toBe(2);
    expect(evaluateVisualRetryEligibility({
      request: second, validation: secondValidation, maxAttempts: 2,
    })).toMatchObject({ decision: 'RETRY_EXHAUSTED', retry: false, currentAttempt: 2 });
  });
});

describe('integrated correction continuity', () => {
  it('runs B1 FAIL -> B2 PASS and makes C reference only official B2', async () => {
    const recordA = await officialA();
    const { memoryA, generation: b1 } = await generatedB1(recordA);
    const validationB1 = await scenarioValidation(
      b1.finalRequest, b1.generationResult, 'FUTURE_ELEMENT', recordA,
    );
    expect(evaluateVisualRetryEligibility({
      request: b1.finalRequest, validation: validationB1, maxAttempts: 3,
    }).retry).toBe(true);
    const planB1 = unwrapPlan(createVisualCorrectionPlan({
      request: b1.finalRequest,
      candidate: b1.generationResult,
      validation: validationB1,
      previousOfficialReference: recordA,
    }));
    const requestB2 = correctedRequest(b1.finalRequest, planB1);
    const resultB2 = await createDeterministicMockImageProvider().generate(requestB2);
    const validationB2 = await scenarioValidation(requestB2, resultB2, 'COHERENT', recordA);

    expect(validationB1.verdict).toBe('FAIL');
    expect(validationB2.verdict).toBe('PASS');
    expect(requestB2.requestId).not.toBe(b1.finalRequest.requestId);
    expect(requestB2.references.map(reference => reference.asset.id)).toEqual([recordA.asset.id]);
    expect(memoryA.records).toHaveLength(1);
    expect(evaluateVisualApprovalEligibility({ validation: validationB2 }).eligible).toBe(true);

    const recordB2 = approveGeneratedImageAsOfficial({
      request: requestB2,
      result: resultB2,
      providerKind: 'MOCK',
      approval: { approved: true, recordedAt: 200, role: 'PREVIOUS_OFFICIAL' },
    });
    const memoryAB2 = memoryA.append(recordB2);
    const c = await mockFlow(memoryAB2).generate(request({ label: 'c', sceneOrder: 2 }));
    const b1Asset = b1.generationResult.status === 'SUCCESS' ? b1.generationResult.asset.id : '';

    expect(c.selectedReference?.asset.id).toBe(recordB2.asset.id);
    expect(c.selectedReference?.asset.id).not.toBe(b1Asset);
    expect(memoryAB2.records.map(record => record.asset.id)).toEqual([recordA.asset.id, recordB2.asset.id]);
    expect(memoryAB2.records.some(record => record.asset.id === b1Asset)).toBe(false);
  });

  it('runs B1 FAIL -> B2 FAIL -> B3 PASS with only B3 becoming official', async () => {
    const recordA = await officialA();
    const { memoryA, generation: b1 } = await generatedB1(recordA);
    const validationB1 = await scenarioValidation(
      b1.finalRequest, b1.generationResult, 'FUTURE_ELEMENT', recordA,
    );
    const requestB2 = correctedRequest(
      b1.finalRequest,
      unwrapPlan(createVisualCorrectionPlan({
        request: b1.finalRequest,
        candidate: b1.generationResult,
        validation: validationB1,
        previousOfficialReference: recordA,
      })),
    );
    const resultB2 = await createDeterministicMockImageProvider().generate(requestB2);
    const validationB2 = await scenarioValidation(requestB2, resultB2, 'MISSING_REQUIRED', recordA);
    const requestB3 = correctedRequest(
      requestB2,
      unwrapPlan(createVisualCorrectionPlan({
        request: requestB2,
        candidate: resultB2,
        validation: validationB2,
        previousOfficialReference: recordA,
      })),
    );
    const resultB3 = await createDeterministicMockImageProvider().generate(requestB3);
    const validationB3 = await scenarioValidation(requestB3, resultB3, 'COHERENT', recordA);

    expect([b1.finalRequest, requestB2, requestB3].map(getImageGenerationAttemptNumber)).toEqual([1, 2, 3]);
    expect(validationB1.verdict).toBe('FAIL');
    expect(validationB2.verdict).toBe('FAIL');
    expect(validationB3.verdict).toBe('PASS');
    expect(requestB2).toMatchObject({
      projectId: b1.finalRequest.projectId,
      sceneId: b1.finalRequest.sceneId,
      stageId: b1.finalRequest.stageId,
      snapshotKind: b1.finalRequest.snapshotKind,
    });
    expect(requestB3.metadata.canonicalSpecId).toBe(b1.finalRequest.metadata.canonicalSpecId);

    const recordB3 = approveGeneratedImageAsOfficial({
      request: requestB3,
      result: resultB3,
      providerKind: 'MOCK',
      approval: { approved: true, recordedAt: 300, role: 'PREVIOUS_OFFICIAL' },
    });
    const memoryAB3 = memoryA.append(recordB3);
    const failedIds = [b1.generationResult, resultB2]
      .filter((result): result is Extract<ImageGenerationResult, { status: 'SUCCESS' }> => result.status === 'SUCCESS')
      .map(result => result.asset.id);

    expect(memoryAB3.records.map(record => record.asset.id)).toEqual([recordA.asset.id, recordB3.asset.id]);
    expect(memoryAB3.records.some(record => failedIds.includes(record.asset.id))).toBe(false);
  });

  it('runs a corrected request through the real MANUAL provider without network', async () => {
    const source = request({ providerId: 'manual' });
    const ready = await createManualImageProvider().generate(source);
    const candidate = completeManualImageGeneration({
      request: source,
      manualReadyResult: ready,
      submission: {
        submissionId: 'manual-b1',
        requestId: source.requestId,
        asset: asset('manual-b1', 'IMPORTED'),
        submittedAt: 100,
      },
    });
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const requestB2 = correctedRequest(
      source,
      unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation })),
    );
    const next = await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(requestB2);

    expect(next).toMatchObject({ status: 'MANUAL_READY', requestId: requestB2.requestId });
  });

  it('keeps mock correction generation deterministic', async () => {
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const corrected = correctedRequest(
      source,
      unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation })),
    );
    const provider = createDeterministicMockImageProvider();
    expect(await provider.generate(corrected)).toEqual(await provider.generate(corrected));
  });

  it('does not auto-approve, mutate memory, WorldState, Stage or inputs', async () => {
    const memory = createVisualReferenceMemory();
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const before = structuredClone({ source, candidate, validation });
    const worldState = Object.freeze({ progress: 50, existingComponents: ['component-a'] });
    const stage = Object.freeze({ status: 'completed', decision: Object.freeze({ status: 'PASS' }) });
    const transaction = Object.freeze({ status: 'COMMITTED', worldState });
    const physicalBefore = structuredClone({ worldState, stage, transaction });
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));
    createCorrectedImageGenerationRequest(source, plan);

    expect({ source, candidate, validation }).toEqual(before);
    expect({ worldState, stage, transaction }).toEqual(physicalBefore);
    expect(memory.records).toEqual([]);
  });

  it('uses no network or API in planning, correction or retry policy', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const source = request();
    const candidate = success(source);
    const validation = await scenarioValidation(source, candidate, 'FUTURE_ELEMENT');
    const plan = unwrapPlan(createVisualCorrectionPlan({ request: source, candidate, validation }));
    createCorrectedImageGenerationRequest(source, plan);
    evaluateVisualRetryEligibility({ request: source, validation, maxAttempts: 3 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
