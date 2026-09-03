import type { ImageMetadataValue } from '../image-generation';
import type {
  CanonicalAnimationPromptSpec,
  VideoAssetRef,
  VideoGenerationRequest,
  VideoProviderKind,
} from '../video-generation';

export interface ExpectedVideoFacts {
  readonly motion: {
    readonly requiredPrimaryAction: {
      readonly type: CanonicalAnimationPromptSpec['motion']['primaryAction']['type'];
      readonly verb: string;
      readonly description: string;
      readonly targetId: string;
    };
    readonly allowedSecondaryActions: readonly string[];
    readonly forbiddenFutureActions: readonly string[];
    readonly toolMotionConstraints: readonly string[];
    readonly constructionMotionConstraints: {
      readonly targetId: string;
      readonly targetStatusBefore: string;
      readonly targetStatusAfter: string;
      readonly allowedCompletedComponents: readonly string[];
      readonly allowedPartialComponents: readonly string[];
    };
  };
  readonly continuity: {
    readonly character: CanonicalAnimationPromptSpec['continuity']['preserveCharacter'];
    readonly clothing: string;
    readonly environment: CanonicalAnimationPromptSpec['continuity']['preserveEnvironment'];
    readonly constructionGeometry: readonly string[];
    readonly materials: readonly string[];
    readonly lighting: string;
    readonly sourceImageContinuity: {
      readonly referenceId: string;
      readonly assetId: string;
    };
  };
  readonly camera: {
    readonly viewpoint: CanonicalAnimationPromptSpec['camera']['viewpointConstraints'];
    readonly movement: CanonicalAnimationPromptSpec['camera']['cameraMovement'];
    readonly framing: CanonicalAnimationPromptSpec['camera']['framing'];
    readonly forbiddenCameraChanges: readonly string[];
  };
  readonly output: {
    readonly expectedDuration: number;
    readonly aspectRatio: number;
  };
}

