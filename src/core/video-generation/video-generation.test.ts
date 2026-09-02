import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhysicalActionIR } from '../actions/physical-action-ir';
import { compileCanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-compiler';
import {
  approveGeneratedImageAsOfficial,
  createVisualReferenceMemory,
  type VisualReferenceRecord,
} from '../visual-reference';
import {
  createDeterministicMockImageProvider,
  type ImageGenerationRequest,
  type ImageGenerationResult,
} from '../image-generation';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import {
  createDeterministicMockVisualObservationProvider,
  createVisualValidationRequest,
  evaluateVisualApprovalEligibility,
  validateVisualContinuity,
} from '../visual-validation';
import {
  completeManualVideoGeneration,
  createCanonicalAnimationPromptSpec,
  createDeterministicMockVideoProvider,
  createManualVideoProvider,
  createVideoGenerationRequest,
  createVideoGenerationService,
  renderCanonicalAnimationPrompt,
  type CanonicalAnimationPromptSpecResult,
  type ManualVideoSubmission,
  type VideoGenerationRequest,
  type VideoGenerationResult,
  type VideoProvider,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

type Label = 'a' | 'b';

function snapshot(label: Label, projectId = 'project-a'): VisualStateSnapshot {
  const index = label === 'a' ? 0 : 1;
  const target = `component-${label}`;
  const completed = label === 'a' ? ['foundation', 'component-a'] : ['foundation', 'component-a', 'component-b'];
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
      progress: (index + 1) * 25,
      visibleComponents: completed,
      completedComponents: completed,
      partialComponents: [],
      activeComponent: target,
      targetState: 'COMPLETE',
      pendingComponents: future,
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8 - index, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [{ materialId: 'wood', quantity: index + 1, location: 'Z1' }],
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
      preserveComponents: completed,
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
      completedComponents: completed,
      partialComponents: [],
      materialQuantityChanges: [{ materialId: 'wood', before: 9 - index, after: 8 - index }],
    },
  };
}

function physicalAction(label: Label): PhysicalActionIR {
  const target = `component-${label}`;
  const prior = label === 'a' ? ['foundation'] : ['foundation', 'component-a'];
  return {
    id: `physical-action:${label}`,
    sceneId: `scene-${label}`,
    stageId: `stage-${label}`,
    operationId: `operation-${label}`,
    primaryAction: { type: 'INSTALL', verb: 'install', description: `install ${target}` },
    actor: { characterId: 'builder-1' },
    target: { id: target, label: target, elements: [target] },
    zone: 'Z1',
    tools: ['hammer'],
    materials: ['wood'],
    preconditions: [`target ${target} is partial`],
    expectedEffects: {
      constructionProgress: { before: label === 'a' ? 0 : 25, after: label === 'a' ? 25 : 50 },
      targetStatus: { before: 'PARTIAL', after: 'COMPLETE' },
      actorZone: { before: 'Z1', after: 'Z1' },
      materialQuantityChanges: [{
        materialId: 'wood',
        before: label === 'a' ? 9 : 8,
        after: label === 'a' ? 8 : 7,
      }],
      newlyCompletedComponents: [target],
      newlyPartialComponents: [],
    },
    before: {
      targetStatus: 'PARTIAL',
      constructionProgress: label === 'a' ? 0 : 25,
      actorZone: 'Z1',
      materialQuantities: { wood: label === 'a' ? 9 : 8 },
    },
    after: {
      targetStatus: 'COMPLETE',
      constructionProgress: label === 'a' ? 25 : 50,
      actorZone: 'Z1',
      materialQuantities: { wood: label === 'a' ? 8 : 7 },
    },
    constraints: {
      preserveActorId: 'builder-1',
      allowedZone: 'Z1',
      preserveComponents: prior,
      preserveZones: ['Z1'],
      forbiddenFutureComponents: ['component-roof'],
      preventPrematureElements: label === 'a' ? ['component-b'] : [],
    },
    evidence: [`${target} reaches complete status`],
  };
}

