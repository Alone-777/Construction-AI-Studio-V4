import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileCanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-compiler';
import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import {
  completeManualImageGeneration,
  createImageGenerationRequest,
  createImageGenerationService,
  createManualImageProvider,
  type ImageGenerationRequest,
  type ImageGenerationResult,
} from '../image-generation';
import {
  approveGeneratedImageAsOfficial,
  createVisualContinuityImageService,
  createVisualReferenceMemory,
  type VisualReferenceMemory,
  type VisualReferenceRecord,
} from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import {
  createDeterministicMockVisualObservationProvider,
  createManualVisualObservationProvider,
  createVisualValidationRequest,
  deriveExpectedVisualFacts,
  evaluateVisualApprovalEligibility,
  validateVisualContinuity,
  type VisualObservation,
  type VisualValidationEvidence,
  type VisualValidationRequest,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

type StageLabel = 'a' | 'b' | 'c';

function snapshot(label: StageLabel, projectId = 'project-a'): VisualStateSnapshot {
  const order = { a: 0, b: 1, c: 2 }[label];
  const allComponents = ['component-a', 'component-b', 'component-c'];
  const present = allComponents.slice(0, order + 1);
  const future = allComponents.slice(order + 1);
  const target = `component-${label}`;
  return {
    id: `visual-state:${projectId}:scene-${label}:official:after`,
    kind: 'OFFICIAL',
    temporalPoint: 'AFTER',
    stageOutcome: 'COMMITTED',
    worldStateSource: 'CANDIDATE',
    identity: {
      projectId,
      visualDNAId: 'visual-dna-1',
      sceneId: `scene-${label}`,
      stageId: `stage-${label}`,
      operationId: `operation-${label}`,
      progress: (order + 1) * 25,
    },
    actor: {
      characterId: 'builder-1',
      visualIdentityId: 'builder-visual-1',
      name: 'Canonical Builder',
      appearance: 'same face and body',
      clothing: 'orange work jacket',
      zone: 'Z1',
      orientation: 'north',
      toolInUse: 'hammer',
    },
    action: {
      physicalActionIRId: `physical-action:${label}`,
      visibility: 'COMMITTED',
      primary: { type: 'INSTALL', verb: 'install', description: `install ${target}` },
      target: { id: target, label: target, elements: [target] },
      tools: ['hammer'],
      materials: ['wood'],
      expectedTargetStatus: 'COMPLETE',
    },
    construction: {
      type: 'cabin',
      status: 'in progress',
      progress: (order + 1) * 25,
      visibleComponents: present,
      completedComponents: present,
      partialComponents: [],
      targetState: 'COMPLETE',
      pendingComponents: future,
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8 - order, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [{ materialId: 'wood', quantity: order + 1, location: 'Z1' }],
    },
    space: {
      activeZone: 'Z1',
      stateZone: 'Z1',
      relevantZones: [{
        id: 'Z1',
        name: 'Work zone',
        type: 'AREA',
        orientation: 'north',
        bounds: { x: 0, y: 0, width: 30, height: 30 },
      }],
    },
    camera: {
      id: 'A',
      relativePosition: { x: 10, y: 20 },
      orientation: 30,
      conceptualHeight: 'media',
      framing: 'wide',
      allowedMovement: 'FIXA',
      visibleZones: ['Z1'],
      partiallyVisibleZones: [],
      hiddenZones: ['Z2'],
      viewpoint: {
        position: { x: 12, y: 18 },
        target: { x: 45, y: 40 },
        fov: 52,
        aspectRatio: 16 / 9,
        movement: 'FIXA',
      },
      lens: { focalLength: 35, aperture: 'f/8', focusDistance: 8, depthOfField: true },
    },
    environment: {
      preset: 'floresta_temperada',
      terrain: { type: 'flat', slope: 'none', vegetation: 'forest-edge', soil: 'dirt' },
      climate: 'clear',
      light: 'day',
      timeOfDay: 'day',
      weather: 'clear',
      permanentObjects: ['old-tree'],
      zoneVegetation: [{ zoneId: 'Z1', state: 'work-area' }],
    },
    continuity: {
      preserveActorIdentity: 'builder-1',
      preserveClothing: 'orange work jacket',
      preserveComponents: present,
      preserveZones: ['Z1'],
      preserveMaterialPlacements: ['wood@Z1'],
      preserveCameraId: 'A',
      requiredVisualElements: ['old-tree'],
      forbiddenVisualElements: [...future, 'modern-crane'],
      futureForbidden: future,
      terrainOutsideActiveZoneUnchanged: true,
    },
    evidence: {
      actionEvidence: [`${target} is visibly installed`],
      target: { id: target, status: 'COMPLETE' },
      completedComponents: present,
      partialComponents: [],
      materialQuantityChanges: [{ materialId: 'wood', before: 9 - order, after: 8 - order }],
    },
  };
}

function spec(label: StageLabel, projectId = 'project-a'): CanonicalImagePromptSpec {
  const compiled = compileCanonicalImagePromptSpec(snapshot(label, projectId));
  if (!compiled) throw new Error('Expected a canonical prompt spec.');
  return compiled;
}

function imageRequest(
  canonicalSpec: CanonicalImagePromptSpec,
  sceneOrder: number,
): ImageGenerationRequest {
  return createImageGenerationRequest({
    canonicalSpec,
    providerPrompt: {
      canonicalSpecId: canonicalSpec.id,
      prompt: `canonical prompt for ${canonicalSpec.identity.sceneId}`,
      negativePrompt: 'future components',
      mode: 'GENERATE',
      adapterId: 'test-adapter',
    },
    providerId: 'manual',
    mode: 'GENERATE',
    temporalPosition: { sceneOrder, stageOrder: 0 },
  });
}

function continuityFlow(memory: VisualReferenceMemory) {
  return createVisualContinuityImageService({
    visualReferenceMemory: memory,
    imageGenerationService: createImageGenerationService({
      providers: [createManualImageProvider()],
    }),
  });
}

async function generatedCandidate(
  memory: VisualReferenceMemory,
  label: StageLabel,
  projectId = 'project-a',
) {
  const canonicalSpec = spec(label, projectId);
  const baseRequest = imageRequest(canonicalSpec, { a: 0, b: 1, c: 2 }[label]);
  const generation = await continuityFlow(memory).generate(baseRequest);
  const completion = completeManualImageGeneration({
    request: generation.finalRequest,
    manualReadyResult: generation.generationResult,
    submission: {
      submissionId: `submission-${projectId}-${label}`,
      requestId: generation.finalRequest.requestId,
      asset: {
        id: `asset-${projectId}-${label}`,
        source: 'IMPORTED',
        uri: `local://visual/${projectId}/${label}`,
        mimeType: 'image/png',
      },
      submittedAt: 100 + { a: 0, b: 1, c: 2 }[label],
    },
  });
  if (completion.status !== 'SUCCESS') throw new Error('Expected completed manual image.');
  const validationRequest = createVisualValidationRequest({
    request: generation.finalRequest,
    result: completion,
    canonicalSpec,
    previousOfficialReference: generation.selectedReference,
  });
  return { canonicalSpec, generation, completion, validationRequest };
}

function coherentObservation(request: VisualValidationRequest): VisualObservation {
  return {
    coverage: 'SUFFICIENT',
    detectedElements: [...request.expected.requiredElements],
    missingElements: [],
    unexpectedElements: [],
    characterConsistency: 'MATCH',
    clothingConsistency: 'MATCH',
    environmentConsistency: 'MATCH',
    constructionConsistency: 'MATCH',
    materialConsistency: 'MATCH',
    geometryConsistency: 'MATCH',
    previousOfficialContinuity: request.previousOfficialReference ? 'MATCH' : 'NOT_APPLICABLE',
    temporalAnomalies: [],
    notes: ['Explicit structured observation; no pixel analysis performed.'],
    confidence: 0.9,
  };
}

async function manualEvidence(
  request: VisualValidationRequest,
  overrides: Partial<VisualObservation> = {},
): Promise<VisualValidationEvidence> {
  return createManualVisualObservationProvider({
    evidenceId: `manual-evidence:${request.validationId}`,
    observedAt: 500,
    observation: { ...coherentObservation(request), ...overrides },
  }).observe(request);
}

function approveCandidate(
  request: ImageGenerationRequest,
  result: ImageGenerationResult,
  recordedAt: number,
): VisualReferenceRecord {
  return approveGeneratedImageAsOfficial({
    request,
    result,
    providerKind: 'MANUAL',
    approval: { approved: true, recordedAt, role: 'PREVIOUS_OFFICIAL' },
  });
}

describe('visual validation request and evidence contracts', () => {
  it('derives small expected facts from the canonical prompt authority', () => {
    const canonicalSpec = spec('b');
    const expected = deriveExpectedVisualFacts(canonicalSpec);

    expect(expected.requiredElements).toEqual(['component-a', 'component-b']);
    expect(expected.forbiddenFutureElements).toEqual(['component-c']);
    expect(expected.expectedCharacter.characterId).toBe('builder-1');
    expect(expected.expectedClothing).toBe('orange work jacket');
    expect(expected.expectedMaterials).toEqual(['wood']);
    expect(expected.expectedTools).toEqual(['hammer']);
  });

  it('builds validation identity from request/spec without reading final project state', async () => {
    const candidate = await generatedCandidate(createVisualReferenceMemory(), 'a');

    expect(candidate.validationRequest).toMatchObject({
      projectId: 'project-a',
      sceneId: 'scene-a',
      stageId: 'stage-a',
      operationId: 'operation-a',
      requestId: candidate.generation.finalRequest.requestId,
      snapshotId: candidate.canonicalSpec.identity.snapshotId,
      canonicalSpecId: candidate.canonicalSpec.id,
      temporalAuthority: 'OFFICIAL',
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
    });
  });

  it('rejects a canonical spec whose temporal identity differs from the request', async () => {
    const candidate = await generatedCandidate(createVisualReferenceMemory(), 'a');

    expect(() => createVisualValidationRequest({
      request: candidate.generation.finalRequest,
      result: candidate.completion,
      canonicalSpec: spec('b'),
    })).toThrow('identity does not match');
  });

  it('keeps the first image valid without inventing a previous reference', async () => {
    const candidate = await generatedCandidate(createVisualReferenceMemory(), 'a');
    expect(candidate.validationRequest.previousOfficialReference).toBeUndefined();
  });
});

describe('VisualContinuityValidator verdicts and binding', () => {
  it('returns PASS for sufficient coherent manual evidence', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const result = validateVisualContinuity(validationRequest, await manualEvidence(validationRequest));

    expect(result.verdict).toBe('PASS');
    expect(result.findings).toEqual([]);
  });

  it('returns PASS for the deterministic coherent mock scenario', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const provider = createDeterministicMockVisualObservationProvider('COHERENT');
    const result = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));
    expect(result.verdict).toBe('PASS');
  });

  it('fails when evidence contains a forbidden future element', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'b');
    const provider = createDeterministicMockVisualObservationProvider('FUTURE_ELEMENT');
    const result = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));

    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'FUTURE_ELEMENT_LEAK',
      element: 'component-c',
    }));
  });

  it('fails when a required current element is missing', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'b');
    const provider = createDeterministicMockVisualObservationProvider('MISSING_REQUIRED');
    const result = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));

    expect(result.verdict).toBe('FAIL');
    expect(result.findings.some(finding => finding.code === 'REQUIRED_ELEMENT_MISSING')).toBe(true);
  });

  it('returns WARN for a minor non-critical divergence', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const provider = createDeterministicMockVisualObservationProvider('MINOR_DIVERGENCE');
    const result = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));

    expect(result.verdict).toBe('WARN');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ENVIRONMENT_CONTINUITY',
      severity: 'WARN',
    }));
  });

  it('never passes insufficient evidence automatically', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const provider = createDeterministicMockVisualObservationProvider('INSUFFICIENT');
    const result = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));

    expect(result.verdict).toBe('WARN');
    expect(result.findings.some(finding => finding.code === 'INSUFFICIENT_EVIDENCE')).toBe(true);
  });

  it('fails before evaluation when evidence belongs to another request', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const evidence = await manualEvidence(validationRequest);
    const result = validateVisualContinuity(validationRequest, {
      ...evidence,
      requestId: 'another-request',
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toEqual([expect.objectContaining({ code: 'EVIDENCE_REQUEST_MISMATCH' })]);
  });

  it('fails before evaluation when evidence belongs to another asset', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const evidence = await manualEvidence(validationRequest);
    const result = validateVisualContinuity(validationRequest, {
      ...evidence,
      assetId: 'another-asset',
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toEqual([expect.objectContaining({ code: 'EVIDENCE_ASSET_MISMATCH' })]);
  });

  it('fails before evaluation when evidence uses another validation id', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const evidence = await manualEvidence(validationRequest);
    const result = validateVisualContinuity(validationRequest, {
      ...evidence,
      validationId: 'another-validation',
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('uses previous official continuity evidence when a reference exists', async () => {
    const first = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const recordA = approveCandidate(first.generation.finalRequest, first.completion, 100);
    const second = await generatedCandidate(createVisualReferenceMemory([recordA]), 'b');
    const evidence = await manualEvidence(second.validationRequest, {
      previousOfficialContinuity: 'MAJOR_DIVERGENCE',
    });
    const result = validateVisualContinuity(second.validationRequest, evidence);

    expect(second.validationRequest.previousOfficialReference?.recordId).toBe(recordA.id);
    expect(result.verdict).toBe('FAIL');
    expect(result.findings.some(finding => finding.code === 'PREVIOUS_OFFICIAL_CONTINUITY')).toBe(true);
  });

  it('copies temporal identity only from the validation request', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const evidence = {
      ...await manualEvidence(validationRequest),
      projectId: 'forged-project',
      stageOutcome: 'REJECTED',
      snapshotKind: 'CANDIDATE',
    } as VisualValidationEvidence & Record<string, unknown>;
    const result = validateVisualContinuity(validationRequest, evidence);

    expect(result).toMatchObject({
      projectId: validationRequest.projectId,
      sceneId: validationRequest.sceneId,
      stageId: validationRequest.stageId,
      operationId: validationRequest.operationId,
      snapshotId: validationRequest.snapshotId,
      canonicalSpecId: validationRequest.canonicalSpecId,
      temporalAuthority: 'OFFICIAL',
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
    });
  });
});

describe('visual approval eligibility policy', () => {
  it('makes PASS eligible for later explicit approval', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const validation = validateVisualContinuity(validationRequest, await manualEvidence(validationRequest));
    expect(evaluateVisualApprovalEligibility({ validation })).toEqual({
      eligible: true,
      requiresAcknowledgement: false,
      reason: 'PASS',
    });
  });

  it('never makes FAIL eligible', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'b');
    const provider = createDeterministicMockVisualObservationProvider('FUTURE_ELEMENT');
    const validation = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));
    expect(evaluateVisualApprovalEligibility({ validation }).eligible).toBe(false);
  });

  it('never makes candidate or non-committed validation eligible', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const pass = validateVisualContinuity(validationRequest, await manualEvidence(validationRequest));
    const candidate = {
      ...pass,
      temporalAuthority: 'CANDIDATE',
      snapshotKind: 'CANDIDATE',
      stageOutcome: 'REJECTED',
    } as typeof pass;

    expect(evaluateVisualApprovalEligibility({ validation: candidate })).toEqual({
      eligible: false,
      requiresAcknowledgement: false,
      reason: 'TEMPORAL_INELIGIBLE',
    });
  });

  it('requires explicit acknowledgement for WARN', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const provider = createDeterministicMockVisualObservationProvider('MINOR_DIVERGENCE');
    const validation = validateVisualContinuity(validationRequest, await provider.observe(validationRequest));

    expect(evaluateVisualApprovalEligibility({ validation })).toMatchObject({
      eligible: false,
      requiresAcknowledgement: true,
    });
    expect(evaluateVisualApprovalEligibility({ validation, warnAcknowledged: true })).toMatchObject({
      eligible: true,
      reason: 'WARN_ACKNOWLEDGED',
    });
  });

  it('does not auto-approve or mutate visual memory', async () => {
    const memory = createVisualReferenceMemory();
    const { validationRequest } = await generatedCandidate(memory, 'a');
    const validation = validateVisualContinuity(validationRequest, await manualEvidence(validationRequest));

    expect(evaluateVisualApprovalEligibility({ validation }).eligible).toBe(true);
    expect(memory.records).toEqual([]);
  });
});

