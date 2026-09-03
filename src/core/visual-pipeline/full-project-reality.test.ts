import { describe, expect, it } from 'vitest';
import {
  createDeterministicMockImageProvider,
  createImageGenerationService,
  createManualImageProvider,
  type ManualImageSubmission,
} from '../image-generation';
import { createCorrectedImageGenerationRequest } from '../visual-correction';
import {
  createDeterministicMockVideoProvider,
  createManualVideoProvider,
  createVideoGenerationService,
  type ManualVideoSubmission,
} from '../video-generation';
import {
  createDeterministicMockVideoObservationProvider,
  type VideoObservationProvider,
} from '../video-validation';
import { createVisualReferenceMemory, type VisualReferenceMemory } from '../visual-reference';
import {
  createDeterministicMockVisualObservationProvider,
  createVisualValidationRequest,
  type VisualObservationProvider,
} from '../visual-validation';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import type { Project, Scene, Stage } from '../types';
import {
  createVisualPipelineOrchestrator,
  type StartVisualPipelineInput,
  type VisualPipelineOrchestrator,
  type VisualPipelineRun,
  type VisualPipelineStepResult,
} from './index';
import {
  createVisualPipelineStartDraft,
  pipelineSteps,
  requiredActionLabel,
  safePipelineError,
} from '../../components/visual-pipeline/presentation';

interface OrderedStage {
  readonly scene: Scene;
  readonly stage: Stage;
  readonly sceneOrder: number;
  readonly stageOrder: number;
}

const IMAGE_PASS = 'reality-image-pass';
const IMAGE_FAIL = 'reality-image-fail';
const IMAGE_WARN = 'reality-image-warn';
const VIDEO_PASS = 'reality-video-pass';
const VIDEO_FAIL = 'reality-video-fail';
const VIDEO_WRONG_ACTION = 'reality-video-wrong-action';