function imageRequest(state: VisualStateSnapshot): ImageGenerationRequest {
  const canonicalSpec = compileCanonicalImagePromptSpec(state);
  if (!canonicalSpec) throw new Error('Expected canonical image spec.');
  return {
    requestId: `image-request:${state.identity.projectId}:${state.identity.stageId}`,
    projectId: state.identity.projectId,
    sceneId: state.identity.sceneId,
    stageId: state.identity.stageId,
    providerId: 'mock',
    mode: 'GENERATE',
    prompt: `canonical image prompt for ${state.identity.stageId}`,
    temporalAuthority: 'OFFICIAL',
    snapshotKind: 'OFFICIAL',
    references: [],
    aspectRatio: state.camera.viewpoint.aspectRatio,
    metadata: {
      canonicalSpecId: canonicalSpec.id,
      snapshotId: state.id,
      operationId: state.identity.operationId,
      temporalPoint: state.temporalPoint,
      stageOutcome: state.stageOutcome,
      worldStateSource: state.worldStateSource,
      temporalPosition: {
        sceneOrder: state.identity.stageId === 'stage-a' ? 0 : 1,
        stageOrder: 0,
      },
    },
  };
}

async function validatedOfficialImage(state: VisualStateSnapshot) {
  const canonicalSpec = compileCanonicalImagePromptSpec(state);
  if (!canonicalSpec) throw new Error('Expected canonical image spec.');
  const request = imageRequest(state);
  const result = await createDeterministicMockImageProvider().generate(request);
  const validationRequest = createVisualValidationRequest({ request, result, canonicalSpec });
  const observer = createDeterministicMockVisualObservationProvider('COHERENT');
  const validation = validateVisualContinuity(
    validationRequest,
    await observer.observe(validationRequest),
  );
  const eligibility = evaluateVisualApprovalEligibility({ validation });
  if (!eligibility.eligible) throw new Error('Expected PASS validation to be approval eligible.');
  const reference = approveGeneratedImageAsOfficial({
    request,
    result,
    providerKind: 'MOCK',
    approval: { approved: true, recordedAt: state.identity.stageId === 'stage-a' ? 100 : 200 },
  });
  return { request, result, validation, eligibility, reference };
}

async function officialImage(state: VisualStateSnapshot): Promise<VisualReferenceRecord> {
  return (await validatedOfficialImage(state)).reference;
}

function unwrapSpec(result: CanonicalAnimationPromptSpecResult) {
  if (result.status !== 'SUCCESS') throw new Error(`Expected animation spec: ${result.message}`);
  return result;
}

async function fixture(
  label: Label = 'a',
  providerId = 'mock-video',
  durationSeconds = 8,
  projectId = 'project-a',
) {
  const state = snapshot(label, projectId);
  const action = physicalAction(label);
  const reference = await officialImage(state);
  const built = unwrapSpec(createCanonicalAnimationPromptSpec({
    physicalAction: action,
    snapshot: state,
    source: reference,
    output: { durationSeconds, resolution: { width: 1280, height: 720 } },
  }));
  const request = createVideoGenerationRequest({
    providerId,
    canonicalAnimationSpec: built.spec,
    source: built.source,
  });
  return { state, action, reference, spec: built.spec, source: built.source, request };
}