describe('immutability, offline providers and determinism', () => {
  it('does not mutate validation request, evidence, canonical spec or candidate asset', async () => {
    const candidate = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const evidence = await manualEvidence(candidate.validationRequest);
    const before = structuredClone({
      request: candidate.validationRequest,
      evidence,
      spec: candidate.canonicalSpec,
      asset: candidate.completion.asset,
    });

    validateVisualContinuity(candidate.validationRequest, evidence);
    expect({
      request: candidate.validationRequest,
      evidence,
      spec: candidate.canonicalSpec,
      asset: candidate.completion.asset,
    }).toEqual(before);
  });

  it('does not mutate WorldState, Stage or transaction evidence', async () => {
    const candidate = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const officialState = Object.freeze({ progress: 25, existingComponents: ['component-a'] });
    const stage = Object.freeze({ status: 'completed', decision: Object.freeze({ status: 'PASS' }) });
    const transaction = Object.freeze({ status: 'COMMITTED', state: officialState });
    const before = structuredClone({ officialState, stage, transaction });

    validateVisualContinuity(
      candidate.validationRequest,
      await manualEvidence(candidate.validationRequest),
    );
    expect({ officialState, stage, transaction }).toEqual(before);
  });

  it('manual observation and validation work fully offline', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const validation = validateVisualContinuity(
      validationRequest,
      await manualEvidence(validationRequest),
    );

    expect(validation.verdict).toBe('PASS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mock evidence and validation are deterministic', async () => {
    const { validationRequest } = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const provider = createDeterministicMockVisualObservationProvider('COHERENT');
    const firstEvidence = await provider.observe(validationRequest);
    const secondEvidence = await provider.observe(validationRequest);

    expect(firstEvidence).toEqual(secondEvidence);
    expect(validateVisualContinuity(validationRequest, firstEvidence)).toEqual(
      validateVisualContinuity(validationRequest, secondEvidence),
    );
  });
});

describe('validated manual continuity integration', () => {
  it('places validation between SUCCESS and explicit approval in the A -> B -> C cycle', async () => {
    const emptyMemory = createVisualReferenceMemory();
    const a = await generatedCandidate(emptyMemory, 'a');
    const validationA = validateVisualContinuity(
      a.validationRequest,
      await manualEvidence(a.validationRequest),
    );
    expect(validationA.verdict).toBe('PASS');
    expect(emptyMemory.records).toHaveLength(0);
    expect(evaluateVisualApprovalEligibility({ validation: validationA }).eligible).toBe(true);
    const recordA = approveCandidate(a.generation.finalRequest, a.completion, 100);
    const memoryA = emptyMemory.append(recordA);

    const b = await generatedCandidate(memoryA, 'b');
    expect(b.generation.selectedReference?.asset.id).toBe('asset-project-a-a');
    const validationB = validateVisualContinuity(
      b.validationRequest,
      await manualEvidence(b.validationRequest),
    );
    expect(validationB.verdict).toBe('PASS');
    expect(evaluateVisualApprovalEligibility({ validation: validationB }).eligible).toBe(true);
    const recordB = approveCandidate(b.generation.finalRequest, b.completion, 200);
    const memoryAB = memoryA.append(recordB);

    const c = await generatedCandidate(memoryAB, 'c');
    expect(c.generation.selectedReference?.asset.id).toBe('asset-project-a-b');
    expect(c.validationRequest.previousOfficialReference?.recordId).toBe(recordB.id);
    expect(emptyMemory.records).toHaveLength(0);
    expect(memoryA.records.map(record => record.asset.id)).toEqual(['asset-project-a-a']);
    expect(memoryAB.records.map(record => record.asset.id)).toEqual([
      'asset-project-a-a',
      'asset-project-a-b',
    ]);
  });

  it('keeps an invalid B with future C out of official memory', async () => {
    const a = await generatedCandidate(createVisualReferenceMemory(), 'a');
    const validationA = validateVisualContinuity(
      a.validationRequest,
      await manualEvidence(a.validationRequest),
    );
    if (!evaluateVisualApprovalEligibility({ validation: validationA }).eligible) {
      throw new Error('Expected A to be eligible.');
    }
    const memoryA = createVisualReferenceMemory([
      approveCandidate(a.generation.finalRequest, a.completion, 100),
    ]);

    const b = await generatedCandidate(memoryA, 'b');
    const provider = createDeterministicMockVisualObservationProvider('FUTURE_ELEMENT');
    const validationB = validateVisualContinuity(
      b.validationRequest,
      await provider.observe(b.validationRequest),
    );

    expect(validationB.verdict).toBe('FAIL');
    expect(evaluateVisualApprovalEligibility({ validation: validationB }).eligible).toBe(false);
    expect(memoryA.records.map(record => record.asset.id)).toEqual(['asset-project-a-a']);
    expect(memoryA.records.some(record => record.asset.id === 'asset-project-a-b')).toBe(false);
  });
});
