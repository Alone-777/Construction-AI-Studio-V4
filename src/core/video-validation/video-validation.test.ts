import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhysicalActionIR } from '../actions/physical-action-ir';
import { createDeterministicMockImageProvider, type ImageGenerationRequest } from '../image-generation';
import { approveGeneratedImageAsOfficial, createVisualReferenceMemory } from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import {
  completeManualVideoGeneration,
  createCanonicalAnimationPromptSpec,
  createManualVideoProvider,
  createVideoGenerationRequest,
  createVideoGenerationService,
  withVideoGenerationPrompt,
  type ManualVideoSubmission,
  type VideoGenerationRequest,
  type VideoGenerationResult,
} from '../video-generation';
import {
  createCorrectedVideoGenerationRequest,
  createDeterministicMockVideoObservationProvider,
  createManualVideoObservationProvider,
  createVideoCorrectionPlan,
  createVideoValidationRequest,
  deriveExpectedVideoFacts,
  evaluateVideoApprovalEligibility,
  evaluateVideoRetryEligibility,
  getVideoGenerationAttemptNumber,
  validateVideoContinuity,
  type MockVideoObservationScenario,
  type VideoObservation,
  type VideoValidationEvidence,
  type VideoValidationRequest,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

type Label = 'a' | 'b';

function snapshot(label: Label, projectId = 'project-a'): VisualStateSnapshot {
  const index = label === 'a' ? 0 : 1;
  const target = `component-${label}`;
  const completed = label === 'a'
    ? ['foundation', 'component-a']
    : ['foundation', 'component-a', 'component-b'];
  const future = label === 'a' ? ['component-b', 'component-roof'] : ['component-roof'];
  return {
    id: `snapshot-${projectId}-${label}`,
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
      progress: (index + 1) * 25,
    },
    actor: {
      characterId: 'builder-1', visualIdentityId: 'builder-visual-1',
      name: 'Canonical Builder', appearance: 'same face and body',
      clothing: 'orange work jacket', zone: 'Z1', orientation: 'north', toolInUse: 'hammer',
    },
    action: {
      physicalActionIRId: `physical-action:${label}`,
      visibility: 'COMMITTED',
      primary: { type: 'INSTALL', verb: 'install', description: `install ${target}` },
      target: { id: target, label: target, elements: [target] },
      tools: ['hammer'], materials: ['wood'], expectedTargetStatus: 'COMPLETE',
    },
    construction: {
      type: 'cabin', status: 'in progress', progress: (index + 1) * 25,
      visibleComponents: completed, completedComponents: completed, partialComponents: [],
      activeComponent: target, targetState: 'COMPLETE', pendingComponents: future,
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8 - index, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [{ materialId: 'wood', quantity: index + 1, location: 'Z1' }],
    },
    space: {
      activeZone: 'Z1', stateZone: 'Z1',
      relevantZones: [{
        id: 'Z1', name: 'Work zone', type: 'AREA', orientation: 'north',
        bounds: { x: 0, y: 0, width: 30, height: 30 },
      }],
    },
    camera: {
      id: 'A', relativePosition: { x: 10, y: 20 }, orientation: 30,
      conceptualHeight: 'media', framing: 'wide', allowedMovement: 'FIXA',
      visibleZones: ['Z1'], partiallyVisibleZones: [], hiddenZones: ['Z2'],
      viewpoint: {
        position: { x: 12, y: 18 }, target: { x: 45, y: 40 },
        fov: 52, aspectRatio: 16 / 9, movement: 'FIXA',
      },
      lens: { focalLength: 35, aperture: 'f/8', focusDistance: 8, depthOfField: true },
    },
    environment: {
      preset: 'floresta_temperada',
      terrain: { type: 'flat', slope: 'none', vegetation: 'forest-edge', soil: 'dirt' },
      climate: 'clear', light: 'day', timeOfDay: 'day', weather: 'clear',
      permanentObjects: ['old-tree'], zoneVegetation: [{ zoneId: 'Z1', state: 'work-area' }],
    },
    continuity: {
      preserveActorIdentity: 'builder-1', preserveClothing: 'orange work jacket',
      preserveComponents: completed, preserveZones: ['Z1'], preserveMaterialPlacements: ['wood@Z1'],
      preserveCameraId: 'A', requiredVisualElements: ['old-tree'],
      forbiddenVisualElements: [...future, 'modern-crane'], futureForbidden: future,
      terrainOutsideActiveZoneUnchanged: true,
    },
    evidence: {
      actionEvidence: [`${target} is visibly installed`],
      target: { id: target, status: 'COMPLETE' }, completedComponents: completed,
      partialComponents: [],
      materialQuantityChanges: [{ materialId: 'wood', before: 9 - index, after: 8 - index }],
    },
  };
}

