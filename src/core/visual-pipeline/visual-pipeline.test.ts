import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhysicalActionIR } from '../actions/physical-action-ir';
import {
  createDeterministicMockImageProvider,
  createImageGenerationService,
  createManualImageProvider,
  type ManualImageSubmission,
} from '../image-generation';
import {
  createDeterministicMockVideoProvider,
  createManualVideoProvider,
  createVideoGenerationService,
  type ManualVideoSubmission,
} from '../video-generation';
import {
  createDeterministicMockVideoObservationProvider,
  createManualVideoObservationProvider,
  type VideoObservationProvider,
} from '../video-validation';
import { createVisualReferenceMemory, type VisualReferenceMemory } from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import {
  createDeterministicMockVisualObservationProvider,
  createManualVisualObservationProvider,
  type VisualObservationProvider,
} from '../visual-validation';
import {
  createVisualPipelineOrchestrator,
  type StartVisualPipelineInput,
  type VisualPipelineOrchestrator,
  type VisualPipelineRun,
  type VisualPipelineStepResult,
} from './index';

afterEach(() => vi.unstubAllGlobals());

type Label = 'a' | 'b';

function snapshot(label: Label, projectId = 'project-a'): VisualStateSnapshot {
  const second = label === 'b';
  const target = `component-${label}`;
  const completed = second
    ? ['foundation', 'component-a', 'component-b']
    : ['foundation', 'component-a'];
  const future = second ? ['roof'] : ['component-b', 'roof'];
  return {
    id: `snapshot-${projectId}-${label}`,
    kind: 'OFFICIAL',
    temporalPoint: 'AFTER',
    stageOutcome: 'COMMITTED',
    worldStateSource: 'CANDIDATE',
    identity: {
      projectId,
      visualDNAId: 'visual-dna-1',
      sceneId: 'scene-main',
      stageId: `stage-${label}`,
      operationId: `operation-${label}`,
      progress: second ? 50 : 25,
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
      progress: second ? 50 : 25,
      visibleComponents: completed,
      completedComponents: completed,
      partialComponents: [],
      activeComponent: target,
      targetState: 'COMPLETE',
      pendingComponents: future,
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: second ? 7 : 8, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [{ materialId: 'wood', quantity: second ? 2 : 1, location: 'Z1' }],
    },
    space: {
      activeZone: 'Z1',
      stateZone: 'Z1',
      relevantZones: [{
        id: 'Z1', name: 'Work zone', type: 'AREA', orientation: 'north',
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
        position: { x: 12, y: 18 }, target: { x: 45, y: 40 },
        fov: 52, aspectRatio: 16 / 9, movement: 'FIXA',
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
      materialQuantityChanges: [{
        materialId: 'wood', before: second ? 8 : 9, after: second ? 7 : 8,
      }],
    },
  };
}

function physicalAction(label: Label): PhysicalActionIR {
  const second = label === 'b';
  const target = `component-${label}`;
  return {
    id: `physical-action:${label}`,
    sceneId: 'scene-main',
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
      constructionProgress: { before: second ? 25 : 0, after: second ? 50 : 25 },
      targetStatus: { before: 'PARTIAL', after: 'COMPLETE' },
      actorZone: { before: 'Z1', after: 'Z1' },
      materialQuantityChanges: [{
        materialId: 'wood', before: second ? 8 : 9, after: second ? 7 : 8,
      }],
      newlyCompletedComponents: [target],
      newlyPartialComponents: [],
    },
    before: {
      targetStatus: 'PARTIAL', constructionProgress: second ? 25 : 0,
      actorZone: 'Z1', materialQuantities: { wood: second ? 8 : 9 },
    },
    after: {
      targetStatus: 'COMPLETE', constructionProgress: second ? 50 : 25,
      actorZone: 'Z1', materialQuantities: { wood: second ? 7 : 8 },
    },
    constraints: {
      preserveActorId: 'builder-1',
      allowedZone: 'Z1',
      preserveComponents: second ? ['foundation', 'component-a'] : ['foundation'],
      preserveZones: ['Z1'],
      forbiddenFutureComponents: ['roof'],
      preventPrematureElements: second ? [] : ['component-b'],
    },
    evidence: [`${target} reaches complete status`],
  };
}

function startInput(
  label: Label,
  memory: VisualReferenceMemory = createVisualReferenceMemory(),
  imageProviderId = 'manual-image',
  videoProviderId = 'manual-video',
  projectId = 'project-a',
): StartVisualPipelineInput {
  return {
    physicalAction: physicalAction(label),
    snapshot: snapshot(label, projectId),
    memory,
    image: {
      providerId: imageProviderId,
      temporalPosition: { sceneOrder: 0, stageOrder: label === 'a' ? 0 : 1 },
      resolution: { width: 1280, height: 720 },
    },
    video: {
      providerId: videoProviderId,
      durationSeconds: 8,
      resolution: { width: 1280, height: 720 },
    },
  };
}

function orchestrator(options: {
  imageObservers?: readonly VisualObservationProvider[];
  videoObservers?: readonly VideoObservationProvider[];
  maxImageAttempts?: number;
  maxVideoAttempts?: number;
} = {}): VisualPipelineOrchestrator {
  return createVisualPipelineOrchestrator({
    imageGenerationService: createImageGenerationService({
      providers: [createManualImageProvider('manual-image'), createDeterministicMockImageProvider('mock-image')],
    }),
    videoGenerationService: createVideoGenerationService({
      providers: [createManualVideoProvider('manual-video'), createDeterministicMockVideoProvider('mock-video')],
    }),
    imageObservationProviders: options.imageObservers ?? [
      createDeterministicMockVisualObservationProvider('COHERENT', 'image-pass'),
      createDeterministicMockVisualObservationProvider('FUTURE_ELEMENT', 'image-fail'),
      createDeterministicMockVisualObservationProvider('MINOR_DIVERGENCE', 'image-warn'),
      createDeterministicMockVisualObservationProvider('INSUFFICIENT', 'image-insufficient'),
    ],
    videoObservationProviders: options.videoObservers ?? [
      createDeterministicMockVideoObservationProvider('COHERENT', 'video-pass'),
      createDeterministicMockVideoObservationProvider('FUTURE_ACTION', 'video-fail'),
      createDeterministicMockVideoObservationProvider('MINOR_CAMERA', 'video-warn'),
      createDeterministicMockVideoObservationProvider('INSUFFICIENT', 'video-insufficient'),
    ],
    maxImageAttempts: options.maxImageAttempts,
    maxVideoAttempts: options.maxVideoAttempts,
  });
}

function unwrap(result: VisualPipelineStepResult): VisualPipelineRun {
  if (result.status !== 'SUCCESS') throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.run;
}

function imageSubmission(run: VisualPipelineRun, suffix = 'a'): ManualImageSubmission {
  return {
    submissionId: `image-submission-${suffix}`,
    requestId: run.imageState.request.requestId,
    asset: {
      id: `manual-image-${suffix}`,
      source: 'MANUAL',
      uri: `local://images/${suffix}.png`,
      mimeType: 'image/png',
    },
    submittedAt: 100,
  };
}

function videoSubmission(run: VisualPipelineRun, suffix = 'a'): ManualVideoSubmission {
  return {
    submissionId: `video-submission-${suffix}`,
    requestId: run.videoState!.request.requestId,
    asset: {
      id: `manual-video-${suffix}`,
      source: 'MANUAL',
      uri: `local://videos/${suffix}.mp4`,
      mimeType: 'video/mp4',
      durationSeconds: 8,
    },
    submittedAt: 200,
  };
}

async function approveMockImage(
  flow: VisualPipelineOrchestrator,
  label: Label,
  memory = createVisualReferenceMemory(),
): Promise<VisualPipelineRun> {
  let run = unwrap(flow.start(startInput(label, memory, 'mock-image', 'mock-video')));
  run = unwrap(await flow.generateImage(run));
  run = unwrap(await flow.validateImage(run, 'image-pass'));
  return unwrap(flow.approveImage(run, { recordedAt: label === 'a' ? 100 : 200 }));
}

async function reachVideoValidation(
  flow: VisualPipelineOrchestrator,
  label: Label = 'a',
): Promise<VisualPipelineRun> {
  let run = await approveMockImage(flow, label);
  run = unwrap(flow.prepareVideo(run));
  return unwrap(await flow.generateVideo(run));
}

describe('VisualPipelineOrchestrator end-to-end', () => {
  it('runs the first stage manual image and video flow with pause/resume and no invented reference', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput('a')));
    const initialRun = run;
    expect(run.imageState.previousOfficialReference).toBeUndefined();
    expect(run.imageState.request.references).toEqual([]);

    run = unwrap(await flow.generateImage(run));
    expect(initialRun.currentPhase).toBe('IMAGE_REQUEST_READY');
    expect(Object.isFrozen(initialRun)).toBe(true);
    expect(run.currentPhase).toBe('IMAGE_MANUAL_ACTION_REQUIRED');
    expect(run.requiredAction?.type).toBe('GENERATE_IMAGE_EXTERNALLY');
    const submission = imageSubmission(run);
    const submitted = unwrap(flow.submitImage(run, submission));
    expect(unwrap(flow.submitImage(submitted, submission))).toBe(submitted);
    run = submitted;

    run = unwrap(await flow.validateImage(run, 'image-pass'));
    expect(run.currentPhase).toBe('IMAGE_APPROVAL_REQUIRED');
    expect(run.memory.records).toHaveLength(0);
    run = unwrap(flow.approveImage(run, { recordedAt: 100 }));
    expect(run.currentPhase).toBe('IMAGE_APPROVED');
    expect(run.memory.records).toHaveLength(1);

    run = unwrap(flow.prepareVideo(run));
    expect(run.videoState?.request.sourceImage.id).toBe(run.imageState.officialReference?.asset.id);
    run = unwrap(await flow.generateVideo(run));
    expect(run.currentPhase).toBe('VIDEO_MANUAL_ACTION_REQUIRED');
    expect(run.requiredAction?.type).toBe('GENERATE_VIDEO_EXTERNALLY');
    const submittedVideo = videoSubmission(run);
    const resumed = unwrap(flow.submitVideo(run, submittedVideo));
    expect(unwrap(flow.submitVideo(resumed, submittedVideo))).toBe(resumed);
    run = unwrap(await flow.validateVideo(resumed, 'video-pass'));
    expect(run.currentPhase).toBe('VIDEO_ACCEPTANCE_REQUIRED');
    run = unwrap(flow.acceptVideo(run));
    expect(run.currentPhase).toBe('COMPLETED');
    expect(run.videoState?.result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
  });

  it('runs Stage A then Stage B with official A continuity, B1/image retry and V1/video retry', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const flow = orchestrator();
    let stageA = await approveMockImage(flow, 'a');
    const memoryBeforeAApproval = createVisualReferenceMemory();
    expect(memoryBeforeAApproval.records).toHaveLength(0);
    stageA = unwrap(flow.prepareVideo(stageA));
    stageA = unwrap(await flow.generateVideo(stageA));
    stageA = unwrap(await flow.validateVideo(stageA, 'video-pass'));
    stageA = unwrap(flow.acceptVideo(stageA));
    expect(stageA.currentPhase).toBe('COMPLETED');

    let stageB = unwrap(flow.start(startInput('b', stageA.memory, 'mock-image', 'mock-video')));
    const officialA = stageA.imageState.officialReference!;
    expect(stageB.imageState.previousOfficialReference?.id).toBe(officialA.id);
    expect(stageB.imageState.request.references.map(reference => reference.asset.id)).toEqual([
      officialA.asset.id,
    ]);
    stageB = unwrap(await flow.generateImage(stageB));
    const imageB1Result = stageB.imageState.result;
    const imageB1 = imageB1Result?.status === 'SUCCESS' ? imageB1Result.asset.id : '';
    stageB = unwrap(await flow.validateImage(stageB, 'image-fail'));
    expect(stageB.currentPhase).toBe('IMAGE_CORRECTION_REQUIRED');
    stageB = unwrap(flow.retryImage(stageB));
    expect(unwrap(flow.retryImage(stageB))).toBe(stageB);
    expect(stageB.retryInfo.imageAttempt).toBe(2);
    expect(stageB.imageState.history[0].result).toMatchObject({ status: 'SUCCESS' });
    stageB = unwrap(await flow.generateImage(stageB));
    stageB = unwrap(await flow.validateImage(stageB, 'image-pass'));
    stageB = unwrap(flow.approveImage(stageB, { recordedAt: 200 }));
    const officialB2 = stageB.imageState.officialReference!;
    expect(officialB2.asset.id).not.toBe(imageB1);
    expect(stageB.memory.records.map(record => record.asset.id)).toEqual([
      officialA.asset.id,
      officialB2.asset.id,
    ]);

    stageB = unwrap(flow.prepareVideo(stageB));
    expect(stageB.videoState?.request.sourceImage.id).toBe(officialB2.asset.id);
    stageB = unwrap(await flow.generateVideo(stageB));
    const videoV1 = stageB.videoState!.request.requestId;
    stageB = unwrap(await flow.validateVideo(stageB, 'video-fail'));
    stageB = unwrap(flow.retryVideo(stageB));
    expect(unwrap(flow.retryVideo(stageB))).toBe(stageB);
    expect(stageB.videoState?.request.requestId).not.toBe(videoV1);
    expect(stageB.videoState?.request.sourceImage.id).toBe(officialB2.asset.id);
    expect(stageB.videoState?.request.temporalIdentity.stageId).toBe('stage-b');
    expect(stageB.videoState?.request.canonicalAnimationSpec.identity.physicalActionIRId)
      .toBe(stageB.physicalAction.id);
    stageB = unwrap(await flow.generateVideo(stageB));
    stageB = unwrap(await flow.validateVideo(stageB, 'video-pass'));
    stageB = unwrap(flow.acceptVideo(stageB));
    expect(stageB.currentPhase).toBe('COMPLETED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('supports B1 FAIL, B2 FAIL, B3 PASS without making failed candidates official', async () => {
    const flow = orchestrator({ maxImageAttempts: 3 });
    let run = unwrap(flow.start(startInput('b', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    const failedAssets: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      run = unwrap(await flow.generateImage(run));
      failedAssets.push((run.imageState.result as { asset: { id: string } }).asset.id);
      run = unwrap(await flow.validateImage(run, 'image-fail'));
      run = unwrap(flow.retryImage(run));
    }
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'image-pass'));
    run = unwrap(flow.approveImage(run, { recordedAt: 300 }));
    expect(run.retryInfo.imageAttempt).toBe(3);
    expect(run.imageState.history).toHaveLength(2);
    expect(failedAssets).not.toContain(run.imageState.officialReference?.asset.id);
    expect(run.memory.records).toHaveLength(1);
  });

  it('keeps VisualStateSnapshot and PhysicalActionIR inputs unchanged through a full cycle', async () => {
    const flow = orchestrator();
    const input = startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video');
    const before = structuredClone({ action: input.physicalAction, snapshot: input.snapshot });
    let run = unwrap(flow.start(input));
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'image-pass'));
    run = unwrap(flow.approveImage(run, { recordedAt: 100 }));
    run = unwrap(flow.prepareVideo(run));
    run = unwrap(await flow.generateVideo(run));
    run = unwrap(await flow.validateVideo(run, 'video-pass'));
    run = unwrap(flow.acceptVideo(run));
    expect({ action: input.physicalAction, snapshot: input.snapshot }).toEqual(before);
    expect(run.memory).not.toBe(input.memory);
    expect(input.memory.records).toEqual([]);
  });

  it('runs provider-neutral manual image and video observation evidence offline', async () => {
    const manualImageObserver = createManualVisualObservationProvider({
      id: 'manual-image-observer',
      evidenceId: 'manual-image-evidence-a',
      observedAt: 10,
      observation: {
        coverage: 'SUFFICIENT',
        detectedElements: ['component-a', 'foundation'],
        missingElements: [],
        unexpectedElements: [],
        characterConsistency: 'MATCH',
        clothingConsistency: 'MATCH',
        environmentConsistency: 'MATCH',
        constructionConsistency: 'MATCH',
        materialConsistency: 'MATCH',
        geometryConsistency: 'MATCH',
        previousOfficialContinuity: 'NOT_APPLICABLE',
        temporalAnomalies: [],
        notes: ['reviewed manually'],
      },
    });
    const manualVideoObserver = createManualVideoObservationProvider({
      id: 'manual-video-observer',
      evidenceId: 'manual-video-evidence-a',
      observedAt: 20,
      observation: {
        coverage: 'SUFFICIENT',
        observedPrimaryAction: 'install component-a',
        unexpectedActions: [],
        missingActions: [],
        futureActions: [],
        characterConsistency: 'MATCH',
        clothingConsistency: 'MATCH',
        environmentConsistency: 'MATCH',
        constructionConsistency: 'MATCH',
        materialConsistency: 'MATCH',
        cameraConsistency: 'MATCH',
        sourceFrameConsistency: 'MATCH',
        motionQuality: 'ACCEPTABLE',
        temporalAnomalies: [],
        durationObserved: 8,
        notes: ['reviewed manually'],
      },
    });
    const flow = orchestrator({
      imageObservers: [manualImageObserver],
      videoObservers: [manualVideoObserver],
    });
    let run = unwrap(flow.start(startInput(
      'a', createVisualReferenceMemory(), 'mock-image', 'mock-video',
    )));
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'manual-image-observer'));
    expect(run.imageState.validation?.verdict).toBe('PASS');
    run = unwrap(flow.approveImage(run, { recordedAt: 30 }));
    run = unwrap(flow.prepareVideo(run));
    run = unwrap(await flow.generateVideo(run));
    run = unwrap(await flow.validateVideo(run, 'manual-video-observer'));
    expect(run.videoState?.validation?.verdict).toBe('PASS');
    expect(unwrap(flow.acceptVideo(run)).currentPhase).toBe('COMPLETED');
  });
});

