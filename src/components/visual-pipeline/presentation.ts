import { compilePhysicalActionIR } from '../../core/actions/physical-action-ir';
import type { ImageAssetRef } from '../../core/image-generation';
import { DEFAULT_VISUAL_ASPECT_RATIO, type Project, type Scene, type Stage } from '../../core/types';
import type { VideoAssetRef } from '../../core/video-generation';
import type {
  StartVisualPipelineInput,
  VisualPipelineFailure,
  VisualPipelinePhase,
  VisualPipelineRequiredActionType,
  VisualPipelineRun,
} from '../../core/visual-pipeline';
import { buildStageVisualStateSnapshots } from '../../core/visual-state/visual-state-snapshot';
import type { VisualObservation } from '../../core/visual-validation';
import type { VideoObservation } from '../../core/video-validation';

export const UI_IMAGE_PROVIDER_ID = 'ui-manual-image';
export const UI_VIDEO_PROVIDER_ID = 'ui-manual-video';
export const UI_IMAGE_OBSERVER_ID = 'ui-manual-image-observer';
export const UI_VIDEO_OBSERVER_ID = 'ui-manual-video-observer';

export function formatAspectRatio(aspectRatio?: number): string {
  if (aspectRatio === undefined) return 'padrão';
  if (aspectRatio === DEFAULT_VISUAL_ASPECT_RATIO) return '9:16 / 0.5625';
  return aspectRatio.toFixed(3);
}

export type ReviewAnswer = 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE';

export interface ImageEvidenceAnswers {
  readonly construction: ReviewAnswer;
  readonly character: ReviewAnswer;
  readonly clothing: ReviewAnswer;
  readonly environment: ReviewAnswer;
  readonly futureElementPresent: boolean;
  readonly missingRequiredElement: boolean;
  readonly notes: string;
}

export interface VideoEvidenceAnswers {
  readonly actionCorrect: boolean;
  readonly character: ReviewAnswer;
  readonly clothing: ReviewAnswer;
  readonly construction: ReviewAnswer;
  readonly camera: ReviewAnswer;
  readonly environment: ReviewAnswer;
  readonly futureActionPresent: boolean;
  readonly notes: string;
}

export interface PipelineStepPresentation {
  readonly id: string;
  readonly label: string;
  readonly status: 'completed' | 'current' | 'pending' | 'warning' | 'failed';
}

export type VisualPipelineStartDraft = Omit<StartVisualPipelineInput, 'memory'>;

const ACTION_LABELS: Record<VisualPipelineRequiredActionType, string> = {
  GENERATE_IMAGE_EXTERNALLY: 'Gerar imagem',
  PROVIDE_IMAGE_EVIDENCE: 'Validar imagem',
  ACKNOWLEDGE_IMAGE_WARNING: 'Revisar aviso',
  RETRY_IMAGE: 'Corrigir e tentar novamente',
  APPROVE_IMAGE: 'Aprovar imagem',
  PREPARE_VIDEO: 'Preparar vídeo',
  GENERATE_VIDEO_EXTERNALLY: 'Gerar vídeo',
  PROVIDE_VIDEO_EVIDENCE: 'Validar vídeo',
  ACKNOWLEDGE_VIDEO_WARNING: 'Revisar aviso',
  RETRY_VIDEO: 'Tentar vídeo novamente',
  ACCEPT_VIDEO: 'Finalizar vídeo',
};

const PHASE_INDEX: Record<VisualPipelinePhase, number> = {
  IMAGE_REQUEST_READY: 0,
  IMAGE_MANUAL_ACTION_REQUIRED: 1,
  IMAGE_VALIDATION_REQUIRED: 2,
  IMAGE_CORRECTION_REQUIRED: 2,
  IMAGE_APPROVAL_REQUIRED: 3,
  IMAGE_APPROVED: 4,
  VIDEO_REQUEST_READY: 4,
  VIDEO_MANUAL_ACTION_REQUIRED: 5,
  VIDEO_VALIDATION_REQUIRED: 6,
  VIDEO_CORRECTION_REQUIRED: 6,
  VIDEO_ACCEPTANCE_REQUIRED: 6,
  COMPLETED: 7,
  FAILED: 0,
};

const STEP_LABELS = [
  'Preparar imagem',
  'Gerar imagem',
  'Validar imagem',
  'Aprovar imagem',
  'Preparar vídeo',
  'Gerar vídeo',
  'Validar vídeo',
  'Concluído',
] as const;

export function visualPipelineKey(projectId: string, sceneId: string, stageId: string): string {
  return `${projectId}::${sceneId}::${stageId}`;
}