function physicalAction(label: Label): PhysicalActionIR {
  const target = `component-${label}`;
  const index = label === 'a' ? 0 : 1;
  return {
    id: `physical-action:${label}`,
    sceneId: `scene-${label}`,
    stageId: `stage-${label}`,
    operationId: `operation-${label}`,
    primaryAction: { type: 'INSTALL', verb: 'install', description: `install ${target}` },
    actor: { characterId: 'builder-1' },
    target: { id: target, label: target, elements: [target] },
    zone: 'Z1', tools: ['hammer'], materials: ['wood'],
    preconditions: [`target ${target} is partial`],
    expectedEffects: {
      constructionProgress: { before: index * 25, after: (index + 1) * 25 },
      targetStatus: { before: 'PARTIAL', after: 'COMPLETE' },
      actorZone: { before: 'Z1', after: 'Z1' },
      materialQuantityChanges: [{ materialId: 'wood', before: 9 - index, after: 8 - index }],
      newlyCompletedComponents: [target], newlyPartialComponents: [],
    },
    before: {
      targetStatus: 'PARTIAL', constructionProgress: index * 25,
      actorZone: 'Z1', materialQuantities: { wood: 9 - index },
    },
    after: {
      targetStatus: 'COMPLETE', constructionProgress: (index + 1) * 25,
      actorZone: 'Z1', materialQuantities: { wood: 8 - index },
    },
    constraints: {
      preserveActorId: 'builder-1', allowedZone: 'Z1',
      preserveComponents: label === 'a' ? ['foundation'] : ['foundation', 'component-a'],
      preserveZones: ['Z1'], forbiddenFutureComponents: ['component-roof'],
      preventPrematureElements: label === 'a' ? ['component-b'] : [],
    },
    evidence: [`${target} reaches complete status`],
  };
}

function imageRequest(state: VisualStateSnapshot): ImageGenerationRequest {
  return {
    requestId: `image-request:${state.identity.projectId}:${state.identity.stageId}`,
    projectId: state.identity.projectId,
    sceneId: state.identity.sceneId,
    stageId: state.identity.stageId,
    providerId: 'mock', mode: 'GENERATE', prompt: `image ${state.identity.stageId}`,
    temporalAuthority: 'OFFICIAL', snapshotKind: 'OFFICIAL', references: [],
    aspectRatio: state.camera.viewpoint.aspectRatio,
    metadata: {
      canonicalSpecId: `canonical-image:${state.id}`,
      snapshotId: state.id,
      operationId: state.identity.operationId,
      temporalPoint: state.temporalPoint,
      stageOutcome: state.stageOutcome,
      worldStateSource: state.worldStateSource,
      temporalPosition: { sceneOrder: labelOrder(state.identity.stageId), stageOrder: 0 },
    },
  };
}

function labelOrder(stageId: string): number {
  return stageId === 'stage-a' ? 0 : 1;
}

async function videoFixture(label: Label = 'a', projectId = 'project-a') {
  const state = snapshot(label, projectId);
  const action = physicalAction(label);
  const imageGenerationRequest = imageRequest(state);
  const imageResult = await createDeterministicMockImageProvider().generate(imageGenerationRequest);
  const reference = approveGeneratedImageAsOfficial({
    request: imageGenerationRequest,
    result: imageResult,
    providerKind: 'MOCK',
    approval: { approved: true, recordedAt: label === 'a' ? 100 : 200 },
  });
  const animation = createCanonicalAnimationPromptSpec({
    physicalAction: action,
    snapshot: state,
    source: reference,
    output: { durationSeconds: 8, resolution: { width: 1280, height: 720 } },
  });
  if (animation.status !== 'SUCCESS') throw new Error(animation.message);
  const request = createVideoGenerationRequest({
    providerId: 'manual-video',
    canonicalAnimationSpec: animation.spec,
    source: animation.source,
  });
  const candidate = await completeRequest(request, `video-${label}-attempt-1`);
  return { state, action, reference, request, candidate };
}