describe('CanonicalAnimationPromptSpec', () => {
  it('is deterministic for the same canonical inputs', async () => {
    const first = await fixture();
    const result = unwrapSpec(createCanonicalAnimationPromptSpec({
      physicalAction: first.action,
      snapshot: first.state,
      source: first.reference,
      output: first.spec.output,
    }));
    expect(result.spec).toEqual(first.spec);
  });

  it('does not mutate PhysicalActionIR, VisualStateSnapshot or official source inputs', async () => {
    const state = snapshot('a');
    const action = physicalAction('a');
    const source = await officialImage(state);
    const before = structuredClone({ state, action, source });
    const result = createCanonicalAnimationPromptSpec({
      physicalAction: action,
      snapshot: state,
      source,
      output: { durationSeconds: 8 },
    });
    expect(result.status).toBe('SUCCESS');
    expect({ state, action, source }).toEqual(before);
  });

  it('derives motion only from the bound PhysicalActionIR', async () => {
    const value = await fixture('a');
    expect(value.spec.motion.primaryAction).toEqual(value.action.primaryAction);
    expect(value.spec.motion.constructionMotion.target).toEqual(value.action.target);
    expect(value.spec.motion.secondaryActions).toEqual([]);
  });

  it('preserves the complete temporal identity', async () => {
    const value = await fixture();
    expect(value.spec).toMatchObject({
      identity: {
        projectId: value.state.identity.projectId,
        sceneId: value.action.sceneId,
        stageId: value.action.stageId,
        operationId: value.action.operationId,
        snapshotId: value.state.id,
      },
      temporal: { temporalAuthority: 'OFFICIAL', snapshotKind: 'OFFICIAL', stageOutcome: 'COMMITTED' },
    });
  });

  it('does not import a future physical action', async () => {
    const value = await fixture('a');
    expect(JSON.stringify(value.spec.motion)).not.toContain('install component-b');
    expect(value.spec.forbidden.futureElements).toContain('component-b');
  });

  it('blocks a PhysicalActionIR from another stage', async () => {
    const value = await fixture('a');
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('b'),
      snapshot: value.state,
      source: value.reference,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'PHYSICAL_ACTION_BINDING_MISMATCH' });
  });

  it('blocks altered motion even when the action identity fields are reused', async () => {
    const value = await fixture('a');
    const altered = {
      ...structuredClone(value.action),
      materials: ['future-steel'],
    };
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: altered,
      snapshot: value.state,
      source: value.reference,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'PHYSICAL_ACTION_BINDING_MISMATCH' });
  });

  it('accepts an approved official image for the exact snapshot', async () => {
    expect((await fixture()).spec.identity.sourceImageAssetId).toContain('mock-image:');
  });

  it('blocks an unreviewed SUCCESS image result', async () => {
    const state = snapshot('a');
    const request = imageRequest(state);
    const unreviewed = await createDeterministicMockImageProvider().generate(request);
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('a'), snapshot: state, source: unreviewed,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_SOURCE_IMAGE' });
  });

  it('blocks a failed image result', () => {
    const state = snapshot('a');
    const failed: ImageGenerationResult = {
      status: 'FAILURE', requestId: 'failed', providerId: 'mock', errorCode: 'FAILED',
      message: 'failed candidate', retryable: false,
    };
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('a'), snapshot: state, source: failed,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_SOURCE_IMAGE' });
  });

  it('blocks a source image from another project', async () => {
    const value = await fixture('a');
    const otherProject = { ...structuredClone(value.reference), projectId: 'project-b' };
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: value.action, snapshot: value.state, source: otherProject,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'TEMPORAL_BINDING_MISMATCH' });
  });

  it('blocks a source image from another stage or snapshot', async () => {
    const stateA = snapshot('a');
    const sourceB = await officialImage(snapshot('b'));
    expect(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('a'), snapshot: stateA, source: sourceB,
      output: { durationSeconds: 8 },
    })).toMatchObject({ status: 'FAILURE', errorCode: 'TEMPORAL_BINDING_MISMATCH' });
  });

  it('preserves camera and environment continuity constraints', async () => {
    const value = await fixture();
    expect(value.spec.camera).toMatchObject({
      cameraMovement: 'FIXA',
      framing: 'wide',
      viewpointConstraints: { cameraId: 'A', allowedMovement: 'FIXA' },
    });
    expect(value.spec.continuity).toMatchObject({
      preserveClothing: 'orange work jacket',
      preserveLighting: 'day',
      preserveCameraContinuity: { cameraId: 'A', movement: 'FIXA' },
    });
    expect(value.spec.continuity.preserveEnvironment.permanentObjects).toEqual(['old-tree']);
  });

  it('preserves forbidden future elements in the rendered prompt', async () => {
    const value = await fixture('a');
    expect(value.spec.forbidden.futureElements).toEqual(expect.arrayContaining(['component-b', 'component-roof']));
    expect(renderCanonicalAnimationPrompt(value.spec)).toContain('Future elements: component-b, component-roof');
  });
});

