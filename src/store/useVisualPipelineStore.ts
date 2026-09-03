import { create } from 'zustand';
import {
  createImageGenerationService,
  createManualImageProvider,
  type ImageAssetRef,
  type ManualImageSubmission,
} from '../core/image-generation';
import {
  createManualVideoProvider,
  createVideoGenerationService,
  type ManualVideoSubmission,
  type VideoAssetRef,
} from '../core/video-generation';
import {
  createManualVideoObservationProvider,
  type VideoObservationProvider,
} from '../core/video-validation';
import {
  createVisualPipelineOrchestrator,
  type VisualPipelineRun,
  type VisualPipelineStepResult,
} from '../core/visual-pipeline';
import { createVisualReferenceMemory, type VisualReferenceMemory } from '../core/visual-reference';
import {
  createManualVisualObservationProvider,
  type VisualObservationProvider,
} from '../core/visual-validation';
import {
  imageObservationFromAnswers,
  safePipelineError,
  UI_IMAGE_OBSERVER_ID,
  UI_IMAGE_PROVIDER_ID,
  UI_VIDEO_OBSERVER_ID,
  UI_VIDEO_PROVIDER_ID,
  videoObservationFromAnswers,
  type ImageEvidenceAnswers,
  type VideoEvidenceAnswers,
  type VisualPipelineStartDraft,
} from '../components/visual-pipeline/presentation';

interface VisualPipelineUIState {
  readonly runs: Readonly<Record<string, VisualPipelineRun>>;
  readonly projectMemories: Readonly<Record<string, VisualReferenceMemory>>;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly busy: Readonly<Record<string, boolean>>;
  start: (key: string, draft: VisualPipelineStartDraft) => void;
  generateImage: (key: string) => Promise<void>;
  submitImage: (key: string, asset: ImageAssetRef) => void;
  validateImage: (key: string, answers: ImageEvidenceAnswers) => Promise<void>;
  acknowledgeImageWarning: (key: string) => void;
  retryImage: (key: string) => void;
  approveImage: (key: string) => void;
  prepareVideo: (key: string) => void;
  generateVideo: (key: string) => Promise<void>;
  submitVideo: (key: string, asset: VideoAssetRef) => void;
  validateVideo: (key: string, answers: VideoEvidenceAnswers) => Promise<void>;
  acknowledgeVideoWarning: (key: string) => void;
  retryVideo: (key: string) => void;
  acceptVideo: (key: string) => void;
  clearError: (key: string) => void;
}

const imageGenerationService = createImageGenerationService({
  providers: [createManualImageProvider(UI_IMAGE_PROVIDER_ID)],
});
const videoGenerationService = createVideoGenerationService({
  providers: [createManualVideoProvider(UI_VIDEO_PROVIDER_ID)],
});

function orchestrator(
  imageObservationProviders: readonly VisualObservationProvider[] = [],
  videoObservationProviders: readonly VideoObservationProvider[] = [],
) {
  return createVisualPipelineOrchestrator({
    imageGenerationService,
    videoGenerationService,
    imageObservationProviders,
    videoObservationProviders,
    maxImageAttempts: 3,
    maxVideoAttempts: 3,
    workflowVersion: 'visual-pipeline-ui-v1',
  });
}