describe('warnings, retry policy and explicit authority gates', () => {
  it('does not auto-approve an image WARN and requires acknowledgement plus explicit approval', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'image-warn'));
    expect(run.requiredAction?.type).toBe('ACKNOWLEDGE_IMAGE_WARNING');
    expect(run.memory.records).toHaveLength(0);
    const premature = flow.approveImage(run, { recordedAt: 100 });
    expect(premature).toMatchObject({ status: 'FAILURE', error: { code: 'MISSING_REQUIRED_APPROVAL' } });
    run = unwrap(flow.acknowledgeImageWarning(run));
    expect(run.requiredAction?.type).toBe('APPROVE_IMAGE');
    run = unwrap(flow.approveImage(run, { recordedAt: 100 }));
    expect(run.memory.records).toHaveLength(1);
  });

  it('does not auto-accept a video WARN and requires acknowledgement plus explicit acceptance', async () => {
    const flow = orchestrator();
    let run = await reachVideoValidation(flow);
    run = unwrap(await flow.validateVideo(run, 'video-warn'));
    expect(run.requiredAction?.type).toBe('ACKNOWLEDGE_VIDEO_WARNING');
    const premature = flow.acceptVideo(run);
    expect(premature).toMatchObject({ status: 'FAILURE', error: { code: 'MISSING_REQUIRED_APPROVAL' } });
    run = unwrap(flow.acknowledgeVideoWarning(run));
    run = unwrap(flow.acceptVideo(run));
    expect(run.currentPhase).toBe('COMPLETED');
  });

  it('keeps insufficient image and video evidence in revalidation instead of blind retry', async () => {
    const flow = orchestrator();
    let imageRun = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    imageRun = unwrap(await flow.generateImage(imageRun));
    imageRun = unwrap(await flow.validateImage(imageRun, 'image-insufficient'));
    expect(imageRun.currentPhase).toBe('IMAGE_VALIDATION_REQUIRED');
    expect(imageRun.requiredAction?.type).toBe('PROVIDE_IMAGE_EVIDENCE');
    expect(flow.retryImage(imageRun)).toMatchObject({
      status: 'FAILURE', error: { code: 'INVALID_RUN_STATE' },
    });

    let videoRun = await reachVideoValidation(flow);
    videoRun = unwrap(await flow.validateVideo(videoRun, 'video-insufficient'));
    expect(videoRun.currentPhase).toBe('VIDEO_VALIDATION_REQUIRED');
    expect(videoRun.requiredAction?.type).toBe('PROVIDE_VIDEO_EVIDENCE');
    expect(flow.retryVideo(videoRun)).toMatchObject({
      status: 'FAILURE', error: { code: 'INVALID_RUN_STATE' },
    });
  });

  it('allows an explicit WARN image retry without approving the warned candidate', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    run = unwrap(await flow.generateImage(run));
    const warnedAsset = (run.imageState.result as { asset: { id: string } }).asset.id;
    run = unwrap(await flow.validateImage(run, 'image-warn'));
    run = unwrap(flow.retryImage(run));
    expect(run.currentPhase).toBe('IMAGE_REQUEST_READY');
    expect(run.memory.records).toHaveLength(0);
    expect(run.imageState.history[0].result).toMatchObject({ asset: { id: warnedAsset } });
  });

  it('enforces image and video retry limits without loops', async () => {
    const flow = orchestrator({ maxImageAttempts: 1, maxVideoAttempts: 1 });
    let imageRun = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    imageRun = unwrap(await flow.generateImage(imageRun));
    imageRun = unwrap(await flow.validateImage(imageRun, 'image-fail'));
    const imageRetry = flow.retryImage(imageRun);
    expect(imageRetry).toMatchObject({
      status: 'FAILURE', error: { code: 'RETRY_EXHAUSTED' },
      run: { currentPhase: 'FAILED' },
    });

    let videoRun = await reachVideoValidation(flow);
    videoRun = unwrap(await flow.validateVideo(videoRun, 'video-fail'));
    const videoRetry = flow.retryVideo(videoRun);
    expect(videoRetry).toMatchObject({
      status: 'FAILURE', error: { code: 'RETRY_EXHAUSTED' },
      run: { currentPhase: 'FAILED' },
    });
  });
});