describe('full project visual reality hardening', () => {
  it('runs eight ordered stages with continuity, retries and no physical mutation', async () => {
    const project = createCabanaDoRiachoProject();
    const beforeProject = structuredClone(project);
    const stages = orderedCommittedStages(project).slice(0, 8);
    expect(stages).toHaveLength(8);
    expect(new Set(stages.map(item => item.scene.id)).size).toBeGreaterThanOrEqual(2);

    const flow = realityFlow();
    let memory = createVisualReferenceMemory();
    const officialImageIds: string[] = [];
    const failedImageIds: string[] = [];
    const videoSourceIds: string[] = [];

    for (const [index, entry] of stages.entries()) {
      assertPhysicalAndVisualTimeline(project, entry, stages[index + 1]);
      let run = unwrap(flow.start(startInput(project, entry, memory)));
      if (index === 0) {
        expect(run.imageState.previousOfficialReference).toBeUndefined();
        expect(run.imageState.request.references).toEqual([]);
      } else {
        expect(run.imageState.previousOfficialReference?.asset.id).toBe(officialImageIds[index - 1]);
        expect(run.imageState.request.references.map(reference => reference.asset.id))
          .toEqual([officialImageIds[index - 1]]);
      }

      const imageScenarios = index === 1
        ? [IMAGE_WARN]
        : index === 2
          ? [IMAGE_FAIL, IMAGE_PASS]
          : index === 5
            ? [IMAGE_FAIL, IMAGE_FAIL, IMAGE_PASS]
            : [IMAGE_PASS];
      run = unwrap(await flow.generateImage(run));
      for (const [attemptIndex, scenario] of imageScenarios.entries()) {
        if (scenario === IMAGE_FAIL && run.imageState.result?.status === 'SUCCESS') {
          failedImageIds.push(run.imageState.result.asset.id);
        }
        run = unwrap(await flow.validateImage(run, scenario));
        if (scenario === IMAGE_WARN) {
          expect(run.requiredAction?.type).toBe('ACKNOWLEDGE_IMAGE_WARNING');
          expect(run.memory.records).toHaveLength(index);
          run = unwrap(flow.acknowledgeImageWarning(run));
        } else if (scenario === IMAGE_FAIL) {
          const identity = structuredClone(run.temporalIdentity);
          run = unwrap(flow.retryImage(run));
          expect(run.temporalIdentity).toEqual(identity);
          expect(run.retryInfo.imageAttempt).toBe(attemptIndex + 2);
          run = unwrap(await flow.generateImage(run));
        }
      }
      expect(run.currentPhase).toBe('IMAGE_APPROVAL_REQUIRED');
      run = unwrap(flow.approveImage(run, { recordedAt: 1_000 + index }));
      const official = run.imageState.officialReference!;
      officialImageIds.push(official.asset.id);
      memory = run.memory;
      expect(memory.records).toHaveLength(index + 1);
      expect(failedImageIds).not.toContain(official.asset.id);

      run = unwrap(flow.prepareVideo(run));
      expect(run.videoState?.request.sourceImage.id).toBe(official.asset.id);
      expect(run.videoState?.request.temporalIdentity).toMatchObject({
        projectId: project.id,
        sceneId: entry.scene.id,
        stageId: String(entry.stage.percentage),
        operationId: entry.scene.operationId,
      });
      videoSourceIds.push(run.videoState!.request.sourceImage.id);

      const videoScenarios = index === 3
        ? [VIDEO_FAIL, VIDEO_PASS]
        : index === 6
          ? [VIDEO_FAIL, VIDEO_FAIL, VIDEO_PASS]
          : [VIDEO_PASS];
      run = unwrap(await flow.generateVideo(run));
      const originalSource = run.videoState!.request.sourceImage.id;
      const originalAction = run.videoState!.canonicalSpec.identity.physicalActionIRId;
      const originalTemporal = structuredClone(run.videoState!.request.temporalIdentity);
      for (const [attemptIndex, scenario] of videoScenarios.entries()) {
        run = unwrap(await flow.validateVideo(run, scenario));
        if (scenario === VIDEO_FAIL) {
          run = unwrap(flow.retryVideo(run));
          expect(run.retryInfo.videoAttempt).toBe(attemptIndex + 2);
          expect(run.videoState!.request.sourceImage.id).toBe(originalSource);
          expect(run.videoState!.canonicalSpec.identity.physicalActionIRId).toBe(originalAction);
          expect(run.videoState!.request.temporalIdentity).toEqual(originalTemporal);
          run = unwrap(await flow.generateVideo(run));
        }
      }
      run = unwrap(flow.acceptVideo(run));
      expect(run.currentPhase).toBe('COMPLETED');
    }

    expect(memory.records.map(record => record.asset.id)).toEqual(officialImageIds);
    expect(memory.records).toHaveLength(8);
    expect(failedImageIds.every(id => !memory.records.some(record => record.asset.id === id))).toBe(true);
    expect(videoSourceIds).toEqual(officialImageIds);
    expect(project).toEqual(beforeProject);
    expect(project.worldState).toEqual(beforeProject.worldState);
    expect(project.timeline).toEqual(beforeProject.timeline);
    expect(project.constructionState).toEqual(beforeProject.constructionState);
  });

  it('blocks cross-stage submissions, evidence, correction plans and video assets', async () => {
    const project = createCabanaDoRiachoProject();
    const stages = orderedCommittedStages(project).slice(0, 8);
    const manualFlow = realityFlow({ manualGeneration: true });
    let runA = unwrap(manualFlow.start(startInput(project, stages[0], createVisualReferenceMemory(), true)));
    let runB = unwrap(manualFlow.start(startInput(project, stages[1], createVisualReferenceMemory(), true)));
    runA = unwrap(await manualFlow.generateImage(runA));
    runB = unwrap(await manualFlow.generateImage(runB));
    expectFailure(manualFlow.submitImage(runB, manualImageSubmission(runA, 'stage-a')), 'WRONG_SUBMISSION');

    const mockFlow = realityFlow();
    let runE = unwrap(mockFlow.start(startInput(project, stages[4], createVisualReferenceMemory())));
    let runF = unwrap(mockFlow.start(startInput(project, stages[5], createVisualReferenceMemory())));
    runE = unwrap(await mockFlow.generateImage(runE));
    runF = unwrap(await mockFlow.generateImage(runF));
    const requestE = createVisualValidationRequest({
      request: runE.imageState.request,
      result: runE.imageState.result!,
      canonicalSpec: runE.canonicalImageSpec,
    });
    const evidenceE = await createDeterministicMockVisualObservationProvider('COHERENT').observe(requestE);
    const foreignEvidence: VisualObservationProvider = {
      id: 'foreign-stage-evidence', kind: 'MOCK', async observe() { return evidenceE; },
    };
    expectFailure(
      await realityFlow({ imageObservers: [foreignEvidence] }).validateImage(runF, foreignEvidence.id),
      'VALIDATION_BINDING_MISMATCH',
    );

    let failedA = unwrap(mockFlow.start(startInput(project, stages[0], createVisualReferenceMemory())));
    failedA = unwrap(await mockFlow.generateImage(failedA));
    failedA = unwrap(await mockFlow.validateImage(failedA, IMAGE_FAIL));
    const retriedA = unwrap(mockFlow.retryImage(failedA));
    const requestB = unwrap(mockFlow.start(startInput(project, stages[1], createVisualReferenceMemory())))
      .imageState.request;
    expect(createCorrectedImageGenerationRequest(requestB, retriedA.imageState.correctionPlan!))
      .toMatchObject({ status: 'FAILURE', errorCode: 'PLAN_REQUEST_MISMATCH' });

    const videoA = await reachManualVideo(manualFlow, project, stages[0]);
    const videoH = await reachManualVideo(manualFlow, project, stages[7]);
    expectFailure(
      manualFlow.submitVideo(videoH, manualVideoSubmission(videoA, 'stage-a')),
      'WRONG_SUBMISSION',
    );
  });

  it('blocks cross-project references, submissions and validation evidence', async () => {
    const projectA = createCabanaDoRiachoProject();
    const projectB: Project = { ...createCabanaDoRiachoProject(), id: 'reality-project-b' };
    const stageA = orderedCommittedStages(projectA)[0];
    const stageB = orderedCommittedStages(projectB)[0];
    const mockFlow = realityFlow();
    const completedA = await completeImage(mockFlow, projectA, stageA, createVisualReferenceMemory());

    let runB = unwrap(mockFlow.start(startInput(projectB, stageB, completedA.memory)));
    expect(runB.imageState.previousOfficialReference).toBeUndefined();
    expect(runB.imageState.request.references).toEqual([]);

    const manualFlow = realityFlow({ manualGeneration: true });
    let manualA = unwrap(manualFlow.start(startInput(projectA, stageA, createVisualReferenceMemory(), true)));
    let manualB = unwrap(manualFlow.start(startInput(projectB, stageB, createVisualReferenceMemory(), true)));
    manualA = unwrap(await manualFlow.generateImage(manualA));
    manualB = unwrap(await manualFlow.generateImage(manualB));
    expectFailure(
      manualFlow.submitImage(manualB, manualImageSubmission(manualA, 'project-a')),
      'WRONG_SUBMISSION',
    );

    runB = unwrap(await mockFlow.generateImage(runB));
    let runA = unwrap(mockFlow.start(startInput(projectA, stageA, createVisualReferenceMemory())));
    runA = unwrap(await mockFlow.generateImage(runA));
    const requestA = createVisualValidationRequest({
      request: runA.imageState.request,
      result: runA.imageState.result!,
      canonicalSpec: runA.canonicalImageSpec,
    });
    const evidenceA = await createDeterministicMockVisualObservationProvider('COHERENT').observe(requestA);
    const provider: VisualObservationProvider = {
      id: 'foreign-project-evidence', kind: 'MOCK', async observe() { return evidenceA; },
    };
    expectFailure(
      await realityFlow({ imageObservers: [provider] }).validateImage(runB, provider.id),
      'VALIDATION_BINDING_MISMATCH',
    );

    const videoA = await reachManualVideo(manualFlow, projectA, stageA);
    const videoB = await reachManualVideo(manualFlow, projectB, stageB);
    expectFailure(
      manualFlow.submitVideo(videoB, manualVideoSubmission(videoA, 'project-a')),
      'WRONG_SUBMISSION',
    );
  });

  it('keeps duplicate commands idempotent and preserves manual pause/resume', async () => {
    const project = createCabanaDoRiachoProject();
    const entry = orderedCommittedStages(project)[1];
    const flow = realityFlow({ manualGeneration: true });
    let run = unwrap(flow.start(startInput(project, entry, createVisualReferenceMemory(), true)));
    run = unwrap(await flow.generateImage(run));
    expect(run.currentPhase).toBe('IMAGE_MANUAL_ACTION_REQUIRED');

    const pausedImage = run;
    const imageSubmission = manualImageSubmission(pausedImage, 'idempotent');
    run = unwrap(flow.submitImage(pausedImage, imageSubmission));
    expect(unwrap(flow.submitImage(run, imageSubmission))).toBe(run);
    run = unwrap(await flow.validateImage(run, IMAGE_PASS));
    const repeatedValidation = await flow.validateImage(run, IMAGE_PASS);
    expectFailure(repeatedValidation, 'INVALID_RUN_STATE');
    expect(repeatedValidation.status === 'FAILURE' ? repeatedValidation.run : undefined).toBe(run);

    run = unwrap(flow.approveImage(run, { recordedAt: 42 }));
    expect(unwrap(flow.approveImage(run, { recordedAt: 42 }))).toBe(run);
    expect(run.memory.records).toHaveLength(1);
    run = unwrap(flow.prepareVideo(run));
    expect(unwrap(flow.prepareVideo(run))).toBe(run);
    run = unwrap(await flow.generateVideo(run));
    expect(run.currentPhase).toBe('VIDEO_MANUAL_ACTION_REQUIRED');

    const pausedVideo = run;
    const videoSubmission = manualVideoSubmission(pausedVideo, 'idempotent');
    run = unwrap(flow.submitVideo(pausedVideo, videoSubmission));
    expect(unwrap(flow.submitVideo(run, videoSubmission))).toBe(run);
    run = unwrap(await flow.validateVideo(run, VIDEO_PASS));
    run = unwrap(flow.acceptVideo(run));
    expect(unwrap(flow.acceptVideo(run))).toBe(run);
    expect(run.memory.records).toHaveLength(1);

    const retryFlow = realityFlow();
    let failed = unwrap(retryFlow.start(startInput(project, entry, createVisualReferenceMemory())));
    failed = unwrap(await retryFlow.generateImage(failed));
    failed = unwrap(await retryFlow.validateImage(failed, IMAGE_FAIL));
    const retried = unwrap(retryFlow.retryImage(failed));
    expect(unwrap(retryFlow.retryImage(retried))).toBe(retried);
  });

  it('stops image and video retries at maxAttempts without approval or temporal advance', async () => {
    const project = createCabanaDoRiachoProject();
    const entry = orderedCommittedStages(project)[2];
    const before = structuredClone(project);
    const flow = realityFlow({ maxImageAttempts: 3, maxVideoAttempts: 3 });

    let imageRun = unwrap(flow.start(startInput(project, entry, createVisualReferenceMemory())));
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      imageRun = unwrap(await flow.generateImage(imageRun));
      imageRun = unwrap(await flow.validateImage(imageRun, IMAGE_FAIL));
      if (attempt < 3) imageRun = unwrap(flow.retryImage(imageRun));
    }
    const imageExhausted = flow.retryImage(imageRun);
    expectFailure(imageExhausted, 'RETRY_EXHAUSTED');
    if (imageExhausted.status === 'FAILURE') {
      expect(imageExhausted.run?.currentPhase).toBe('FAILED');
      expect(imageExhausted.run?.memory.records).toHaveLength(0);
      expect(imageExhausted.run?.temporalIdentity).toEqual(imageRun.temporalIdentity);
    }

    let videoRun = await completeImage(flow, project, entry, createVisualReferenceMemory());
    videoRun = unwrap(flow.prepareVideo(videoRun));
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      videoRun = unwrap(await flow.generateVideo(videoRun));
      videoRun = unwrap(await flow.validateVideo(videoRun, VIDEO_FAIL));
      if (attempt < 3) videoRun = unwrap(flow.retryVideo(videoRun));
    }
    const videoExhausted = flow.retryVideo(videoRun);
    expectFailure(videoExhausted, 'RETRY_EXHAUSTED');
    if (videoExhausted.status === 'FAILURE') {
      expect(videoExhausted.run?.currentPhase).toBe('FAILED');
      expect(videoExhausted.run?.imageState.officialReference?.asset.id)
        .toBe(videoRun.imageState.officialReference?.asset.id);
    }
    expect(project).toEqual(before);
  });

  it('rejects a wrong future action and creates a narrowly bound correction plan', async () => {
    const project = createCabanaDoRiachoProject();
    const entry = orderedCommittedStages(project)
      .find(item => item.scene.operationId === 'op_vigas' && item.stage.percentage > 0)!;
    const flow = realityFlow();
    let run = await completeImage(flow, project, entry, createVisualReferenceMemory());
    run = unwrap(flow.prepareVideo(run));
    run = unwrap(await flow.generateVideo(run));
    run = unwrap(await flow.validateVideo(run, VIDEO_WRONG_ACTION));
    expect(run.currentPhase).toBe('VIDEO_CORRECTION_REQUIRED');
    expect(run.videoState?.validation?.verdict).toBe('FAIL');
    expect(run.videoState?.validation?.findings.map(finding => finding.code))
      .toContain('WRONG_PRIMARY_ACTION');

    run = unwrap(flow.retryVideo(run));
    const plan = run.videoState!.correctionPlan!;
    expect(plan.changeInstructions.join(' ')).toContain(run.physicalAction.primaryAction.description);
    expect(plan.preserveInstructions.join(' ')).toContain(run.snapshot.actor.characterId);
    expect(plan.preserveInstructions.join(' ')).toContain(run.snapshot.actor.clothing);
    expect(plan.preserveInstructions.join(' ')).toContain(run.snapshot.environment.preset);
    expect(plan.preserveInstructions.join(' ')).toContain('construction state');
    expect(plan.preserveInstructions.join(' ')).toContain(run.snapshot.camera.id);
    expect(plan.preserveInstructions.join(' ')).toContain('materials');
  });

  it('completes the actual first and last project stages without invented references', async () => {
    const project = createCabanaDoRiachoProject();
    const before = structuredClone(project);
    const stages = orderedCommittedStages(project);
    const first = stages[0];
    const previousToLast = stages[stages.length - 2];
    const last = stages[stages.length - 1];
    const flow = realityFlow();

    let firstRun = unwrap(flow.start(startInput(project, first, createVisualReferenceMemory())));
    expect(firstRun.imageState.previousOfficialReference).toBeUndefined();
    expect(firstRun.imageState.request.references).toEqual([]);
    firstRun = unwrap(await flow.generateImage(firstRun));
    firstRun = unwrap(await flow.validateImage(firstRun, IMAGE_PASS));
    firstRun = unwrap(flow.approveImage(firstRun, { recordedAt: 50 }));
    firstRun = unwrap(flow.prepareVideo(firstRun));
    firstRun = unwrap(await flow.generateVideo(firstRun));
    firstRun = unwrap(await flow.validateVideo(firstRun, VIDEO_PASS));
    firstRun = unwrap(flow.acceptVideo(firstRun));
    expect(firstRun.currentPhase).toBe('COMPLETED');

    const previousRun = await completeImage(
      flow,
      project,
      previousToLast,
      createVisualReferenceMemory(),
    );
    let lastRun = unwrap(flow.start(startInput(project, last, previousRun.memory)));
    expect(lastRun.imageState.previousOfficialReference?.asset.id)
      .toBe(previousRun.imageState.officialReference?.asset.id);
    expect(lastRun.snapshot.continuity.futureForbidden).toEqual([]);
    lastRun = unwrap(await flow.generateImage(lastRun));
    lastRun = unwrap(await flow.validateImage(lastRun, IMAGE_PASS));
    lastRun = unwrap(flow.approveImage(lastRun, { recordedAt: 51 }));
    const lastOfficial = lastRun.imageState.officialReference!.asset.id;
    lastRun = unwrap(flow.prepareVideo(lastRun));
    expect(lastRun.videoState?.request.sourceImage.id).toBe(lastOfficial);
    lastRun = unwrap(await flow.generateVideo(lastRun));
    lastRun = unwrap(await flow.validateVideo(lastRun, VIDEO_PASS));
    lastRun = unwrap(flow.acceptVideo(lastRun));
    expect(lastRun.currentPhase).toBe('COMPLETED');
    expect(project).toEqual(before);
  });

  it('keeps 120 synthetic stages ordered, deterministic and free of future references', async () => {
    const project = createCabanaDoRiachoProject();
    const base = startInput(
      project,
      orderedCommittedStages(project)[0],
      createVisualReferenceMemory(),
    );
    const flow = realityFlow();
    let memory = createVisualReferenceMemory();
    let previousAssetId: string | undefined;
    const startedAt = performance.now();

    for (let index = 0; index < 120; index += 1) {
      const input = syntheticInput(base, index, memory);
      let run = unwrap(flow.start(input));
      const duplicate = unwrap(flow.start(input));
      expect(duplicate.runId).toBe(run.runId);
      expect(duplicate.imageState.request.requestId).toBe(run.imageState.request.requestId);
      expect(run.imageState.previousOfficialReference?.asset.id).toBe(previousAssetId);
      expect(run.imageState.request.references.map(reference => reference.asset.id))
        .toEqual(previousAssetId ? [previousAssetId] : []);

      run = unwrap(await flow.generateImage(run));
      run = unwrap(await flow.validateImage(run, IMAGE_PASS));
      run = unwrap(flow.approveImage(run, { recordedAt: index }));
      previousAssetId = run.imageState.officialReference!.asset.id;
      memory = run.memory;
    }

    expect(memory.records).toHaveLength(120);
    expect(new Set(memory.records.map(record => record.stageId)).size).toBe(120);
    expect(performance.now() - startedAt).toBeLessThan(15_000);
  });

  it('keeps UI adapters human-readable across operational and failure states', async () => {
    const project = createCabanaDoRiachoProject();
    const entry = orderedCommittedStages(project)[0];
    const flow = realityFlow({ manualGeneration: true });
    let run = unwrap(flow.start(startInput(project, entry, createVisualReferenceMemory(), true)));
    expect(pipelineSteps(run)[0]).toMatchObject({ label: 'Preparar imagem', status: 'current' });
    run = unwrap(await flow.generateImage(run));
    expect(requiredActionLabel(run)).toBe('Enviar imagem gerada');
    expect(safePipelineError({ code: 'WRONG_STAGE', message: 'raw ids' }))
      .toBe('Este resultado pertence a outra etapa.');
    expect(safePipelineError({ code: 'RETRY_EXHAUSTED', message: 'raw ids' }))
      .toBe('O limite de tentativas foi atingido.');
  });
});