async function completeRequest(
  request: VideoGenerationRequest,
  assetId: string,
): Promise<Extract<VideoGenerationResult, { status: 'SUCCESS' }>> {
  const manualReady = await createVideoGenerationService({
    providers: [createManualVideoProvider(request.providerId)],
  }).generate(request);
  if (manualReady.status !== 'MANUAL_READY') throw new Error('Expected MANUAL_READY.');
  const submission: ManualVideoSubmission = {
    submissionId: `submission:${assetId}`,
    requestId: request.requestId,
    asset: {
      id: assetId,
      source: 'IMPORTED',
      uri: `file:///videos/${assetId}.mp4`,
      mimeType: 'video/mp4',
      durationSeconds: request.durationSeconds,
    },
    submittedAt: 100,
  };
  const completed = completeManualVideoGeneration({ request, manualReadyResult: manualReady, submission });
  if (completed.status !== 'SUCCESS') throw new Error(`Expected SUCCESS, received ${completed.status}.`);
  return completed;
}

async function validationFixture(
  scenario: MockVideoObservationScenario = 'COHERENT',
  label: Label = 'a',
  projectId = 'project-a',
) {
  const video = await videoFixture(label, projectId);
  const validationRequest = createVideoValidationRequest({
    request: video.request,
    result: video.candidate,
  });
  const observer = createDeterministicMockVideoObservationProvider(scenario);
  const evidence = await observer.observe(validationRequest);
  const validation = validateVideoContinuity(validationRequest, evidence);
  return { ...video, validationRequest, observer, evidence, validation };
}

async function coherentObservation(request: VideoValidationRequest): Promise<VideoObservation> {
  const evidence = await createDeterministicMockVideoObservationProvider('COHERENT').observe(request);
  const {
    evidenceId: _evidenceId,
    validationId: _validationId,
    videoRequestId: _videoRequestId,
    videoAssetId: _videoAssetId,
    source: _source,
    observedAt: _observedAt,
    ...observation
  } = evidence;
  return observation;
}

describe('video validation request and expected facts', () => {
  it('derives compact canonical motion, continuity, camera and output facts', async () => {
    const value = await videoFixture();
    const request = createVideoValidationRequest({ request: value.request, result: value.candidate });
    expect(request).toMatchObject({
      projectId: 'project-a', sceneId: 'scene-a', stageId: 'stage-a',
      operationId: 'operation-a', snapshotId: value.state.id,
      videoRequestId: value.request.requestId,
      videoAsset: { id: value.candidate.asset.id },
      sourceImageAssetId: value.reference.asset.id,
      physicalActionIRId: value.action.id,
      canonicalAnimationSpecId: value.request.canonicalAnimationSpec.id,
      temporalAuthority: 'OFFICIAL', snapshotKind: 'OFFICIAL', stageOutcome: 'COMMITTED',
      expectedMotionFacts: {
        requiredPrimaryAction: { description: value.action.primaryAction.description },
        forbiddenFutureActions: expect.arrayContaining(['component-b', 'component-roof']),
      },
    });
    expect(Object.keys(deriveExpectedVideoFacts(value.request.canonicalAnimationSpec))).toEqual([
      'motion', 'continuity', 'camera', 'output',
    ]);
  });

  it('rejects non-success, reviewed, request-mismatched and asset-invalid candidates', async () => {
    const value = await videoFixture();
    const invalidResults: VideoGenerationResult[] = [
      {
        status: 'FAILURE', requestId: value.request.requestId, providerId: value.request.providerId,
        errorCode: 'FAILED', message: 'failed', retryable: false,
      },
      { ...structuredClone(value.candidate), requestId: 'other-request' },
      { ...structuredClone(value.candidate), asset: { ...value.candidate.asset, id: '' } },
      { ...structuredClone(value.candidate), outputStatus: 'APPROVED' } as unknown as VideoGenerationResult,
    ];
    for (const result of invalidResults) {
      expect(() => createVideoValidationRequest({ request: value.request, result })).toThrow();
    }
  });

  it('rejects a re-hashed derived prompt without valid correction metadata', async () => {
    const value = await videoFixture();
    const invalid = withVideoGenerationPrompt(
      value.request,
      `${value.request.renderedPrompt}\n\nUNBOUND PROMPT LAYER`,
    );
    expect(() => createVideoValidationRequest({ request: invalid, result: {
      ...structuredClone(value.candidate), requestId: invalid.requestId,
    } })).toThrow('canonical request');
  });
});

