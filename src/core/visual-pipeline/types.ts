import type { PhysicalActionIR } from '../actions/physical-action-ir';
import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageMetadataValue,
  ImageResolution,
  ImageTemporalPosition,
  ManualImageSubmission,
} from '../image-generation';
import type {
  CanonicalAnimationPromptSpec,
  ManualVideoSubmission,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoResolution,
} from '../video-generation';
import type {
  VideoCorrectionPlan,
  VideoObservationProvider,
  VideoValidationRequest,
  VideoValidationResult,
} from '../video-validation';
import type {
  VisualCorrectionPlan,
} from '../visual-correction';
import type {
  VisualReferenceMemory,
  VisualReferenceRecord,
} from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import type {
  VisualObservationProvider,
  VisualValidationRequest,
  VisualValidationResult,
} from '../visual-validation';

export type VisualPipelinePhase =
  | 'IMAGE_REQUEST_READY'
  | 'IMAGE_MANUAL_ACTION_REQUIRED'
  | 'IMAGE_VALIDATION_REQUIRED'
  | 'IMAGE_CORRECTION_REQUIRED'
  | 'IMAGE_APPROVAL_REQUIRED'
  | 'IMAGE_APPROVED'
  | 'VIDEO_REQUEST_READY'
  | 'VIDEO_MANUAL_ACTION_REQUIRED'
  | 'VIDEO_VALIDATION_REQUIRED'
  | 'VIDEO_CORRECTION_REQUIRED'
  | 'VIDEO_ACCEPTANCE_REQUIRED'
  | 'COMPLETED'
  | 'FAILED';

export type VisualPipelineRunStatus =
  | 'READY'
  | 'MANUAL_ACTION_REQUIRED'
  | 'VALIDATION_REQUIRED'
  | 'CORRECTION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'ACCEPTANCE_REQUIRED'
  | 'COMPLETED'
  | 'FAILED';

export type VisualPipelineRequiredActionType =
  | 'GENERATE_IMAGE_EXTERNALLY'
  | 'PROVIDE_IMAGE_EVIDENCE'
  | 'ACKNOWLEDGE_IMAGE_WARNING'
  | 'RETRY_IMAGE'
  | 'APPROVE_IMAGE'
  | 'PREPARE_VIDEO'
  | 'GENERATE_VIDEO_EXTERNALLY'
  | 'PROVIDE_VIDEO_EVIDENCE'
  | 'ACKNOWLEDGE_VIDEO_WARNING'
  | 'RETRY_VIDEO'
  | 'ACCEPT_VIDEO';

export interface VisualPipelineRequiredAction {
  readonly type: VisualPipelineRequiredActionType;
  readonly requestId?: string;
  readonly validationId?: string;
  readonly description: string;
}

export interface VisualPipelineTemporalIdentity {
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly physicalActionIRId: string;
  readonly canonicalSpecId: string;
  readonly temporalAuthority: 'OFFICIAL';
  readonly snapshotKind: 'OFFICIAL';
  readonly stageOutcome: 'COMMITTED';
  readonly temporalPoint: 'AFTER';
  readonly worldStateSource: 'CANDIDATE';
  readonly temporalPosition: ImageTemporalPosition;
}

export interface VisualPipelineImageAttempt {
  readonly request: ImageGenerationRequest;
  readonly result?: ImageGenerationResult;
  readonly validationRequest?: VisualValidationRequest;
  readonly validation?: VisualValidationResult;
  readonly correctionPlan?: VisualCorrectionPlan;
}

export interface VisualPipelineImageState extends VisualPipelineImageAttempt {
  readonly previousOfficialReference?: VisualReferenceRecord;
  readonly officialReference?: VisualReferenceRecord;
  readonly warningAcknowledged: boolean;
  readonly history: readonly VisualPipelineImageAttempt[];
}

export interface VisualPipelineVideoAttempt {
  readonly request: VideoGenerationRequest;
  readonly result?: VideoGenerationResult;
  readonly validationRequest?: VideoValidationRequest;
  readonly validation?: VideoValidationResult;
  readonly correctionPlan?: VideoCorrectionPlan;
}

export interface VisualPipelineVideoState extends VisualPipelineVideoAttempt {
  readonly canonicalSpec: CanonicalAnimationPromptSpec;
  readonly warningAcknowledged: boolean;
  readonly history: readonly VisualPipelineVideoAttempt[];
}

export interface VisualPipelineRetryInfo {
  readonly imageAttempt: number;
  readonly imageMaxAttempts: number;
  readonly videoAttempt?: number;
  readonly videoMaxAttempts: number;
}

export type VisualPipelineLastValidation =
  | { readonly kind: 'IMAGE'; readonly result: VisualValidationResult }
  | { readonly kind: 'VIDEO'; readonly result: VideoValidationResult };