describe('VideoGenerationRequest identity', () => {
  it('is deterministic for the same semantic request', async () => {
    const value = await fixture();
    expect(createVideoGenerationRequest({
      providerId: value.request.providerId,
      canonicalAnimationSpec: value.spec,
      source: value.source,
    })).toEqual(value.request);
  });

  it('does not include approval timestamps in semantic request identity', async () => {
    const state = snapshot('a');
    const firstImage = await validatedOfficialImage(state);
    const secondReference = approveGeneratedImageAsOfficial({
      request: firstImage.request,
      result: firstImage.result,
      providerKind: 'MOCK',
      approval: { approved: true, recordedAt: 999_999 },
    });
    const firstSpec = unwrapSpec(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('a'), snapshot: state, source: firstImage.reference,
      output: { durationSeconds: 8 },
    }));
    const secondSpec = unwrapSpec(createCanonicalAnimationPromptSpec({
      physicalAction: physicalAction('a'), snapshot: state, source: secondReference,
      output: { durationSeconds: 8 },
    }));
    const first = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: firstSpec.spec, source: firstSpec.source,
    });
    const second = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: secondSpec.spec, source: secondSpec.source,
    });
    expect(first.requestId).toBe(second.requestId);
  });

  it('changes requestId when source image changes', async () => {
    const valueA = await fixture('a');
    const alternateSource = {
      ...structuredClone(valueA.source),
      referenceId: 'visual-reference:alternate',
      asset: { ...structuredClone(valueA.source.asset), id: 'approved-alternate', uri: 'mock://image/alternate' },
    };
    const alternateSpec = {
      ...structuredClone(valueA.spec),
      id: 'animation-spec:alternate',
      identity: {
        ...valueA.spec.identity,
        sourceReferenceId: alternateSource.referenceId,
        sourceImageAssetId: alternateSource.asset.id,
      },
    };
    const alternate = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: alternateSpec, source: alternateSource,
    });
    expect(alternate.requestId).not.toBe(valueA.request.requestId);
  });

  it('changes requestId when the canonical physical action changes', async () => {
    const value = await fixture();
    const changedSpec = {
      ...structuredClone(value.spec),
      motion: {
        ...value.spec.motion,
        primaryAction: { ...value.spec.motion.primaryAction, description: 'install component-a precisely' },
      },
    };
    const changed = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: changedSpec, source: value.source,
    });
    expect(changed.requestId).not.toBe(value.request.requestId);
  });

  it('changes requestId when duration changes', async () => {
    const first = await fixture('a', 'mock-video', 5);
    const second = await fixture('a', 'mock-video', 10);
    expect(first.request.requestId).not.toBe(second.request.requestId);
  });

  it('changes requestId when provider, camera or temporal identity changes', async () => {
    const value = await fixture();
    const provider = createVideoGenerationRequest({
      providerId: 'manual-video', canonicalAnimationSpec: value.spec, source: value.source,
    });
    const cameraSpec = {
      ...structuredClone(value.spec),
      camera: { ...value.spec.camera, cameraMovement: 'PAN' as const },
    };
    const camera = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: cameraSpec, source: value.source,
    });
    const temporalSource = {
      ...structuredClone(value.source),
      temporalPosition: { sceneOrder: 9, stageOrder: 9 },
    };
    const temporal = createVideoGenerationRequest({
      providerId: 'mock-video', canonicalAnimationSpec: value.spec, source: temporalSource,
    });
    expect(new Set([
      value.request.requestId,
      provider.requestId,
      camera.requestId,
      temporal.requestId,
    ])).toHaveLength(4);
  });

  it('returns an immutable request without mutating its inputs', async () => {
    const value = await fixture();
    const specBefore = structuredClone(value.spec);
    const sourceBefore = structuredClone(value.source);
    createVideoGenerationRequest({
      providerId: 'manual-video', canonicalAnimationSpec: value.spec, source: value.source,
    });
    expect(value.spec).toEqual(specBefore);
    expect(value.source).toEqual(sourceBefore);
    expect(Object.isFrozen(value.request)).toBe(true);
  });
});