describe('video continuity validator', () => {
  it('returns PASS for sufficient evidence of the correct motion', async () => {
    const value = await validationFixture('COHERENT');
    expect(value.validation).toMatchObject({
      verdict: 'PASS', videoRequestId: value.request.requestId,
      videoAssetId: value.candidate.asset.id, findings: [],
    });
  });

  it('supports explicit MANUAL structured evidence without watching video', async () => {
    const value = await videoFixture();
    const request = createVideoValidationRequest({ request: value.request, result: value.candidate });
    const provider = createManualVideoObservationProvider({
      evidenceId: 'manual-evidence-a',
      observedAt: 123,
      observation: await coherentObservation(request),
    });
    const validation = validateVideoContinuity(request, await provider.observe(request));
    expect(validation).toMatchObject({
      verdict: 'PASS', evidenceSource: { providerKind: 'MANUAL' }, validatedAt: 123,
    });
  });

  it('keeps MOCK observation deterministic', async () => {
    const value = await videoFixture();
    const request = createVideoValidationRequest({ request: value.request, result: value.candidate });
    const provider = createDeterministicMockVideoObservationProvider('COHERENT');
    expect(await provider.observe(request)).toEqual(await provider.observe(request));
  });

  it.each([
    ['WRONG_ACTION', 'WRONG_PRIMARY_ACTION'],
    ['FUTURE_ACTION', 'FUTURE_ACTION'],
    ['MISSING_PRIMARY', 'MISSING_PRIMARY_ACTION'],
    ['SOURCE_MISMATCH', 'SOURCE_IMAGE_CONTINUITY'],
    ['CHARACTER_MISMATCH', 'CHARACTER_CONTINUITY'],
    ['ENVIRONMENT_MISMATCH', 'ENVIRONMENT_CONTINUITY'],
    ['CONSTRUCTION_MISMATCH', 'CONSTRUCTION_CONTINUITY'],
    ['CAMERA_MISMATCH', 'CAMERA_CONTINUITY'],
  ] as const)('returns FAIL for %s evidence', async (scenario, findingCode) => {
    const value = await validationFixture(scenario);
    expect(value.validation.verdict).toBe('FAIL');
    expect(value.validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: findingCode, severity: 'FAIL' }),
    ]));
  });

  it('returns WARN for a minor camera issue', async () => {
    const value = await validationFixture('MINOR_CAMERA');
    expect(value.validation).toMatchObject({ verdict: 'WARN' });
    expect(value.validation.findings).toContainEqual(expect.objectContaining({
      code: 'CAMERA_CONTINUITY', severity: 'WARN',
    }));
  });

  it('never returns PASS for insufficient evidence', async () => {
    const value = await validationFixture('INSUFFICIENT');
    expect(value.validation.verdict).toBe('WARN');
    expect(value.validation.findings).toContainEqual(expect.objectContaining({
      code: 'INSUFFICIENT_EVIDENCE', severity: 'WARN',
    }));
  });

  it.each([
    ['videoRequestId', 'other-request', 'EVIDENCE_REQUEST_MISMATCH'],
    ['videoAssetId', 'other-asset', 'EVIDENCE_ASSET_MISMATCH'],
    ['validationId', 'other-validation', 'EVIDENCE_VALIDATION_MISMATCH'],
  ] as const)('blocks evidence with wrong %s', async (field, invalid, findingCode) => {
    const value = await validationFixture('COHERENT');
    const evidence = { ...structuredClone(value.evidence), [field]: invalid } as VideoValidationEvidence;
    const validation = validateVideoContinuity(value.validationRequest, evidence);
    expect(validation).toMatchObject({ verdict: 'FAIL' });
    expect(validation.findings).toContainEqual(expect.objectContaining({ code: findingCode }));
  });

  it('evaluates clothing, material and motion-quality evidence explicitly', async () => {
    const value = await validationFixture('COHERENT');
    const evidence: VideoValidationEvidence = {
      ...structuredClone(value.evidence),
      clothingConsistency: 'MAJOR_DIVERGENCE',
      materialConsistency: 'MAJOR_DIVERGENCE',
      motionQuality: 'MAJOR_ISSUE',
    };
    const validation = validateVideoContinuity(value.validationRequest, evidence);
    expect(validation.verdict).toBe('FAIL');
    expect(validation.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'CLOTHING_CONTINUITY', 'MATERIAL_CONTINUITY', 'MOTION_QUALITY',
    ]));
  });

  it('applies explicit duration WARN and FAIL thresholds', async () => {
    const value = await validationFixture('COHERENT');
    const warnEvidence = { ...structuredClone(value.evidence), durationObserved: 8.5 };
    const failEvidence = { ...structuredClone(value.evidence), durationObserved: 12 };
    expect(validateVideoContinuity(value.validationRequest, warnEvidence)).toMatchObject({ verdict: 'WARN' });
    expect(validateVideoContinuity(value.validationRequest, failEvidence)).toMatchObject({ verdict: 'FAIL' });
  });

  it('does not infer evidence from URI, filename, prompt or generation success', async () => {
    const value = await videoFixture();
    const request = createVideoValidationRequest({ request: value.request, result: value.candidate });
    const insufficient = createDeterministicMockVideoObservationProvider('INSUFFICIENT');
    expect(validateVideoContinuity(request, await insufficient.observe(request)).verdict).not.toBe('PASS');
  });
});