export function createVisualPipelineStartDraft(
  project: Project,
  scene: Scene,
  stage: Stage,
): VisualPipelineStartDraft {
  const operation = project.operations.find(candidate => candidate.id === scene.operationId);
  if (!operation) throw new Error('A operação desta cena não foi encontrada.');
  if (!stage.worldStateBefore || !stage.worldStateAfter) {
    throw new Error('Esta etapa ainda não possui snapshots físicos completos.');
  }
  if (!stage.decision || stage.status === 'rejected') {
    throw new Error('Finalize e aprove temporalmente a etapa antes de iniciar o pipeline visual.');
  }

  const physicalAction = stage.physicalActionIR ?? compilePhysicalActionIR({
    scene,
    stage,
    operation,
    worldStateBefore: stage.worldStateBefore,
    candidateState: stage.worldStateAfter,
  });
  const snapshots = buildStageVisualStateSnapshots({
    projectId: project.id,
    scene,
    stage: { ...stage, physicalActionIR: physicalAction },
    operation,
    visualDNA: project.visualDNA,
    spatialMap: project.spatialMap,
    cameras: project.dna.cameras,
  });
  if (!snapshots.official) throw new Error('A etapa ainda não possui snapshot visual OFFICIAL.');

  const sceneOrder = project.scenes.findIndex(candidate => candidate.id === scene.id);
  const stageOrder = scene.stages.findIndex(candidate => candidate.percentage === stage.percentage);
  if (sceneOrder < 0 || stageOrder < 0) throw new Error('A posição temporal da etapa é inválida.');

  return {
    physicalAction,
    snapshot: snapshots.official,
    image: {
      providerId: UI_IMAGE_PROVIDER_ID,
      temporalPosition: { sceneOrder, stageOrder },
      aspectRatio: project.visualDNA.consistencyRules.aspectRatio,
    },
    video: {
      providerId: UI_VIDEO_PROVIDER_ID,
      durationSeconds: 8,
    },
  };
}

export function requiredActionLabel(run: VisualPipelineRun): string | undefined {
  if (run.currentPhase === 'IMAGE_MANUAL_ACTION_REQUIRED') return 'Enviar imagem gerada';
  if (run.currentPhase === 'VIDEO_MANUAL_ACTION_REQUIRED') return 'Enviar vídeo gerado';
  return run.requiredAction ? ACTION_LABELS[run.requiredAction.type] : undefined;
}

export function pipelineSteps(run: VisualPipelineRun): readonly PipelineStepPresentation[] {
  const current = PHASE_INDEX[run.currentPhase];
  const imageVerdict = run.imageState.validation?.verdict;
  const videoVerdict = run.videoState?.validation?.verdict;
  return STEP_LABELS.map((label, index) => {
    let status: PipelineStepPresentation['status'] = index < current
      ? 'completed'
      : index === current ? 'current' : 'pending';
    if (run.currentPhase === 'FAILED' && index === current) status = 'failed';
    if (run.currentPhase === 'IMAGE_CORRECTION_REQUIRED' && index === 2) status = 'failed';
    if (run.currentPhase === 'VIDEO_CORRECTION_REQUIRED' && index === 6) status = 'failed';
    if (imageVerdict === 'WARN' && index === 2) status = 'warning';
    if (videoVerdict === 'WARN' && index === 6) status = 'warning';
    return { id: String(index + 1), label, status };
  });
}

export function imageObservationFromAnswers(
  run: VisualPipelineRun,
  answers: ImageEvidenceAnswers,
): VisualObservation {
  const spec = run.canonicalImageSpec;
  const required = unique([
    ...spec.mustShow.subject,
    ...spec.mustShow.action,
    ...spec.mustShow.construction,
    ...spec.mustShow.toolsAndMaterials,
  ]);
  const missing = answers.missingRequiredElement
    ? [required[0] ?? 'elemento obrigatório informado pelo revisor']
    : [];
  const future = answers.futureElementPresent
    ? [spec.mustNotShow.futureComponents[0] ?? 'elemento futuro informado pelo revisor']
    : [];
  return {
    coverage: 'SUFFICIENT',
    detectedElements: [...required.filter(item => !missing.includes(item)), ...future],
    missingElements: missing,
    unexpectedElements: future,
    characterConsistency: answers.character,
    clothingConsistency: answers.clothing,
    environmentConsistency: answers.environment,
    constructionConsistency: answers.construction,
    materialConsistency: answers.construction,
    geometryConsistency: answers.construction,
    previousOfficialContinuity: run.imageState.previousOfficialReference
      ? answers.construction
      : 'NOT_APPLICABLE',
    temporalAnomalies: future.map(element => ({
      code: 'FUTURE_ELEMENT' as const,
      element,
      message: `O revisor informou a presença antecipada de ${element}.`,
    })),
    notes: answers.notes.trim() ? [answers.notes.trim()] : [],
    confidence: 1,
  };
}