export interface VideoValidationRequest {
  readonly validationId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly videoRequestId: string;
  readonly videoAsset: VideoAssetRef;
  readonly sourceImageAssetId: string;
  readonly physicalActionIRId: string;
  readonly canonicalAnimationSpecId: string;
  readonly temporalAuthority: 'OFFICIAL';
  readonly snapshotKind: 'OFFICIAL';
  readonly stageOutcome: 'COMMITTED';
  readonly temporalPoint: VideoGenerationRequest['temporalIdentity']['temporalPoint'];
  readonly worldStateSource: VideoGenerationRequest['temporalIdentity']['worldStateSource'];
  readonly temporalPosition: VideoGenerationRequest['temporalIdentity']['temporalPosition'];
  readonly expectedMotionFacts: ExpectedVideoFacts['motion'];
  readonly expectedContinuityFacts: ExpectedVideoFacts['continuity'];
  readonly expectedCameraFacts: ExpectedVideoFacts['camera'];
  readonly expectedOutputFacts: ExpectedVideoFacts['output'];
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VideoEvidenceCoverage = 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT';
export type VideoConsistencyObservation =
  | 'MATCH'
  | 'MINOR_DIVERGENCE'
  | 'MAJOR_DIVERGENCE'
  | 'UNKNOWN';
export type VideoMotionQuality = 'ACCEPTABLE' | 'MINOR_ISSUE' | 'MAJOR_ISSUE' | 'UNKNOWN';

export interface VideoTemporalAnomaly {
  readonly code: 'FUTURE_ACTION' | 'CONSTRUCTION_AHEAD' | 'TEMPORAL_INCONSISTENCY';
  readonly message: string;
  readonly element?: string;
}

export interface VideoObservation {
  readonly coverage: VideoEvidenceCoverage;
  readonly observedPrimaryAction?: string;
  readonly unexpectedActions: readonly string[];
  readonly missingActions: readonly string[];
  readonly futureActions: readonly string[];
  readonly characterConsistency: VideoConsistencyObservation;
  readonly clothingConsistency: VideoConsistencyObservation;
  readonly environmentConsistency: VideoConsistencyObservation;
  readonly constructionConsistency: VideoConsistencyObservation;
  readonly materialConsistency: VideoConsistencyObservation;
  readonly cameraConsistency: VideoConsistencyObservation;
  readonly sourceFrameConsistency: VideoConsistencyObservation;
  readonly motionQuality: VideoMotionQuality;
  readonly temporalAnomalies: readonly VideoTemporalAnomaly[];
  readonly durationObserved?: number;
  readonly notes: readonly string[];
  readonly confidence?: number;
}

export interface VideoValidationEvidence extends VideoObservation {
  readonly evidenceId: string;
  readonly validationId: string;
  readonly videoRequestId: string;
  readonly videoAssetId: string;
  readonly source: {
    readonly providerId: string;
    readonly providerKind: VideoProviderKind;
  };
  readonly observedAt: number;
}

export interface VideoObservationProvider {
  readonly id: string;
  readonly kind: VideoProviderKind;
  observe(request: VideoValidationRequest): Promise<VideoValidationEvidence>;
}

export type VideoValidationVerdict = 'PASS' | 'WARN' | 'FAIL';
export type VideoValidationFindingSeverity = 'WARN' | 'FAIL';
export type VideoValidationFindingCode =
  | 'EVIDENCE_VALIDATION_MISMATCH'
  | 'EVIDENCE_REQUEST_MISMATCH'
  | 'EVIDENCE_ASSET_MISMATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'WRONG_PRIMARY_ACTION'
  | 'MISSING_PRIMARY_ACTION'
  | 'FUTURE_ACTION'
  | 'UNEXPECTED_ACTION'
  | 'TEMPORAL_ANOMALY'
  | 'SOURCE_IMAGE_CONTINUITY'
  | 'CHARACTER_CONTINUITY'
  | 'CLOTHING_CONTINUITY'
  | 'ENVIRONMENT_CONTINUITY'
  | 'CONSTRUCTION_CONTINUITY'
  | 'MATERIAL_CONTINUITY'
  | 'CAMERA_CONTINUITY'
  | 'MOTION_QUALITY'
  | 'DURATION_MISMATCH';

export interface VideoValidationFinding {
  readonly code: VideoValidationFindingCode;
  readonly severity: VideoValidationFindingSeverity;
  readonly message: string;
  readonly element?: string;
}

interface VideoValidationResultBase {
  readonly validationId: string;
  readonly videoRequestId: string;
  readonly videoAssetId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly sourceImageAssetId: string;
  readonly physicalActionIRId: string;
  readonly canonicalAnimationSpecId: string;
  readonly temporalAuthority: 'OFFICIAL';
  readonly snapshotKind: 'OFFICIAL';
  readonly stageOutcome: 'COMMITTED';
  readonly temporalPoint: VideoValidationRequest['temporalPoint'];
  readonly worldStateSource: VideoValidationRequest['worldStateSource'];
  readonly temporalPosition: VideoValidationRequest['temporalPosition'];
  readonly findings: readonly VideoValidationFinding[];
  readonly checkedRules: readonly string[];
  readonly evidenceSource: VideoValidationEvidence['source'];
  readonly validatedAt: number;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VideoValidationResult = VideoValidationResultBase & (
  | { readonly verdict: 'PASS' }
  | { readonly verdict: 'WARN' }
  | { readonly verdict: 'FAIL' }
);

export interface VideoApprovalEligibility {
  readonly eligible: boolean;
  readonly requiresAcknowledgement: boolean;
  readonly reason:
    | 'PASS'
    | 'WARN_ACKNOWLEDGEMENT_REQUIRED'
    | 'WARN_ACKNOWLEDGED'
    | 'FAIL'
    | 'TEMPORAL_INELIGIBLE';
}

export type VideoCorrectionIssueCode =
  | 'WRONG_ACTION'
  | 'MISSING_ACTION'
  | 'FUTURE_ACTION'
  | 'SOURCE_CONTINUITY'
  | 'CHARACTER_MISMATCH'
  | 'CLOTHING_MISMATCH'
  | 'ENVIRONMENT_MISMATCH'
  | 'CONSTRUCTION_MISMATCH'
  | 'MATERIAL_MISMATCH'
  | 'CAMERA_MISMATCH'
  | 'MOTION_QUALITY'
  | 'DURATION_MISMATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'OTHER';

export interface VideoCorrectionIssue {
  readonly code: VideoCorrectionIssueCode;
  readonly sourceFindingCode: VideoValidationFindingCode;
  readonly severity: VideoValidationFindingSeverity;
  readonly description: string;
  readonly correctionHint: string;
  readonly element?: string;
}

export interface VideoCorrectionPlan {
  readonly correctionPlanId: string;
  readonly sourceVideoRequestId: string;
  readonly sourceVideoAssetId: string;
  readonly sourceValidationId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly sourceImageAssetId: string;
  readonly physicalActionIRId: string;
  readonly canonicalAnimationSpecId: string;
  readonly attemptNumber: number;
  readonly issues: readonly VideoCorrectionIssue[];
  readonly changeInstructions: readonly string[];
  readonly preserveInstructions: readonly string[];
  readonly temporalIdentity: VideoGenerationRequest['temporalIdentity'];
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VideoCorrectionFailureCode =
  | 'CANDIDATE_SUCCESS_REQUIRED'
  | 'SOURCE_REQUEST_MISMATCH'
  | 'SOURCE_ASSET_MISMATCH'
  | 'SOURCE_VALIDATION_MISMATCH'
  | 'TEMPORAL_IDENTITY_MISMATCH'
  | 'INVALID_ATTEMPT_IDENTITY'
  | 'PLAN_REQUEST_MISMATCH'
  | 'REVALIDATION_REQUIRED'
  | 'REQUEST_ID_UNCHANGED';

export interface VideoCorrectionFailure {
  readonly status: 'FAILURE';
  readonly errorCode: VideoCorrectionFailureCode;
  readonly message: string;
}

export type CreateVideoCorrectionPlanResult =
  | { readonly status: 'CREATED'; readonly plan: VideoCorrectionPlan }
  | {
      readonly status: 'NOT_REQUIRED';
      readonly reason: 'PASS' | 'WARN_RETRY_NOT_REQUESTED' | 'REVALIDATION_REQUIRED';
    }
  | VideoCorrectionFailure;

export type CreateCorrectedVideoGenerationRequestResult =
  | { readonly status: 'CREATED'; readonly request: VideoGenerationRequest }
  | VideoCorrectionFailure;

export type VideoRetryDecision =
  | 'RETRY'
  | 'NO_RETRY'
  | 'REVALIDATE'
  | 'RETRY_EXHAUSTED'
  | 'INVALID_BINDING';

export interface VideoRetryEligibility {
  readonly decision: VideoRetryDecision;
  readonly retry: boolean;
  readonly currentAttempt: number;
  readonly nextAttempt?: number;
  readonly maxAttempts: number;
  readonly reason:
    | 'FAIL_RETRY_ALLOWED'
    | 'PASS_NO_RETRY'
    | 'WARN_RETRY_NOT_REQUESTED'
    | 'WARN_RETRY_ALLOWED'
    | 'EVIDENCE_REVALIDATION_REQUIRED'
    | 'MAX_ATTEMPTS_REACHED'
    | 'INVALID_CONFIGURATION_OR_BINDING';
}
