import { beforeEach, describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../../core/demo/cabana-do-riacho';
import type { ImageAssetRef } from '../../core/image-generation';
import { DEFAULT_VISUAL_ASPECT_RATIO } from '../../core/types';
import type { VideoAssetRef } from '../../core/video-generation';
import { useVisualPipelineStore } from '../../store/useVisualPipelineStore';
import {
  createVisualPipelineStartDraft,
  formatAspectRatio,
  imageObservationFromAnswers,
  pipelineSteps,
  requiredActionLabel,
  safePipelineError,
  videoObservationFromAnswers,
  visualPipelineKey,
  type ImageEvidenceAnswers,
  type VideoEvidenceAnswers,
} from './presentation';

const IMAGE_OK: ImageEvidenceAnswers = {
  construction: 'MATCH',
  character: 'MATCH',
  clothing: 'MATCH',
  environment: 'MATCH',
  futureElementPresent: false,
  missingRequiredElement: false,
  notes: '',
};
const VIDEO_OK: VideoEvidenceAnswers = {
  actionCorrect: true,
  character: 'MATCH',
  clothing: 'MATCH',
  construction: 'MATCH',
  camera: 'MATCH',
  environment: 'MATCH',
  futureActionPresent: false,
  notes: '',
};

beforeEach(() => {
  useVisualPipelineStore.setState({ runs: {}, projectMemories: {}, errors: {}, busy: {} });
});

describe('operational visual pipeline presentation', () => {
  it('keeps the default 9:16 aspect from VisualDNA through image and video', async () => {
    const { project, key } = await videoManualReady();
    const run = useVisualPipelineStore.getState().runs[key];
    const aspectRatios = [
      project.visualDNA.camera.defaultConfig.aspectRatio,
      project.visualDNA.camera.cameraA.aspectRatio,
      project.visualDNA.camera.cameraB.aspectRatio,
      project.visualDNA.consistencyRules.aspectRatio,
      run.snapshot.camera.viewpoint.aspectRatio,
      run.canonicalImageSpec.camera.viewpoint.aspectRatio,
      run.imageState.request.aspectRatio,
      run.videoState?.canonicalSpec.output.aspectRatio,
      run.videoState?.request.aspectRatio,
    ];

    expect(aspectRatios).toEqual(Array(aspectRatios.length).fill(DEFAULT_VISUAL_ASPECT_RATIO));
    expect(aspectRatios).not.toContain(16 / 9);
    expect(run.imageState.request.prompt).toContain('aspect ratio: 0.5625');
    expect(run.videoState?.request.renderedPrompt).toContain('Aspect ratio: 0.5625.');
    expect(formatAspectRatio(run.imageState.request.aspectRatio)).toBe('9:16 / 0.5625');
    expect(formatAspectRatio(run.videoState?.request.aspectRatio)).toBe('9:16 / 0.5625');
  });

  it('maps run status to the eight human visual steps', () => {
    const { key, run } = startRun();
    expect(key).toBeTruthy();
    expect(pipelineSteps(run)).toHaveLength(8);
    expect(pipelineSteps(run)[0]).toMatchObject({ label: 'Preparar imagem', status: 'current' });
    expect(pipelineSteps(run)[7]).toMatchObject({ label: 'Concluído', status: 'pending' });
  });

  it('maps required actions to human CTAs without exposing identifiers', async () => {
    const { key } = startRun();
    await useVisualPipelineStore.getState().generateImage(key);
    const run = useVisualPipelineStore.getState().runs[key];
    expect(requiredActionLabel(run)).toBe('Enviar imagem gerada');
    expect(requiredActionLabel(run)).not.toContain(run.imageState.request.requestId);
  });

  it('manual image generation exposes the canonical rendered prompt', async () => {
    const { key } = startRun();
    const before = useVisualPipelineStore.getState().runs[key];
    await useVisualPipelineStore.getState().generateImage(key);
    const after = useVisualPipelineStore.getState().runs[key];
    expect(after.currentPhase).toBe('IMAGE_MANUAL_ACTION_REQUIRED');
    expect(after.imageState.result?.status).toBe('MANUAL_READY');
    if (after.imageState.result?.status === 'MANUAL_READY') {
      expect(after.imageState.result.package.prompt).toBe(before.imageState.request.prompt);
    }
  });

  it('submits an image through the orchestrator and requires validation', async () => {
    const { key } = await imageManualReady();
    useVisualPipelineStore.getState().submitImage(key, imageAsset('a'));
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('IMAGE_VALIDATION_REQUIRED');
    expect(run.imageState.result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
  });

  it('PASS evidence shows explicit approval and does not auto-approve', async () => {
    const { key } = await imageSubmitted();
    await useVisualPipelineStore.getState().validateImage(key, IMAGE_OK);
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('IMAGE_APPROVAL_REQUIRED');
    expect(requiredActionLabel(run)).toBe('Aprovar imagem');
    expect(run.memory.records).toHaveLength(0);
  });

  it('FAIL evidence shows correction and rejected image stays outside memory', async () => {
    const { key } = await imageSubmitted();
    await useVisualPipelineStore.getState().validateImage(key, {
      ...IMAGE_OK,
      futureElementPresent: true,
    });
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('IMAGE_CORRECTION_REQUIRED');
    expect(requiredActionLabel(run)).toBe('Corrigir e tentar novamente');
    expect(run.memory.records).toHaveLength(0);
  });

  it('prepares an image retry through the existing correction plan', async () => {
    const { key } = await imageSubmitted();
    const firstId = useVisualPipelineStore.getState().runs[key].imageState.request.requestId;
    await useVisualPipelineStore.getState().validateImage(key, { ...IMAGE_OK, futureElementPresent: true });
    useVisualPipelineStore.getState().retryImage(key);
    const retried = useVisualPipelineStore.getState().runs[key];
    expect(retried.currentPhase).toBe('IMAGE_REQUEST_READY');
    expect(retried.imageState.request.requestId).not.toBe(firstId);
    expect(retried.imageState.correctionPlan?.correctionInstructions.length).toBeGreaterThan(0);
  });

  it('keeps image WARN behind explicit acknowledgement', async () => {
    const { key } = await imageSubmitted();
    await useVisualPipelineStore.getState().validateImage(key, {
      ...IMAGE_OK,
      environment: 'MINOR_DIVERGENCE',
    });
    let run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('IMAGE_APPROVAL_REQUIRED');
    expect(requiredActionLabel(run)).toBe('Revisar aviso');
    expect(run.memory.records).toHaveLength(0);
    useVisualPipelineStore.getState().acknowledgeImageWarning(key);
    run = useVisualPipelineStore.getState().runs[key];
    expect(requiredActionLabel(run)).toBe('Aprovar imagem');
  });

  it('approval uses the official bridge and only then updates visual memory', async () => {
    const { key } = await imageValidated();
    useVisualPipelineStore.getState().approveImage(key);
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('IMAGE_APPROVED');
    expect(run.imageState.officialReference?.approvalStatus).toBe('APPROVED');
    expect(run.memory.records).toHaveLength(1);
  });

  it('video cannot appear before official image approval', async () => {
    const { key } = await imageSubmitted();
    useVisualPipelineStore.getState().prepareVideo(key);
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.videoState).toBeUndefined();
    expect(useVisualPipelineStore.getState().errors[key]).toBeTruthy();
  });

  it('manual video action preserves prompt and official source image', async () => {
    const { key } = await videoManualReady();
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('VIDEO_MANUAL_ACTION_REQUIRED');
    expect(requiredActionLabel(run)).toBe('Enviar vídeo gerado');
    if (run.videoState?.result?.status === 'MANUAL_READY') {
      expect(run.videoState.result.package.prompt).toBe(run.videoState.request.renderedPrompt);
      expect(run.videoState.result.package.sourceImage.id).toBe(run.imageState.officialReference?.asset.id);
    }
  });

  it('submits and validates video without accepting it automatically', async () => {
    const { key } = await videoManualReady();
    useVisualPipelineStore.getState().submitVideo(key, videoAsset('a'));
    expect(useVisualPipelineStore.getState().runs[key].currentPhase).toBe('VIDEO_VALIDATION_REQUIRED');
    await useVisualPipelineStore.getState().validateVideo(key, VIDEO_OK);
    const run = useVisualPipelineStore.getState().runs[key];
    expect(run.currentPhase).toBe('VIDEO_ACCEPTANCE_REQUIRED');
    expect(run.videoState?.result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
  });

  it('video FAIL becomes correction-required and preserves official source', async () => {
    const { key } = await videoSubmitted();
    const before = useVisualPipelineStore.getState().runs[key];
    await useVisualPipelineStore.getState().validateVideo(key, { ...VIDEO_OK, futureActionPresent: true });
    const failed = useVisualPipelineStore.getState().runs[key];
    expect(failed.currentPhase).toBe('VIDEO_CORRECTION_REQUIRED');
    expect(failed.imageState.officialReference?.id).toBe(before.imageState.officialReference?.id);
  });

  it('prepares a video retry through the existing correction plan', async () => {
    const { key } = await videoSubmitted();
    const first = useVisualPipelineStore.getState().runs[key];
    const firstId = first.videoState?.request.requestId;
    const sourceId = first.imageState.officialReference?.asset.id;
    await useVisualPipelineStore.getState().validateVideo(key, { ...VIDEO_OK, futureActionPresent: true });
    useVisualPipelineStore.getState().retryVideo(key);
    const retried = useVisualPipelineStore.getState().runs[key];
    expect(retried.currentPhase).toBe('VIDEO_REQUEST_READY');
    expect(retried.videoState?.request.requestId).not.toBe(firstId);
    expect(retried.videoState?.request.sourceImage.id).toBe(sourceId);
    expect(retried.videoState?.correctionPlan?.changeInstructions.length).toBeGreaterThan(0);
  });

  it('completed state is reached only after explicit video acceptance', async () => {
    const { key } = await videoSubmitted();
    await useVisualPipelineStore.getState().validateVideo(key, VIDEO_OK);
    expect(useVisualPipelineStore.getState().runs[key].currentPhase).toBe('VIDEO_ACCEPTANCE_REQUIRED');
    useVisualPipelineStore.getState().acceptVideo(key);
    expect(useVisualPipelineStore.getState().runs[key].currentPhase).toBe('COMPLETED');
    expect(pipelineSteps(useVisualPipelineStore.getState().runs[key])[7].status).toBe('current');
  });

  it('translates wrong-stage and retry-limit failures safely', () => {
    expect(safePipelineError({ code: 'WRONG_STAGE', message: 'internal stage ids' }))
      .toBe('Este resultado pertence a outra etapa.');
    expect(safePipelineError({ code: 'RETRY_EXHAUSTED', message: 'internal limit' }))
      .toBe('O limite de tentativas foi atingido.');
  });

  it('converts simple image answers into structured manual evidence', () => {
    const { run } = startRun();
    const observation = imageObservationFromAnswers(run, {
      ...IMAGE_OK,
      environment: 'MINOR_DIVERGENCE',
      notes: 'Luz levemente diferente.',
    });
    expect(observation.environmentConsistency).toBe('MINOR_DIVERGENCE');
    expect(observation.notes).toEqual(['Luz levemente diferente.']);
    expect(observation.coverage).toBe('SUFFICIENT');
  });

  it('converts video answers without inventing the expected physical action', async () => {
    const { key } = await videoManualReady();
    const run = useVisualPipelineStore.getState().runs[key];
    const observation = videoObservationFromAnswers(run, VIDEO_OK);
    expect(observation.observedPrimaryAction).toBe(run.physicalAction.primaryAction.description);
    expect(observation.futureActions).toEqual([]);
  });

  it('keeps a paused manual run in the session store across reads', async () => {
    const { key } = await imageManualReady();
    const paused = useVisualPipelineStore.getState().runs[key];
    expect(paused.currentPhase).toBe('IMAGE_MANUAL_ACTION_REQUIRED');
    expect(useVisualPipelineStore.getState().runs[key]).toBe(paused);
  });

  it('does not mutate Project, Stage or WorldState during the UI flow', async () => {
    const { project, key } = startRun();
    const before = structuredClone(project);
    await useVisualPipelineStore.getState().generateImage(key);
    useVisualPipelineStore.getState().submitImage(key, imageAsset('immutable'));
    await useVisualPipelineStore.getState().validateImage(key, IMAGE_OK);
    useVisualPipelineStore.getState().approveImage(key);
    expect(project).toEqual(before);
  });
});

function startRun() {
  const project = createCabanaDoRiachoProject();
  const pair = project.scenes.flatMap(scene => scene.stages.map(stage => ({ scene, stage })))
    .find(item => item.stage.decision && item.stage.worldStateBefore && item.stage.worldStateAfter);
  if (!pair) throw new Error('Demo project has no committed stage.');
  const key = visualPipelineKey(project.id, pair.scene.id, String(pair.stage.percentage));
  useVisualPipelineStore.getState().start(
    key,
    createVisualPipelineStartDraft(project, pair.scene, pair.stage),
  );
  return { project, key, run: useVisualPipelineStore.getState().runs[key] };
}

async function imageManualReady() {
  const value = startRun();
  await useVisualPipelineStore.getState().generateImage(value.key);
  return value;
}

async function imageSubmitted() {
  const value = await imageManualReady();
  useVisualPipelineStore.getState().submitImage(value.key, imageAsset('candidate'));
  return value;
}

async function imageValidated() {
  const value = await imageSubmitted();
  await useVisualPipelineStore.getState().validateImage(value.key, IMAGE_OK);
  return value;
}

async function videoManualReady() {
  const value = await imageValidated();
  useVisualPipelineStore.getState().approveImage(value.key);
  useVisualPipelineStore.getState().prepareVideo(value.key);
  await useVisualPipelineStore.getState().generateVideo(value.key);
  return value;
}

async function videoSubmitted() {
  const value = await videoManualReady();
  useVisualPipelineStore.getState().submitVideo(value.key, videoAsset('candidate'));
  return value;
}

function imageAsset(suffix: string): ImageAssetRef {
  return { id: `ui-image-${suffix}`, source: 'MANUAL', uri: `blob:image-${suffix}`, mimeType: 'image/png' };
}

function videoAsset(suffix: string): VideoAssetRef {
  return { id: `ui-video-${suffix}`, source: 'MANUAL', uri: `blob:video-${suffix}`, mimeType: 'video/mp4' };
}