describe('Video providers and service', () => {
  it('runs the free MANUAL flow with official source image', async () => {
    const value = await fixture('a', 'manual-video');
    const result = await createVideoGenerationService({ providers: [createManualVideoProvider()] })
      .generate(value.request);
    expect(result).toMatchObject({
      status: 'MANUAL_READY', requestId: value.request.requestId, outputStatus: 'UNREVIEWED',
      package: { sourceImage: { id: value.reference.asset.id }, audio: 'SILENT' },
    });
  });

  it('runs the MOCK flow and keeps SUCCESS unreviewed', async () => {
    const value = await fixture();
    const result = await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(value.request);
    expect(result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
  });

  it('keeps the MOCK result deterministic', async () => {
    const value = await fixture();
    const provider = createDeterministicMockVideoProvider();
    expect(await provider.generate(value.request)).toEqual(await provider.generate(value.request));
  });

  it('returns structured failure for unknown provider', async () => {
    const value = await fixture('a', 'unknown-video');
    expect(await createVideoGenerationService({ providers: [] }).generate(value.request)).toMatchObject({
      status: 'FAILURE', errorCode: 'UNKNOWN_PROVIDER', retryable: false,
    });
  });

  it('returns structured failure for provider mismatch', async () => {
    const value = await fixture('a', 'other-video');
    expect(await createManualVideoProvider().generate(value.request)).toMatchObject({
      status: 'FAILURE', errorCode: 'PROVIDER_MISMATCH',
    });
  });

  it('converts provider throws to structured failure', async () => {
    const value = await fixture('a', 'throw-video');
    const throwing: VideoProvider = {
      id: 'throw-video', kind: 'LOCAL',
      async generate() { throw new Error('provider exploded'); },
    };
    expect(await createVideoGenerationService({ providers: [throwing] }).generate(value.request))
      .toMatchObject({ status: 'FAILURE', errorCode: 'PROVIDER_EXECUTION_ERROR', message: 'provider exploded' });
  });

  it('returns structured failure for invalid duration', async () => {
    const value = await fixture();
    const invalid = { ...value.request, durationSeconds: 0 } as VideoGenerationRequest;
    expect(await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(invalid)).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_DURATION' });
  });

  it.each([5, 8, 10, 15])('supports provider-neutral duration %i seconds', async durationSeconds => {
    const value = await fixture('a', 'mock-video', durationSeconds);
    const result = await createVideoGenerationService({
      providers: [createDeterministicMockVideoProvider()],
    }).generate(value.request);
    expect(result).toMatchObject({
      status: 'SUCCESS',
      asset: { durationSeconds },
      outputStatus: 'UNREVIEWED',
    });
  });

  it.each([
    { resolution: { width: 1920, height: 1080 } },
  ])('rejects output parameters inconsistent with the canonical spec: %o', async override => {
    const value = await fixture();
    const invalid = { ...value.request, ...override } as VideoGenerationRequest;
    expect(await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(invalid)).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_REQUEST' });
  });

  it('returns structured failure for a missing rendered prompt', async () => {
    const value = await fixture();
    const invalid = { ...value.request, renderedPrompt: '' } as VideoGenerationRequest;
    expect(await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(invalid)).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_REQUEST' });
  });

  it('rejects a forged cross-project source at the service boundary', async () => {
    const value = await fixture();
    const invalid = {
      ...value.request,
      source: { ...value.request.source, projectId: 'project-b' },
    } as VideoGenerationRequest;
    expect(await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(invalid)).toMatchObject({ status: 'FAILURE', errorCode: 'TEMPORAL_BINDING_MISMATCH' });
  });

  it('rejects a forged unapproved source at the service boundary', async () => {
    const value = await fixture();
    const invalid = {
      ...value.request,
      source: { ...value.request.source, approvalStatus: 'UNREVIEWED' },
    } as unknown as VideoGenerationRequest;
    expect(await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(invalid)).toMatchObject({ status: 'FAILURE', errorCode: 'INVALID_SOURCE_IMAGE' });
  });

  it('passes the correct immutable request to the provider', async () => {
    const value = await fixture('a', 'capture-video');
    let received: VideoGenerationRequest | undefined;
    const provider: VideoProvider = {
      id: 'capture-video', kind: 'LOCAL',
      async generate(request) {
        received = request;
        return {
          status: 'SUCCESS', requestId: request.requestId, providerId: 'capture-video',
          asset: { id: 'video-a', source: 'LOCAL', uri: 'local://video/a' },
          warnings: [], outputStatus: 'UNREVIEWED',
        };
      },
    };
    await createVideoGenerationService({ providers: [provider] }).generate(value.request);
    expect(received).toEqual(value.request);
    expect(Object.isFrozen(received)).toBe(true);
  });

  it('rejects a provider result that attempts to auto-approve SUCCESS output', async () => {
    const value = await fixture('a', 'unsafe-video');
    const unsafe = {
      id: 'unsafe-video',
      kind: 'LOCAL',
      async generate(request: VideoGenerationRequest) {
        return {
          status: 'SUCCESS', requestId: request.requestId, providerId: 'unsafe-video',
          asset: { id: 'unsafe', source: 'LOCAL', uri: 'local://unsafe' },
          warnings: [], outputStatus: 'APPROVED',
        };
      },
    } as unknown as VideoProvider;
    expect(await createVideoGenerationService({ providers: [unsafe] }).generate(value.request))
      .toMatchObject({ status: 'FAILURE', errorCode: 'PROVIDER_EXECUTION_ERROR' });
  });
});

describe('official image to video temporal safety', () => {
  it('runs candidate generation, PASS validation, explicit approval and MANUAL_READY for Stage A', async () => {
    const state = snapshot('a');
    const action = physicalAction('a');
    const image = await validatedOfficialImage(state);
    expect(image.validation.verdict).toBe('PASS');
    expect(image.eligibility).toMatchObject({ eligible: true, reason: 'PASS' });
    expect(image.reference.asset.id).toBe(
      image.result.status === 'SUCCESS' ? image.result.asset.id : undefined,
    );

    const built = unwrapSpec(createCanonicalAnimationPromptSpec({
      physicalAction: action,
      snapshot: state,
      source: image.reference,
      output: { durationSeconds: 8 },
    }));
    const request = createVideoGenerationRequest({
      providerId: 'manual-video', canonicalAnimationSpec: built.spec, source: built.source,
    });
    const result = await createVideoGenerationService({ providers: [createManualVideoProvider()] })
      .generate(request);

    expect(result).toMatchObject({
      status: 'MANUAL_READY',
      outputStatus: 'UNREVIEWED',
      package: { sourceImage: { id: image.reference.asset.id } },
    });
    expect(request.canonicalAnimationSpec.motion.primaryAction).toEqual(action.primaryAction);
    expect(request.temporalIdentity).toMatchObject({
      projectId: 'project-a', sceneId: 'scene-a', stageId: 'stage-a',
      operationId: 'operation-a', snapshotId: state.id,
    });
  });

  it('binds video A to official image A', async () => {
    const videoA = await fixture('a');
    expect(videoA.request.sourceImage.id).toBe(videoA.reference.asset.id);
    expect(videoA.request.temporalIdentity.stageId).toBe('stage-a');
  });

  it('binds video B to official image B instead of reusing A', async () => {
    const videoA = await fixture('a');
    const videoB = await fixture('b');
    expect(videoB.request.sourceImage.id).toBe(videoB.reference.asset.id);
    expect(videoB.request.sourceImage.id).not.toBe(videoA.reference.asset.id);
    expect(videoB.request.temporalIdentity.stageId).toBe('stage-b');
  });

  it('does not auto-approve video or mutate visual memory', async () => {
    const value = await fixture();
    const memory = createVisualReferenceMemory([value.reference]);
    const before = structuredClone(memory.records);
    await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(value.request);
    expect(memory.records).toEqual(before);
  });

  it('does not mutate WorldState, Stage, StageTransaction or source inputs', async () => {
    const value = await fixture();
    const worldState = Object.freeze({ progress: 25, existingComponents: ['component-a'] });
    const stage = Object.freeze({ id: 'stage-a', decision: Object.freeze({ status: 'PASS' }) });
    const transaction = Object.freeze({ status: 'COMMITTED', worldState });
    const before = structuredClone({ worldState, stage, transaction, request: value.request });
    await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(value.request);
    expect({ worldState, stage, transaction, request: value.request }).toEqual(before);
  });

  it('requires no network, API key or paid provider', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const manual = await fixture('a', 'manual-video');
    const mock = await fixture('a', 'mock-video');
    await createVideoGenerationService({ providers: [createManualVideoProvider()] }).generate(manual.request);
    await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(mock.request);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

async function manualCompletionFixture(label: Label = 'a') {
  const value = await fixture(label, 'manual-video');
  const manualReady = await createVideoGenerationService({ providers: [createManualVideoProvider()] })
    .generate(value.request);
  if (manualReady.status !== 'MANUAL_READY') throw new Error('Expected MANUAL_READY fixture.');
  const submission: ManualVideoSubmission = {
    submissionId: `video-submission-${label}`,
    requestId: value.request.requestId,
    asset: {
      id: `completed-video-${label}`,
      source: 'IMPORTED',
      uri: `file:///videos/completed-video-${label}.mp4`,
      mimeType: 'video/mp4',
      checksum: `sha256-video-${label}`,
      durationSeconds: value.request.durationSeconds,
      metadata: { containsVideoBytes: false },
    },
    submittedAt: label === 'a' ? 1_000 : 2_000,
    metadata: { submittedBy: 'user' },
  };
  return { ...value, manualReady, submission };
}

describe('manual video completion bridge', () => {
  it('completes MANUAL_READY with a valid submission as unreviewed SUCCESS', async () => {
    const value = await manualCompletionFixture();
    const result = completeManualVideoGeneration({
      request: value.request,
      manualReadyResult: value.manualReady,
      submission: value.submission,
    });
    expect(result).toMatchObject({
      status: 'SUCCESS',
      requestId: value.request.requestId,
      providerId: 'manual-video',
      asset: { id: 'completed-video-a', uri: 'file:///videos/completed-video-a.mp4' },
      outputStatus: 'UNREVIEWED',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves official source image and temporal identity from the request', async () => {
    const value = await manualCompletionFixture();
    const result = completeManualVideoGeneration({
      request: value.request,
      manualReadyResult: value.manualReady,
      submission: value.submission,
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.providerMetadata).toMatchObject({
      sourceReferenceId: value.request.source.referenceId,
      sourceImageAssetId: value.request.sourceImage.id,
      temporalIdentity: value.request.temporalIdentity,
    });
    expect(value.manualReady.package.sourceImage).toEqual(value.request.sourceImage);
  });

  it('rejects submission B for request and MANUAL_READY A', async () => {
    const a = await manualCompletionFixture('a');
    const b = await manualCompletionFixture('b');
    expect(completeManualVideoGeneration({
      request: a.request, manualReadyResult: a.manualReady, submission: b.submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_REQUEST_ID_MISMATCH',
    });
  });

  it('rejects MANUAL_READY B for request and submission A', async () => {
    const a = await manualCompletionFixture('a');
    const b = await manualCompletionFixture('b');
    expect(completeManualVideoGeneration({
      request: a.request, manualReadyResult: b.manualReady, submission: a.submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_REQUEST_ID_MISMATCH',
    });
  });

  it.each([
    { field: 'submissionId', value: '' },
    { field: 'submissionId', value: '   ' },
    { field: 'requestId', value: '' },
    { field: 'requestId', value: '\t  ' },
  ] as const)('rejects invalid submission $field=$value', async ({ field, value: invalidValue }) => {
    const value = await manualCompletionFixture();
    const submission = { ...structuredClone(value.submission), [field]: invalidValue };
    expect(completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_SUBMISSION',
    });
  });

  it.each([
    { name: 'empty id', asset: { id: '' } },
    { name: 'whitespace id', asset: { id: '   ' } },
    { name: 'empty uri', asset: { uri: '' } },
    { name: 'whitespace uri', asset: { uri: '  \t' } },
    { name: 'mock asset', asset: { source: 'MOCK' as const } },
    { name: 'embedded data', asset: { uri: 'data:video/mp4;base64,AAAA' } },
    { name: 'non-video mime', asset: { mimeType: 'image/png' } },
    { name: 'whitespace mime', asset: { mimeType: '   ' } },
    { name: 'whitespace checksum', asset: { checksum: '  ' } },
  ])('rejects invalid manual video asset: $name', async ({ asset }) => {
    const value = await manualCompletionFixture();
    const submission = {
      ...structuredClone(value.submission),
      asset: { ...structuredClone(value.submission.asset), ...asset },
    } as ManualVideoSubmission;
    expect(completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission,
    })).toMatchObject({ status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_ASSET' });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid optional asset duration %s',
    async durationSeconds => {
      const value = await manualCompletionFixture();
      const submission: ManualVideoSubmission = {
        ...structuredClone(value.submission),
        asset: { ...structuredClone(value.submission.asset), durationSeconds },
      };
      expect(completeManualVideoGeneration({
        request: value.request, manualReadyResult: value.manualReady, submission,
      })).toMatchObject({
        status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_DURATION',
      });
    },
  );

  it('rejects FAILURE and unknown results instead of throwing', async () => {
    const value = await manualCompletionFixture();
    const failure: VideoGenerationResult = {
      status: 'FAILURE', requestId: value.request.requestId, providerId: value.request.providerId,
      errorCode: 'EXTERNAL_FAILURE', message: 'failed', retryable: false,
    };
    const unknown = { ...failure, status: 'UNKNOWN' } as unknown as VideoGenerationResult;
    for (const manualReadyResult of [failure, unknown]) {
      expect(completeManualVideoGeneration({
        request: value.request, manualReadyResult, submission: value.submission,
      })).toMatchObject({
        status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_RESULT_STATUS',
      });
    }
  });

  it('rejects a SUCCESS result, including a previously completed result', async () => {
    const value = await manualCompletionFixture();
    const completed = completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    expect(completed.status).toBe('SUCCESS');
    expect(completeManualVideoGeneration({
      request: value.request, manualReadyResult: completed, submission: value.submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_RESULT_STATUS',
    });
  });

  it('rejects a MOCK result from manual completion', async () => {
    const value = await fixture('a', 'mock-video');
    const mock = await createVideoGenerationService({ providers: [createDeterministicMockVideoProvider()] })
      .generate(value.request);
    const manual = await manualCompletionFixture();
    expect(completeManualVideoGeneration({
      request: value.request, manualReadyResult: mock, submission: manual.submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_INVALID_RESULT_STATUS',
    });
  });

  it('rejects MANUAL_READY carrying a non-manual provider kind or provider id', async () => {
    const value = await manualCompletionFixture();
    const wrongKind = {
      ...structuredClone(value.manualReady),
      providerMetadata: { providerKind: 'MOCK' },
    } as VideoGenerationResult;
    const wrongId = {
      ...structuredClone(value.manualReady),
      providerId: 'other-manual-video',
    } as VideoGenerationResult;
    for (const manualReadyResult of [wrongKind, wrongId]) {
      expect(completeManualVideoGeneration({
        request: value.request, manualReadyResult, submission: value.submission,
      })).toMatchObject({
        status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_PROVIDER_MISMATCH',
      });
    }
  });

  it('rejects a manual package that swaps the official source image', async () => {
    const a = await manualCompletionFixture('a');
    const b = await manualCompletionFixture('b');
    const swapped = {
      ...structuredClone(a.manualReady),
      package: {
        ...structuredClone(a.manualReady.package),
        sourceImage: structuredClone(b.request.sourceImage),
      },
    } as VideoGenerationResult;
    expect(completeManualVideoGeneration({
      request: a.request, manualReadyResult: swapped, submission: a.submission,
    })).toMatchObject({
      status: 'FAILURE', errorCode: 'MANUAL_COMPLETION_REQUEST_ID_MISMATCH',
    });
  });

  it('is deterministic and does not use submittedAt as completed asset identity', async () => {
    const value = await manualCompletionFixture();
    const first = completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    const second = completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    const later = completeManualVideoGeneration({
      request: value.request,
      manualReadyResult: value.manualReady,
      submission: { ...value.submission, submittedAt: value.submission.submittedAt + 1 },
    });
    expect(first).toEqual(second);
    expect(later).toMatchObject({
      status: 'SUCCESS', requestId: value.request.requestId, asset: value.submission.asset,
    });
  });

  it('does not mutate request, MANUAL_READY, submission, spec, source or snapshot inputs', async () => {
    const value = await manualCompletionFixture();
    const before = structuredClone({
      request: value.request,
      manualReady: value.manualReady,
      submission: value.submission,
      spec: value.spec,
      source: value.source,
      snapshot: value.state,
      action: value.action,
    });
    completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    expect({
      request: value.request,
      manualReady: value.manualReady,
      submission: value.submission,
      spec: value.spec,
      source: value.source,
      snapshot: value.state,
      action: value.action,
    }).toEqual(before);
  });

  it('completes official image A as video A and official image B as video B', async () => {
    const a = await manualCompletionFixture('a');
    const b = await manualCompletionFixture('b');
    const completedA = completeManualVideoGeneration({
      request: a.request, manualReadyResult: a.manualReady, submission: a.submission,
    });
    const completedB = completeManualVideoGeneration({
      request: b.request, manualReadyResult: b.manualReady, submission: b.submission,
    });
    expect(completedA).toMatchObject({
      status: 'SUCCESS', requestId: a.request.requestId,
      asset: { id: 'completed-video-a' },
      providerMetadata: {
        sourceImageAssetId: a.reference.asset.id,
        temporalIdentity: { stageId: 'stage-a' },
      },
    });
    expect(completedB).toMatchObject({
      status: 'SUCCESS', requestId: b.request.requestId,
      asset: { id: 'completed-video-b' },
      providerMetadata: {
        sourceImageAssetId: b.reference.asset.id,
        temporalIdentity: { stageId: 'stage-b' },
      },
    });
    expect(completedA.requestId).not.toBe(completedB.requestId);
  });

  it('does not auto-approve or mutate visual memory and domain sentinels', async () => {
    const value = await manualCompletionFixture();
    const memory = createVisualReferenceMemory([value.reference]);
    const worldState = Object.freeze({ progress: 25, existingComponents: ['component-a'] });
    const stage = Object.freeze({ id: 'stage-a', decision: Object.freeze({ status: 'PASS' }) });
    const before = structuredClone({ records: memory.records, worldState, stage });
    const result = completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    expect({ records: memory.records, worldState, stage }).toEqual(before);
    expect(result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
    expect(result).not.toHaveProperty('approvalStatus');
  });

  it('completes offline without API key or paid provider', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const value = await manualCompletionFixture();
    const result = completeManualVideoGeneration({
      request: value.request, manualReadyResult: value.manualReady, submission: value.submission,
    });
    expect(result.status).toBe('SUCCESS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