function orderedCommittedStages(project: Project): OrderedStage[] {
  return project.scenes.flatMap((scene, sceneOrder) =>
    scene.stages
      .map((stage, stageOrder) => ({ scene, stage, sceneOrder, stageOrder }))
      .filter(item => item.stage.decision && item.stage.worldStateBefore && item.stage.worldStateAfter),
  );
}

function startInput(
  project: Project,
  entry: OrderedStage,
  memory: VisualReferenceMemory,
  manualGeneration = false,
): StartVisualPipelineInput {
  const draft = createVisualPipelineStartDraft(project, entry.scene, entry.stage);
  return {
    ...draft,
    memory,
    image: {
      ...draft.image,
      providerId: manualGeneration ? 'manual-image' : 'mock-image',
      temporalPosition: { sceneOrder: entry.sceneOrder, stageOrder: entry.stageOrder },
    },
    video: {
      ...draft.video,
      providerId: manualGeneration ? 'manual-video' : 'mock-video',
    },
  };
}

function realityFlow(options: {
  readonly manualGeneration?: boolean;
  readonly imageObservers?: readonly VisualObservationProvider[];
  readonly videoObservers?: readonly VideoObservationProvider[];
  readonly maxImageAttempts?: number;
  readonly maxVideoAttempts?: number;
} = {}): VisualPipelineOrchestrator {
  return createVisualPipelineOrchestrator({
    imageGenerationService: createImageGenerationService({
      providers: options.manualGeneration
        ? [createManualImageProvider('manual-image')]
        : [createDeterministicMockImageProvider('mock-image')],
    }),
    videoGenerationService: createVideoGenerationService({
      providers: options.manualGeneration
        ? [createManualVideoProvider('manual-video')]
        : [createDeterministicMockVideoProvider('mock-video')],
    }),
    imageObservationProviders: options.imageObservers ?? [
      createDeterministicMockVisualObservationProvider('COHERENT', IMAGE_PASS),
      createDeterministicMockVisualObservationProvider('FUTURE_ELEMENT', IMAGE_FAIL),
      createDeterministicMockVisualObservationProvider('MINOR_DIVERGENCE', IMAGE_WARN),
    ],
    videoObservationProviders: options.videoObservers ?? [
      createDeterministicMockVideoObservationProvider('COHERENT', VIDEO_PASS),
      createDeterministicMockVideoObservationProvider('FUTURE_ACTION', VIDEO_FAIL),
      createDeterministicMockVideoObservationProvider('WRONG_ACTION', VIDEO_WRONG_ACTION),
    ],
    maxImageAttempts: options.maxImageAttempts ?? 3,
    maxVideoAttempts: options.maxVideoAttempts ?? 3,
    workflowVersion: 'full-project-reality-v1',
  });
}