describe('video approval eligibility', () => {
  it('makes PASS eligible and FAIL ineligible', async () => {
    const pass = await validationFixture('COHERENT');
    const fail = await validationFixture('WRONG_ACTION');
    expect(evaluateVideoApprovalEligibility({ validation: pass.validation })).toEqual({
      eligible: true, requiresAcknowledgement: false, reason: 'PASS',
    });
    expect(evaluateVideoApprovalEligibility({ validation: fail.validation })).toEqual({
      eligible: false, requiresAcknowledgement: false, reason: 'FAIL',
    });
  });

  it('requires explicit acknowledgement for WARN', async () => {
    const value = await validationFixture('MINOR_CAMERA');
    expect(evaluateVideoApprovalEligibility({ validation: value.validation })).toMatchObject({
      eligible: false, requiresAcknowledgement: true,
    });
    expect(evaluateVideoApprovalEligibility({
      validation: value.validation, warnAcknowledged: true,
    })).toEqual({
      eligible: true, requiresAcknowledgement: false, reason: 'WARN_ACKNOWLEDGED',
    });
  });
});

async function validateCandidate(
  request: VideoGenerationRequest,
  candidate: Extract<VideoGenerationResult, { status: 'SUCCESS' }>,
  scenario: MockVideoObservationScenario,
) {
  const validationRequest = createVideoValidationRequest({ request, result: candidate });
  const evidence = await createDeterministicMockVideoObservationProvider(scenario)
    .observe(validationRequest);
  return {
    validationRequest,
    evidence,
    validation: validateVideoContinuity(validationRequest, evidence),
  };
}

async function failedCorrectionFixture(label: Label = 'a', projectId = 'project-a') {
  const video = await videoFixture(label, projectId);
  const observed = await validateCandidate(video.request, video.candidate, 'WRONG_ACTION');
  const planResult = createVideoCorrectionPlan({
    request: video.request,
    candidate: video.candidate,
    validation: observed.validation,
  });
  if (planResult.status !== 'CREATED') throw new Error('Expected correction plan.');
  const correctedResult = createCorrectedVideoGenerationRequest(video.request, planResult.plan);
  if (correctedResult.status !== 'CREATED') throw new Error(correctedResult.message);
  return { ...video, ...observed, plan: planResult.plan, corrected: correctedResult.request };
}

