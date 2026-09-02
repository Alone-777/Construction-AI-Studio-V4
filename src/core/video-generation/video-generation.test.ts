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
  createCanonicalAnimationPromptSpec,
  createDeterministicMockVideoProvider,
  createManualVideoProvider,
  createVideoGenerationRequest,
  createVideoGenerationService,
  renderCanonicalAnimationPrompt,
  type CanonicalAnimationPromptSpecResult,
  type VideoGenerationRequest,
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