export function videoObservationFromAnswers(
  run: VisualPipelineRun,
  answers: VideoEvidenceAnswers,
): VideoObservation {
  if (!run.videoState) throw new Error('O pedido de vídeo ainda não foi preparado.');
  const expectedAction = run.videoState.canonicalSpec.motion.primaryAction.description;
  const future = answers.futureActionPresent
    ? [run.videoState.canonicalSpec.forbidden.futureElements[0] ?? 'ação futura informada pelo revisor']
    : [];
  const wrongAction = 'ação diferente da ação física aprovada';
  return {
    coverage: 'SUFFICIENT',
    observedPrimaryAction: answers.actionCorrect ? expectedAction : wrongAction,
    unexpectedActions: answers.actionCorrect ? [] : [wrongAction],
    missingActions: answers.actionCorrect ? [] : [expectedAction],
    futureActions: future,
    characterConsistency: answers.character,
    clothingConsistency: answers.clothing,
    environmentConsistency: answers.environment,
    constructionConsistency: answers.construction,
    materialConsistency: answers.construction,
    cameraConsistency: answers.camera,
    sourceFrameConsistency: worstConsistency([
      answers.character,
      answers.clothing,
      answers.environment,
      answers.construction,
    ]),
    motionQuality: answers.actionCorrect ? 'ACCEPTABLE' : 'MAJOR_ISSUE',
    temporalAnomalies: future.map(element => ({
      code: 'FUTURE_ACTION' as const,
      element,
      message: `O revisor informou uma ação futura: ${element}.`,
    })),
    durationObserved: run.videoState.request.durationSeconds,
    notes: answers.notes.trim() ? [answers.notes.trim()] : [],
    confidence: 1,
  };
}

export function imageAssetFromFile(file: File, uri: string): ImageAssetRef {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem válido.');
  return {
    id: `local-image:${file.name}:${file.size}:${file.lastModified}`,
    source: 'MANUAL',
    uri,
    mimeType: file.type,
    metadata: { name: file.name, size: file.size, localPreview: true },
  };
}

export function videoAssetFromFile(file: File, uri: string): VideoAssetRef {
  if (!file.type.startsWith('video/')) throw new Error('Selecione um arquivo de vídeo válido.');
  return {
    id: `local-video:${file.name}:${file.size}:${file.lastModified}`,
    source: 'MANUAL',
    uri,
    mimeType: file.type,
    metadata: { name: file.name, size: file.size, localPreview: true },
  };
}

export function safePipelineError(error: VisualPipelineFailure | string): string {
  if (typeof error === 'string') return error;
  const messages: Partial<Record<string, string>> = {
    WRONG_SUBMISSION: 'Este arquivo pertence a outra tentativa.',
    WRONG_ASSET: 'O arquivo enviado não é válido para esta tentativa.',
    WRONG_PROJECT: 'Este resultado pertence a outro projeto.',
    WRONG_STAGE: 'Este resultado pertence a outra etapa.',
    RETRY_EXHAUSTED: 'O limite de tentativas foi atingido.',
    INVALID_RUN_STATE: 'Esta ação não está disponível no estado atual do fluxo.',
    MISSING_REQUIRED_APPROVAL: 'A imagem precisa de validação e aprovação explícita.',
    VALIDATION_BINDING_MISMATCH: 'Esta validação pertence a outro arquivo ou tentativa.',
    PROVIDER_FAILURE: 'Não foi possível preparar o pacote manual. Tente novamente.',
    CORRECTION_FAILURE: 'Não foi possível preparar uma nova tentativa.',
  };
  return messages[error.code] ?? 'Não foi possível concluir esta ação visual.';
}

export function isLocalPreviewUri(uri: string | undefined): boolean {
  return !!uri && (uri.startsWith('blob:') || uri.startsWith('data:image/') || uri.startsWith('data:video/'));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function worstConsistency(values: readonly ReviewAnswer[]): ReviewAnswer {
  if (values.includes('MAJOR_DIVERGENCE')) return 'MAJOR_DIVERGENCE';
  if (values.includes('MINOR_DIVERGENCE')) return 'MINOR_DIVERGENCE';
  return 'MATCH';
}