describe('video correction plan and retry policy', () => {
  it('creates a bound CHANGE/PRESERVE plan for FAIL', async () => {
    const value = await failedCorrectionFixture();
    expect(value.plan).toMatchObject({
      sourceVideoRequestId: value.request.requestId,
      sourceVideoAssetId: value.candidate.asset.id,
      sourceValidationId: value.validation.validationId,
      projectId: 'project-a', sceneId: 'scene-a', stageId: 'stage-a',
      operationId: 'operation-a', snapshotId: value.state.id,
      sourceImageAssetId: value.reference.asset.id,
      physicalActionIRId: value.action.id,
      attemptNumber: 2,
    });
    expect(value.plan.changeInstructions).toContain(
      `perform only the approved action: ${value.action.primaryAction.description}`,
    );
    expect(value.plan.preserveInstructions).toEqual(expect.arrayContaining([
      expect.stringContaining(`source image asset ${value.reference.asset.id}`),
      expect.stringContaining(`physical action ${value.action.id}`),
      expect.stringContaining('current construction state'),
    ]));
  });

  it('does not create normal retry for PASS, unrequested WARN or insufficient evidence', async () => {
    const pass = await validationFixture('COHERENT');
    const warn = await validationFixture('MINOR_CAMERA');
    const insufficient = await validationFixture('INSUFFICIENT');
    expect(createVideoCorrectionPlan({
      request: pass.request, candidate: pass.candidate, validation: pass.validation,
    })).toEqual({ status: 'NOT_REQUIRED', reason: 'PASS' });
    expect(createVideoCorrectionPlan({
      request: warn.request, candidate: warn.candidate, validation: warn.validation,
    })).toEqual({ status: 'NOT_REQUIRED', reason: 'WARN_RETRY_NOT_REQUESTED' });
    expect(createVideoCorrectionPlan({
      request: insufficient.request,
      candidate: insufficient.candidate,
      validation: insufficient.validation,
    })).toEqual({ status: 'NOT_REQUIRED', reason: 'REVALIDATION_REQUIRED' });
    expect(evaluateVideoRetryEligibility({
      request: insufficient.request, validation: insufficient.validation, maxAttempts: 3,
    })).toMatchObject({ decision: 'REVALIDATE', retry: false });
  });

  it('allows WARN retry only through explicit policy', async () => {
    const value = await validationFixture('MINOR_CAMERA');
    expect(evaluateVideoRetryEligibility({
      request: value.request, validation: value.validation, maxAttempts: 3,
    })).toMatchObject({ decision: 'NO_RETRY', retry: false });
    expect(evaluateVideoRetryEligibility({
      request: value.request, validation: value.validation, maxAttempts: 3, retryWarn: true,
    })).toMatchObject({ decision: 'RETRY', retry: true, nextAttempt: 2 });
    expect(createVideoCorrectionPlan({
      request: value.request,
      candidate: value.candidate,
      validation: value.validation,
      retryWarn: true,
    })).toMatchObject({ status: 'CREATED', plan: { attemptNumber: 2 } });
  });

  it('creates a new deterministic retry request id', async () => {
    const value = await failedCorrectionFixture();
    const again = createCorrectedVideoGenerationRequest(value.request, value.plan);
    expect(again).toMatchObject({ status: 'CREATED' });
    if (again.status !== 'CREATED') throw new Error(again.message);
    expect(value.corrected.requestId).not.toBe(value.request.requestId);
    expect(again.request.requestId).toBe(value.corrected.requestId);
    expect(getVideoGenerationAttemptNumber(value.corrected)).toBe(2);
    expect(value.corrected.renderedPrompt).toContain('VIDEO CORRECTION LAYER');
  });

  it('preserves official source, PhysicalActionIR, canonical spec and temporal identity', async () => {
    const value = await failedCorrectionFixture();
    expect(value.corrected.sourceImage).toEqual(value.request.sourceImage);
    expect(value.corrected.source).toEqual(value.request.source);
    expect(value.corrected.canonicalAnimationSpec).toEqual(value.request.canonicalAnimationSpec);
    expect(value.corrected.canonicalAnimationSpec.identity.physicalActionIRId).toBe(value.action.id);
    expect(value.corrected.temporalIdentity).toEqual(value.request.temporalIdentity);
    expect(value.corrected.sourceImage.id).not.toBe(value.candidate.asset.id);
  });

  it('blocks correction plans across project and stage', async () => {
    const a = await failedCorrectionFixture('a');
    const otherProject = await videoFixture('a', 'project-b');
    const otherStage = await videoFixture('b');
    for (const request of [otherProject.request, otherStage.request]) {
      expect(createCorrectedVideoGenerationRequest(request, a.plan)).toMatchObject({
        status: 'FAILURE', errorCode: 'PLAN_REQUEST_MISMATCH',
      });
    }
  });

  it('blocks validation/candidate identity from another request or asset', async () => {
    const a = await validationFixture('WRONG_ACTION', 'a');
    const b = await validationFixture('WRONG_ACTION', 'b');
    expect(createVideoCorrectionPlan({
      request: a.request, candidate: b.candidate, validation: a.validation,
    })).toMatchObject({ status: 'FAILURE', errorCode: 'SOURCE_REQUEST_MISMATCH' });
    const wrongAssetValidation = {
      ...structuredClone(a.validation), videoAssetId: 'other-asset',
    };
    expect(createVideoCorrectionPlan({
      request: a.request, candidate: a.candidate, validation: wrongAssetValidation,
    })).toMatchObject({ status: 'FAILURE', errorCode: 'SOURCE_ASSET_MISMATCH' });
  });

  it('enforces maxAttempts without automatic loops', async () => {
    const value = await failedCorrectionFixture();
    expect(evaluateVideoRetryEligibility({
      request: value.request, validation: value.validation, maxAttempts: 1,
    })).toMatchObject({ decision: 'RETRY_EXHAUSTED', retry: false, currentAttempt: 1 });
    expect(evaluateVideoRetryEligibility({
      request: value.request, validation: value.validation, maxAttempts: 3,
    })).toMatchObject({ decision: 'RETRY', retry: true, nextAttempt: 2 });
  });
});