function unwrap(result: VisualPipelineStepResult): VisualPipelineRun {
  if (result.status !== 'SUCCESS') throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.run;
}

function expectFailure(result: VisualPipelineStepResult, code: string): void {
  expect(result.status).toBe('FAILURE');
  if (result.status === 'FAILURE') expect(result.error.code).toBe(code);
}

function assertPhysicalAndVisualTimeline(
  project: Project,
  entry: OrderedStage,
  next: OrderedStage | undefined,
): void {
  const { stage } = entry;
  const action = stage.physicalActionIR!;
  expect(action.before.constructionProgress).toBe(stage.worldStateBefore!.construction.progress);
  expect(action.after.constructionProgress).toBe(stage.worldStateAfter!.construction.progress);
  expect(action.after.constructionProgress).toBeGreaterThanOrEqual(action.before.constructionProgress);
  const draft = createVisualPipelineStartDraft(project, entry.scene, stage);
  expect(draft.snapshot.identity.progress).toBe(stage.worldStateAfter!.construction.progress);
  expect(draft.snapshot.action.physicalActionIRId).toBe(action.id);
  expect(draft.snapshot.action.tools).toEqual(action.tools);
  expect(draft.snapshot.action.materials).toEqual(action.materials);
  expect(draft.snapshot.construction.visibleComponents.some(component =>
    draft.snapshot.continuity.futureForbidden.includes(component))).toBe(false);
  if (next?.stage.tool && next.stage.tool !== stage.tool) {
    expect(draft.snapshot.action.tools).not.toContain(next.stage.tool);
  }
}