export interface VisualPipelineVideoConfig {
  readonly providerId: string;
  readonly durationSeconds: number;
  readonly resolution?: VideoResolution;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface VisualPipelineRun {
  readonly runId: string;
  readonly workflowVersion: string;
  readonly status: VisualPipelineRunStatus;
  readonly currentPhase: VisualPipelinePhase;
  readonly temporalIdentity: VisualPipelineTemporalIdentity;
  readonly physicalAction: PhysicalActionIR;
  readonly snapshot: VisualStateSnapshot;
  readonly canonicalImageSpec: CanonicalImagePromptSpec;
  readonly memory: VisualReferenceMemory;
  readonly imageState: VisualPipelineImageState;
  readonly videoState?: VisualPipelineVideoState;
  readonly videoConfig: VisualPipelineVideoConfig;
  readonly requiredAction?: VisualPipelineRequiredAction;
  readonly lastValidation?: VisualPipelineLastValidation;
  readonly retryInfo: VisualPipelineRetryInfo;
  readonly warnings: readonly string[];
  readonly errors: readonly VisualPipelineFailure[];
}

export interface StartVisualPipelineInput {
  readonly physicalAction: PhysicalActionIR;
  readonly snapshot: VisualStateSnapshot;
  readonly memory: VisualReferenceMemory;
  readonly image: {
    readonly providerId: string;
    readonly temporalPosition: ImageTemporalPosition;
    readonly aspectRatio?: number;
    readonly resolution?: ImageResolution;
    readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
  };
  readonly video: VisualPipelineVideoConfig;
}

export interface ApprovePipelineImageInput {
  readonly recordedAt: number;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VisualPipelineFailureCode =
  | 'INVALID_INPUT'
  | 'INVALID_RUN_STATE'
  | 'TEMPORAL_BINDING_MISMATCH'
  | 'WRONG_PROJECT'
  | 'WRONG_STAGE'
  | 'WRONG_SUBMISSION'
  | 'WRONG_ASSET'
  | 'MISSING_REQUIRED_APPROVAL'
  | 'RETRY_EXHAUSTED'
  | 'PROVIDER_FAILURE'
  | 'UNKNOWN_OBSERVATION_PROVIDER'
  | 'OBSERVATION_PROVIDER_FAILURE'
  | 'VALIDATION_BINDING_MISMATCH'
  | 'CORRECTION_FAILURE';

export interface VisualPipelineFailure {
  readonly code: VisualPipelineFailureCode;
  readonly message: string;
  readonly causeCode?: string;
}

export type VisualPipelineStepResult =
  | { readonly status: 'SUCCESS'; readonly run: VisualPipelineRun }
  | {
      readonly status: 'FAILURE';
      readonly run?: VisualPipelineRun;
      readonly error: VisualPipelineFailure;
    };

export interface CreateVisualPipelineOrchestratorInput {
  readonly imageGenerationService: import('../image-generation').ImageGenerationService;
  readonly videoGenerationService: import('../video-generation').VideoGenerationService;
  readonly imageObservationProviders: readonly VisualObservationProvider[];
  readonly videoObservationProviders: readonly VideoObservationProvider[];
  readonly maxImageAttempts?: number;
  readonly maxVideoAttempts?: number;
  readonly workflowVersion?: string;
}

export interface VisualPipelineOrchestrator {
  start(input: StartVisualPipelineInput): VisualPipelineStepResult;
  generateImage(run: VisualPipelineRun): Promise<VisualPipelineStepResult>;
  submitImage(
    run: VisualPipelineRun,
    submission: ManualImageSubmission,
  ): VisualPipelineStepResult;
  validateImage(
    run: VisualPipelineRun,
    observationProviderId: string,
  ): Promise<VisualPipelineStepResult>;
  acknowledgeImageWarning(run: VisualPipelineRun): VisualPipelineStepResult;
  retryImage(run: VisualPipelineRun): VisualPipelineStepResult;
  approveImage(
    run: VisualPipelineRun,
    input: ApprovePipelineImageInput,
  ): VisualPipelineStepResult;
  prepareVideo(run: VisualPipelineRun): VisualPipelineStepResult;
  generateVideo(run: VisualPipelineRun): Promise<VisualPipelineStepResult>;
  submitVideo(
    run: VisualPipelineRun,
    submission: ManualVideoSubmission,
  ): VisualPipelineStepResult;
  validateVideo(
    run: VisualPipelineRun,
    observationProviderId: string,
  ): Promise<VisualPipelineStepResult>;
  acknowledgeVideoWarning(run: VisualPipelineRun): VisualPipelineStepResult;
  retryVideo(run: VisualPipelineRun): VisualPipelineStepResult;
  acceptVideo(run: VisualPipelineRun): VisualPipelineStepResult;
}
