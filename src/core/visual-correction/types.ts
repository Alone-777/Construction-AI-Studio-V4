import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageMetadataValue,
} from '../image-generation';
import type {
  VisualValidationFindingCode,
  VisualValidationFindingSeverity,
  VisualValidationResult,
} from '../visual-validation';

export type VisualCorrectionIssueCode =
  | 'FUTURE_ELEMENT'
  | 'MISSING_REQUIRED_ELEMENT'
  | 'CHARACTER_MISMATCH'
  | 'CLOTHING_MISMATCH'
  | 'ENVIRONMENT_MISMATCH'
  | 'CONSTRUCTION_MISMATCH'
  | 'MATERIAL_MISMATCH'
  | 'GEOMETRY_MISMATCH'
  | 'CONTINUITY_BREAK'
  | 'INSUFFICIENT_EVIDENCE'
  | 'OTHER';

export interface VisualCorrectionIssue {
  readonly code: VisualCorrectionIssueCode;
  readonly sourceFindingCode: VisualValidationFindingCode;
  readonly severity: VisualValidationFindingSeverity;
  readonly description: string;
  readonly expected?: string;
  readonly observed?: string;
  readonly correctionHint: string;
}

export interface VisualCorrectionPreviousOfficialReference {
  readonly recordId: string;
  readonly requestId: string;
  readonly assetId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
}

export interface VisualCorrectionPlan {
  readonly correctionPlanId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly canonicalSpecId: string;
  readonly sourceRequestId: string;
  readonly sourceAssetId: string;
  readonly sourceValidationId: string;
  /** The attempt to be created by this plan. Attempt 1 is the original generation. */
  readonly attemptNumber: number;
  readonly issues: readonly VisualCorrectionIssue[];
  readonly correctionInstructions: readonly string[];
  readonly preserveConstraints: readonly string[];
  readonly forbiddenChanges: readonly string[];
  readonly previousOfficialReference?: VisualCorrectionPreviousOfficialReference;
  readonly temporalAuthority: ImageGenerationRequest['temporalAuthority'];
  readonly snapshotKind: ImageGenerationRequest['snapshotKind'];
  readonly stageOutcome: ImageGenerationRequest['metadata']['stageOutcome'];
  readonly temporalPoint: ImageGenerationRequest['metadata']['temporalPoint'];
  readonly worldStateSource: ImageGenerationRequest['metadata']['worldStateSource'];
  readonly temporalPosition?: ImageGenerationRequest['metadata']['temporalPosition'];
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VisualCorrectionFailureCode =
  | 'CANDIDATE_SUCCESS_REQUIRED'
  | 'SOURCE_REQUEST_MISMATCH'
  | 'SOURCE_ASSET_MISMATCH'
  | 'SOURCE_VALIDATION_MISMATCH'
  | 'TEMPORAL_IDENTITY_MISMATCH'
  | 'PREVIOUS_OFFICIAL_REFERENCE_INVALID'
  | 'INVALID_ATTEMPT_IDENTITY'
  | 'PLAN_REQUEST_MISMATCH'
  | 'REVALIDATION_REQUIRED'
  | 'REQUEST_ID_UNCHANGED';

export interface VisualCorrectionFailure {
  readonly status: 'FAILURE';
  readonly errorCode: VisualCorrectionFailureCode;
  readonly message: string;
}

export type CreateVisualCorrectionPlanResult =
  | { readonly status: 'CREATED'; readonly plan: VisualCorrectionPlan }
  | {
      readonly status: 'NOT_REQUIRED';
      readonly reason: 'PASS' | 'WARN_RETRY_NOT_REQUESTED';
    }
  | VisualCorrectionFailure;

export type CreateCorrectedImageGenerationRequestResult =
  | { readonly status: 'CREATED'; readonly request: ImageGenerationRequest }
  | VisualCorrectionFailure;

export type VisualRetryDecision =
  | 'RETRY'
  | 'NO_RETRY'
  | 'REVALIDATE'
  | 'RETRY_EXHAUSTED'
  | 'INVALID_BINDING';

export interface VisualRetryEligibility {
  readonly decision: VisualRetryDecision;
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

export interface CreateVisualCorrectionPlanInput {
  readonly request: ImageGenerationRequest;
  readonly candidate: ImageGenerationResult;
  readonly validation: VisualValidationResult;
  readonly previousOfficialReference?: import('../visual-reference').VisualReferenceRecord | null;
  readonly retryWarn?: boolean;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}