function manualImageSubmission(run: VisualPipelineRun, suffix: string): ManualImageSubmission {
  return {
    submissionId: `reality-image-submission:${suffix}`,
    requestId: run.imageState.request.requestId,
    asset: {
      id: `reality-image:${suffix}`,
      source: 'MANUAL',
      uri: `local://reality/${suffix}.png`,
      mimeType: 'image/png',
    },
    submittedAt: 10,
  };
}

function manualVideoSubmission(run: VisualPipelineRun, suffix: string): ManualVideoSubmission {
  return {
    submissionId: `reality-video-submission:${suffix}`,
    requestId: run.videoState!.request.requestId,
    asset: {
      id: `reality-video:${suffix}`,
      source: 'MANUAL',
      uri: `local://reality/${suffix}.mp4`,
      mimeType: 'video/mp4',
      durationSeconds: run.videoState!.request.durationSeconds,
    },
    submittedAt: 20,
  };
}

async function completeImage(
  flow: VisualPipelineOrchestrator,
  project: Project,
  entry: OrderedStage,
  memory: VisualReferenceMemory,
): Promise<VisualPipelineRun> {
  let run = unwrap(flow.start(startInput(project, entry, memory)));
  run = unwrap(await flow.generateImage(run));
  run = unwrap(await flow.validateImage(run, IMAGE_PASS));
  return unwrap(flow.approveImage(run, { recordedAt: 30 }));
}