export const useVisualPipelineStore = create<VisualPipelineUIState>((set, get) => {
  const runFor = (key: string): VisualPipelineRun | undefined => get().runs[key];

  const apply = (key: string, result: VisualPipelineStepResult): void => {
    if (result.status === 'FAILURE') {
      set(state => ({
        errors: { ...state.errors, [key]: safePipelineError(result.error) },
        busy: { ...state.busy, [key]: false },
      }));
      return;
    }
    set(state => ({
      runs: { ...state.runs, [key]: result.run },
      projectMemories: {
        ...state.projectMemories,
        [result.run.temporalIdentity.projectId]: result.run.memory,
      },
      errors: { ...state.errors, [key]: undefined },
      busy: { ...state.busy, [key]: false },
    }));
  };

  const withRun = (
    key: string,
    action: (run: VisualPipelineRun) => VisualPipelineStepResult,
  ): void => {
    const run = runFor(key);
    if (!run) return;
    apply(key, action(run));
  };

  const withRunAsync = async (
    key: string,
    action: (run: VisualPipelineRun) => Promise<VisualPipelineStepResult>,
  ): Promise<void> => {
    const run = runFor(key);
    if (!run || get().busy[key]) return;
    set(state => ({
      busy: { ...state.busy, [key]: true },
      errors: { ...state.errors, [key]: undefined },
    }));
    try {
      apply(key, await action(run));
    } catch {
      set(state => ({
        errors: { ...state.errors, [key]: 'Não foi possível concluir esta ação visual.' },
        busy: { ...state.busy, [key]: false },
      }));
    }
  };

  return {
    runs: {},
    projectMemories: {},
    errors: {},
    busy: {},

    start(key, draft) {
      if (runFor(key)) return;
      const memory = get().projectMemories[draft.snapshot.identity.projectId]
        ?? createVisualReferenceMemory();
      apply(key, orchestrator().start({ ...draft, memory }));
    },

    generateImage: key => withRunAsync(key, run => orchestrator().generateImage(run)),

    submitImage(key, asset) {
      withRun(key, run => {
        const submission: ManualImageSubmission = {
          submissionId: `ui-image-submission:${run.imageState.request.requestId}:${asset.id}`,
          requestId: run.imageState.request.requestId,
          asset,
          submittedAt: Date.now(),
          metadata: { source: 'visual-pipeline-ui' },
        };
        return orchestrator().submitImage(run, submission);
      });
    },

    validateImage(key, answers) {
      return withRunAsync(key, run => {
        const provider = createManualVisualObservationProvider({
          id: UI_IMAGE_OBSERVER_ID,
          evidenceId: `ui-image-evidence:${run.imageState.request.requestId}:${run.imageState.result?.status === 'SUCCESS' ? run.imageState.result.asset.id : 'missing'}`,
          observedAt: Date.now(),
          observation: imageObservationFromAnswers(run, answers),
        });
        return orchestrator([provider]).validateImage(run, UI_IMAGE_OBSERVER_ID);
      });
    },

    acknowledgeImageWarning: key => withRun(key, run => orchestrator().acknowledgeImageWarning(run)),
    retryImage: key => withRun(key, run => orchestrator().retryImage(run)),
    approveImage: key => withRun(key, run => orchestrator().approveImage(run, {
      recordedAt: Date.now(),
      metadata: { source: 'visual-pipeline-ui', explicitApproval: true },
    })),
    prepareVideo: key => withRun(key, run => orchestrator().prepareVideo(run)),
    generateVideo: key => withRunAsync(key, run => orchestrator().generateVideo(run)),

    submitVideo(key, asset) {
      withRun(key, run => {
        if (!run.videoState) return {
          status: 'FAILURE',
          run,
          error: { code: 'INVALID_RUN_STATE', message: 'Video request is not ready.' },
        };
        const submission: ManualVideoSubmission = {
          submissionId: `ui-video-submission:${run.videoState.request.requestId}:${asset.id}`,
          requestId: run.videoState.request.requestId,
          asset,
          submittedAt: Date.now(),
          metadata: { source: 'visual-pipeline-ui' },
        };
        return orchestrator().submitVideo(run, submission);
      });
    },

    validateVideo(key, answers) {
      return withRunAsync(key, run => {
        const provider = createManualVideoObservationProvider({
          id: UI_VIDEO_OBSERVER_ID,
          evidenceId: `ui-video-evidence:${run.videoState?.request.requestId ?? 'missing'}:${run.videoState?.result?.status === 'SUCCESS' ? run.videoState.result.asset.id : 'missing'}`,
          observedAt: Date.now(),
          observation: videoObservationFromAnswers(run, answers),
        });
        return orchestrator([], [provider]).validateVideo(run, UI_VIDEO_OBSERVER_ID);
      });
    },

    acknowledgeVideoWarning: key => withRun(key, run => orchestrator().acknowledgeVideoWarning(run)),
    retryVideo: key => withRun(key, run => orchestrator().retryVideo(run)),
    acceptVideo: key => withRun(key, run => orchestrator().acceptVideo(run)),
    clearError: key => set(state => ({ errors: { ...state.errors, [key]: undefined } })),
  };
});