describe('complete video validation and retry flows', () => {
  it('runs official A1 FAIL to corrected A2 PASS without changing authority', async () => {
    const a1 = await failedCorrectionFixture();
    expect(a1.validation.verdict).toBe('FAIL');
    expect(evaluateVideoApprovalEligibility({ validation: a1.validation }).eligible).toBe(false);

    const a2Candidate = await completeRequest(a1.corrected, 'video-a-attempt-2');
    const a2 = await validateCandidate(a1.corrected, a2Candidate, 'COHERENT');
    expect(a2.validation.verdict).toBe('PASS');
    expect(evaluateVideoApprovalEligibility({ validation: a2.validation })).toEqual({
      eligible: true, requiresAcknowledgement: false, reason: 'PASS',
    });
    expect(a1.corrected.requestId).not.toBe(a1.request.requestId);
    expect(a1.corrected.sourceImage).toEqual(a1.request.sourceImage);
    expect(a1.corrected.canonicalAnimationSpec.identity.physicalActionIRId).toBe(a1.action.id);
    expect(a1.corrected.temporalIdentity).toEqual(a1.request.temporalIdentity);
    expect(a1.candidate).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
    expect(a1.candidate).not.toHaveProperty('approvalStatus');
  });

  it('runs A1 FAIL to A2 FAIL to A3 PASS with one stable official source', async () => {
    const a1 = await failedCorrectionFixture();
    const a2Candidate = await completeRequest(a1.corrected, 'video-a-attempt-2');
    const a2Validation = await validateCandidate(a1.corrected, a2Candidate, 'CONSTRUCTION_MISMATCH');
    expect(a2Validation.validation.verdict).toBe('FAIL');
    const a3Plan = createVideoCorrectionPlan({
      request: a1.corrected,
      candidate: a2Candidate,
      validation: a2Validation.validation,
    });
    if (a3Plan.status !== 'CREATED') throw new Error('Expected A3 plan.');
    const a3Request = createCorrectedVideoGenerationRequest(a1.corrected, a3Plan.plan);
    if (a3Request.status !== 'CREATED') throw new Error(a3Request.message);
    const a3Candidate = await completeRequest(a3Request.request, 'video-a-attempt-3');
    const a3Validation = await validateCandidate(a3Request.request, a3Candidate, 'COHERENT');

    expect(getVideoGenerationAttemptNumber(a1.request)).toBe(1);
    expect(getVideoGenerationAttemptNumber(a1.corrected)).toBe(2);
    expect(getVideoGenerationAttemptNumber(a3Request.request)).toBe(3);
    expect([a1.request, a1.corrected, a3Request.request].map(item => item.sourceImage.id))
      .toEqual([a1.reference.asset.id, a1.reference.asset.id, a1.reference.asset.id]);
    expect([a1.request, a1.corrected, a3Request.request].map(item => item.temporalIdentity))
      .toEqual([a1.request.temporalIdentity, a1.request.temporalIdentity, a1.request.temporalIdentity]);
    expect(evaluateVideoApprovalEligibility({ validation: a1.validation }).eligible).toBe(false);
    expect(evaluateVideoApprovalEligibility({ validation: a2Validation.validation }).eligible).toBe(false);
    expect(evaluateVideoApprovalEligibility({ validation: a3Validation.validation }).eligible).toBe(true);
    expect(evaluateVideoRetryEligibility({
      request: a3Request.request, validation: {
        ...a3Validation.validation,
        verdict: 'FAIL',
        findings: [{
          code: 'CONSTRUCTION_CONTINUITY', severity: 'FAIL', message: 'still wrong',
        }],
      }, maxAttempts: 3,
    })).toMatchObject({ decision: 'RETRY_EXHAUSTED', retry: false });
  });

  it('keeps video A and B correction chains isolated', async () => {
    const a = await failedCorrectionFixture('a');
    const b = await failedCorrectionFixture('b');
    expect(a.corrected.sourceImage.id).toBe(a.reference.asset.id);
    expect(b.corrected.sourceImage.id).toBe(b.reference.asset.id);
    expect(a.corrected.sourceImage.id).not.toBe(b.corrected.sourceImage.id);
    expect(a.corrected.temporalIdentity.stageId).toBe('stage-a');
    expect(b.corrected.temporalIdentity.stageId).toBe('stage-b');
    expect(createCorrectedVideoGenerationRequest(b.request, a.plan)).toMatchObject({
      status: 'FAILURE', errorCode: 'PLAN_REQUEST_MISMATCH',
    });
  });

  it('does not mutate requests, results, evidence, validation, plan, source or canonical inputs', async () => {
    const value = await failedCorrectionFixture();
    const before = structuredClone({
      request: value.request,
      candidate: value.candidate,
      evidence: value.evidence,
      validation: value.validation,
      plan: value.plan,
      source: value.reference,
      snapshot: value.state,
      action: value.action,
    });
    createCorrectedVideoGenerationRequest(value.request, value.plan);
    expect({
      request: value.request,
      candidate: value.candidate,
      evidence: value.evidence,
      validation: value.validation,
      plan: value.plan,
      source: value.reference,
      snapshot: value.state,
      action: value.action,
    }).toEqual(before);
    expect(Object.isFrozen(value.validation)).toBe(true);
    expect(Object.isFrozen(value.plan)).toBe(true);
    expect(Object.isFrozen(value.corrected)).toBe(true);
  });

  it('does not auto-approve or mutate memory, WorldState, Stage or timeline sentinels', async () => {
    const value = await failedCorrectionFixture();
    const memory = createVisualReferenceMemory([value.reference]);
    const worldState = Object.freeze({ progress: 25, existingComponents: ['component-a'] });
    const stage = Object.freeze({ id: 'stage-a', decision: Object.freeze({ status: 'PASS' }) });
    const timeline = Object.freeze({ cursor: 'stage-a', committed: ['stage-a'] });
    const before = structuredClone({ records: memory.records, worldState, stage, timeline });
    createCorrectedVideoGenerationRequest(value.request, value.plan);
    expect({ records: memory.records, worldState, stage, timeline }).toEqual(before);
    expect(value.candidate.outputStatus).toBe('UNREVIEWED');
  });

  it('runs MANUAL/MOCK observation and retry foundation offline without APIs', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const value = await videoFixture();
    const request = createVideoValidationRequest({ request: value.request, result: value.candidate });
    const manual = createManualVideoObservationProvider({
      evidenceId: 'manual-offline', observedAt: 1, observation: await coherentObservation(request),
    });
    const mock = createDeterministicMockVideoObservationProvider('COHERENT');
    expect(validateVideoContinuity(request, await manual.observe(request)).verdict).toBe('PASS');
    expect(validateVideoContinuity(request, await mock.observe(request)).verdict).toBe('PASS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