async function reachManualVideo(
  flow: VisualPipelineOrchestrator,
  project: Project,
  entry: OrderedStage,
): Promise<VisualPipelineRun> {
  let run = unwrap(flow.start(startInput(project, entry, createVisualReferenceMemory(), true)));
  run = unwrap(await flow.generateImage(run));
  run = unwrap(flow.submitImage(run, manualImageSubmission(run, `image-${entry.sceneOrder}-${entry.stageOrder}`)));
  run = unwrap(await flow.validateImage(run, IMAGE_PASS));
  run = unwrap(flow.approveImage(run, { recordedAt: 40 }));
  run = unwrap(flow.prepareVideo(run));
  return unwrap(await flow.generateVideo(run));
}

function syntheticInput(
  base: StartVisualPipelineInput,
  index: number,
  memory: VisualReferenceMemory,
): StartVisualPipelineInput {
  const sceneOrder = Math.floor(index / 15);
  const stageOrder = index % 15;
  const sceneId = `stress-scene-${sceneOrder}`;
  const stageId = `stress-stage-${index}`;
  const operationId = `stress-operation-${index}`;
  const actionId = `stress-action-${index}`;
  const snapshotId = `stress-snapshot-${index}`;
  const progress = Math.floor(index * 100 / 119);
  const physicalAction = structuredClone(base.physicalAction);
  physicalAction.id = actionId;
  physicalAction.sceneId = sceneId;
  physicalAction.stageId = stageId;
  physicalAction.operationId = operationId;
  physicalAction.before.constructionProgress = Math.max(0, progress - 1);
  physicalAction.after.constructionProgress = progress;
  physicalAction.expectedEffects.constructionProgress = {
    before: physicalAction.before.constructionProgress,
    after: progress,
  };
  const snapshot = structuredClone(base.snapshot);
  snapshot.id = snapshotId;
  snapshot.identity.projectId = 'stress-project';
  snapshot.identity.sceneId = sceneId;
  snapshot.identity.stageId = stageId;
  snapshot.identity.operationId = operationId;
  snapshot.identity.progress = progress;
  snapshot.action.physicalActionIRId = actionId;
  snapshot.construction.progress = progress;
  return {
    ...base,
    physicalAction,
    snapshot,
    memory,
    image: {
      ...base.image,
      temporalPosition: { sceneOrder, stageOrder },
    },
  };
}