describe('binding, determinism, idempotency and structured failures', () => {
  it('creates a deterministic run id and stable initial request for equal semantics', () => {
    const flow = orchestrator();
    const first = unwrap(flow.start(startInput('a')));
    const second = unwrap(flow.start(startInput('a')));
    expect(first.runId).toBe(second.runId);
    expect(first.imageState.request.requestId).toBe(second.imageState.request.requestId);
  });

  it('rejects a PhysicalActionIR from another stage before creating a run', () => {
    const flow = orchestrator();
    const input = startInput('a');
    const wrong = { ...input, physicalAction: physicalAction('b') };
    expect(flow.start(wrong)).toMatchObject({
      status: 'FAILURE', error: { code: 'TEMPORAL_BINDING_MISMATCH' },
    });
  });

  it('rejects a Stage B image submission in the paused Stage A run', async () => {
    const flow = orchestrator();
    let runA = unwrap(flow.start(startInput('a')));
    runA = unwrap(await flow.generateImage(runA));
    const runB = unwrap(flow.start(startInput('b')));
    const submission = imageSubmission(runA);
    const wrong = { ...submission, requestId: runB.imageState.request.requestId };
    expect(flow.submitImage(runA, wrong)).toMatchObject({
      status: 'FAILURE', error: { code: 'WRONG_SUBMISSION' },
      run: { currentPhase: 'IMAGE_MANUAL_ACTION_REQUIRED' },
    });
  });

  it('rejects an invalid manual asset without advancing the paused run', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput('a')));
    run = unwrap(await flow.generateImage(run));
    const invalid = imageSubmission(run);
    const result = flow.submitImage(run, {
      ...invalid,
      asset: { ...invalid.asset, id: '   ' },
    });
    expect(result).toMatchObject({
      status: 'FAILURE', error: { code: 'WRONG_ASSET' },
      run: { currentPhase: 'IMAGE_MANUAL_ACTION_REQUIRED' },
    });
  });

  it('rejects a video asset submission bound to another request', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput(
      'a', createVisualReferenceMemory(), 'mock-image', 'manual-video',
    )));
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'image-pass'));
    run = unwrap(flow.approveImage(run, { recordedAt: 100 }));
    run = unwrap(flow.prepareVideo(run));
    const stageARequest = run.videoState!.request.requestId;
    run = unwrap(await flow.generateVideo(run));
    const wrong = { ...videoSubmission(run), requestId: `${stageARequest}:other-stage` };
    expect(flow.submitVideo(run, wrong)).toMatchObject({
      status: 'FAILURE', error: { code: 'WRONG_SUBMISSION' },
    });
  });

  it('blocks cross-project reference reuse while keeping same-project prior continuity', async () => {
    const flow = orchestrator();
    const stageA = await approveMockImage(flow, 'a');
    const otherProject = unwrap(flow.start(startInput(
      'b', stageA.memory, 'mock-image', 'mock-video', 'project-b',
    )));
    expect(otherProject.imageState.previousOfficialReference).toBeUndefined();
    expect(otherProject.imageState.request.references).toEqual([]);
  });

  it('converts wrong evidence binding into a structured pipeline failure', async () => {
    const wrongObserver: VisualObservationProvider = {
      id: 'wrong-binding',
      kind: 'MOCK',
      async observe(request) {
        const coherent = createDeterministicMockVisualObservationProvider('COHERENT');
        const evidence = await coherent.observe(request);
        return { ...evidence, requestId: `${request.requestId}:wrong` };
      },
    };
    const flow = orchestrator({ imageObservers: [wrongObserver] });
    let run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image')));
    run = unwrap(await flow.generateImage(run));
    expect(await flow.validateImage(run, 'wrong-binding')).toMatchObject({
      status: 'FAILURE', error: { code: 'VALIDATION_BINDING_MISMATCH' },
    });
  });

  it('converts unknown providers, provider failures and observer throws into structured failures', async () => {
    const throwingObserver: VisualObservationProvider = {
      id: 'throwing-observer', kind: 'MOCK',
      async observe() { throw new Error('observer unavailable'); },
    };
    const flow = orchestrator({ imageObservers: [throwingObserver] });
    let unknown = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'unknown-image')));
    expect(await flow.generateImage(unknown)).toMatchObject({
      status: 'FAILURE', error: { code: 'PROVIDER_FAILURE', causeCode: 'UNKNOWN_PROVIDER' },
      run: { currentPhase: 'FAILED' },
    });

    let run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image')));
    run = unwrap(await flow.generateImage(run));
    expect(await flow.validateImage(run, 'missing-observer')).toMatchObject({
      status: 'FAILURE', error: { code: 'UNKNOWN_OBSERVATION_PROVIDER' },
    });
    expect(await flow.validateImage(run, 'throwing-observer')).toMatchObject({
      status: 'FAILURE', error: { code: 'OBSERVATION_PROVIDER_FAILURE' },
    });
  });

  it('converts a throwing generation service into a structured provider failure', async () => {
    const flow = createVisualPipelineOrchestrator({
      imageGenerationService: {
        async generate() { throw new Error('generation service unavailable'); },
      },
      videoGenerationService: createVideoGenerationService({ providers: [] }),
      imageObservationProviders: [],
      videoObservationProviders: [],
    });
    const run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'throwing-image')));
    expect(await flow.generateImage(run)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'PROVIDER_FAILURE', causeCode: 'PROVIDER_EXECUTION_ERROR' },
      run: { currentPhase: 'FAILED' },
    });
  });

  it('makes explicit image approval and final video acceptance idempotent', async () => {
    const flow = orchestrator();
    let run = unwrap(flow.start(startInput('a', createVisualReferenceMemory(), 'mock-image', 'mock-video')));
    run = unwrap(await flow.generateImage(run));
    run = unwrap(await flow.validateImage(run, 'image-pass'));
    const approved = unwrap(flow.approveImage(run, { recordedAt: 100 }));
    const approvedAgain = unwrap(flow.approveImage(approved, { recordedAt: 999 }));
    expect(approvedAgain).toBe(approved);
    expect(approvedAgain.memory.records).toHaveLength(1);

    run = unwrap(flow.prepareVideo(approvedAgain));
    expect(unwrap(flow.prepareVideo(run))).toBe(run);
    run = unwrap(await flow.generateVideo(run));
    run = unwrap(await flow.validateVideo(run, 'video-pass'));
    const completed = unwrap(flow.acceptVideo(run));
    expect(unwrap(flow.acceptVideo(completed))).toBe(completed);
  });

  it('returns invalid-run-state failures instead of throwing or advancing phases', () => {
    const flow = orchestrator();
    const run = unwrap(flow.start(startInput('a')));
    expect(flow.approveImage(run, { recordedAt: 1 })).toMatchObject({
      status: 'FAILURE', error: { code: 'INVALID_RUN_STATE' },
      run: { currentPhase: 'IMAGE_REQUEST_READY' },
    });
    expect(flow.prepareVideo(run)).toMatchObject({
      status: 'FAILURE', error: { code: 'INVALID_RUN_STATE' },
    });
  });
});
