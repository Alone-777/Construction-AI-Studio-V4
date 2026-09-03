import type { ImageMetadataValue } from '../image-generation';
import {
  renderCanonicalAnimationPrompt,
  withVideoGenerationPrompt,
  type VideoGenerationRequest,
  type VideoGenerationResult,
} from '../video-generation';
import { createVideoValidationId } from './request';
import type {
  CreateCorrectedVideoGenerationRequestResult,
  CreateVideoCorrectionPlanResult,
  VideoCorrectionFailure,
  VideoCorrectionIssue,
  VideoCorrectionIssueCode,
  VideoCorrectionPlan,
  VideoRetryEligibility,
  VideoValidationFinding,
  VideoValidationResult,
} from './types';

export interface CreateVideoCorrectionPlanInput {
  readonly request: VideoGenerationRequest;
  readonly candidate: VideoGenerationResult;
  readonly validation: VideoValidationResult;
  readonly retryWarn?: boolean;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export function createVideoCorrectionPlan(
  input: CreateVideoCorrectionPlanInput,
): CreateVideoCorrectionPlanResult {
  const { request, candidate, validation } = input;
  if (candidate.status !== 'SUCCESS' || candidate.outputStatus !== 'UNREVIEWED') {
    return failure('CANDIDATE_SUCCESS_REQUIRED', 'Video correction requires an unreviewed SUCCESS candidate.');
  }
  if (candidate.requestId !== request.requestId || candidate.providerId !== request.providerId) {
    return failure('SOURCE_REQUEST_MISMATCH', 'Video candidate does not belong to the source request.');
  }
  if (validation.videoRequestId !== request.requestId) {
    return failure('SOURCE_REQUEST_MISMATCH', 'Video validation does not belong to the source request.');
  }
  if (validation.videoAssetId !== candidate.asset.id) {
    return failure('SOURCE_ASSET_MISMATCH', 'Video validation does not belong to the candidate asset.');
  }
  if (validation.validationId !== createVideoValidationId(request.requestId, candidate.asset.id)) {
    return failure('SOURCE_VALIDATION_MISMATCH', 'Video validation identity is invalid.');
  }
  if (!validationMatchesRequest(validation, request)) {
    return failure('TEMPORAL_IDENTITY_MISMATCH', 'Video validation temporal identity does not match request.');
  }
  const evidenceBindingFailure = validation.findings.find(finding =>
    finding.code === 'EVIDENCE_VALIDATION_MISMATCH' ||
    finding.code === 'EVIDENCE_REQUEST_MISMATCH' ||
    finding.code === 'EVIDENCE_ASSET_MISMATCH'
  );
  if (evidenceBindingFailure) {
    return failure('SOURCE_VALIDATION_MISMATCH', 'Invalid evidence binding cannot produce correction.');
  }
  if (validation.findings.some(finding => finding.code === 'INSUFFICIENT_EVIDENCE')) {
    return { status: 'NOT_REQUIRED', reason: 'REVALIDATION_REQUIRED' };
  }
  if (validation.verdict === 'PASS') return { status: 'NOT_REQUIRED', reason: 'PASS' };
  if (validation.verdict === 'WARN' && input.retryWarn !== true) {
    return { status: 'NOT_REQUIRED', reason: 'WARN_RETRY_NOT_REQUESTED' };
  }

  const currentAttempt = getVideoGenerationAttemptNumber(request);
  if (!currentAttempt) {
    return failure('INVALID_ATTEMPT_IDENTITY', 'Video request has invalid retry attempt metadata.');
  }
  const attemptNumber = currentAttempt + 1;
  const issues = validation.findings.map(finding => issueFromFinding(finding, request));
  const plan: VideoCorrectionPlan = {
    correctionPlanId: `video-correction:${validation.validationId}:attempt:${attemptNumber}`,
    sourceVideoRequestId: request.requestId,
    sourceVideoAssetId: candidate.asset.id,
    sourceValidationId: validation.validationId,
    projectId: request.temporalIdentity.projectId,
    sceneId: request.temporalIdentity.sceneId,
    stageId: request.temporalIdentity.stageId,
    operationId: request.temporalIdentity.operationId,
    snapshotId: request.temporalIdentity.snapshotId,
    sourceImageAssetId: request.sourceImage.id,
    physicalActionIRId: request.canonicalAnimationSpec.identity.physicalActionIRId,
    canonicalAnimationSpecId: request.canonicalAnimationSpec.id,
    attemptNumber,
    issues,
    changeInstructions: unique(issues.map(issue => issue.correctionHint)),
    preserveInstructions: unique([
      `preserve character ${request.canonicalAnimationSpec.continuity.preserveCharacter.characterId}`,
      `preserve clothing: ${request.canonicalAnimationSpec.continuity.preserveClothing}`,
      `preserve environment: ${request.canonicalAnimationSpec.continuity.preserveEnvironment.preset}`,
      'preserve the current construction state outside the approved physical action',
      `preserve official source image asset ${request.sourceImage.id}`,
      `preserve physical action ${request.canonicalAnimationSpec.identity.physicalActionIRId}`,
      `preserve camera viewpoint ${request.canonicalAnimationSpec.camera.viewpointConstraints.cameraId}`,
      'preserve project, scene, stage, operation, snapshot and temporal identity',
    ]),
    temporalIdentity: clone(request.temporalIdentity),
    metadata: input.metadata ? clone(input.metadata) : undefined,
  };
  return { status: 'CREATED', plan: deepFreeze(plan) };
}

export function createCorrectedVideoGenerationRequest(
  request: VideoGenerationRequest,
  plan: VideoCorrectionPlan,
): CreateCorrectedVideoGenerationRequestResult {
  if (!planMatchesRequest(plan, request)) {
    return failure('PLAN_REQUEST_MISMATCH', 'Video correction plan does not belong to this request.');
  }
  const currentAttempt = getVideoGenerationAttemptNumber(request);
  if (!currentAttempt || plan.attemptNumber !== currentAttempt + 1) {
    return failure('INVALID_ATTEMPT_IDENTITY', 'Video correction plan does not create the next attempt.');
  }
  if (plan.issues.every(issue => issue.code === 'INSUFFICIENT_EVIDENCE')) {
    return failure('REVALIDATION_REQUIRED', 'Insufficient evidence requires revalidation, not regeneration.');
  }

  const prompt = renderCorrectionLayer(request, plan);
  const corrected = withVideoGenerationPrompt(request, prompt, {
    videoCorrection: {
      correctionPlanId: plan.correctionPlanId,
      attemptNumber: plan.attemptNumber,
      sourceVideoRequestId: plan.sourceVideoRequestId,
      sourceVideoAssetId: plan.sourceVideoAssetId,
      sourceValidationId: plan.sourceValidationId,
    },
  });
  if (corrected.requestId === request.requestId) {
    return failure('REQUEST_ID_UNCHANGED', 'Corrected semantic video content must create a new requestId.');
  }
  return { status: 'CREATED', request: corrected };
}

export interface EvaluateVideoRetryEligibilityInput {
  readonly request: VideoGenerationRequest;
  readonly validation: VideoValidationResult;
  readonly maxAttempts: number;
  readonly retryWarn?: boolean;
}

export function evaluateVideoRetryEligibility(
  input: EvaluateVideoRetryEligibilityInput,
): VideoRetryEligibility {
  const currentAttempt = getVideoGenerationAttemptNumber(input.request) ?? 0;
  const validConfiguration = Number.isInteger(input.maxAttempts) && input.maxAttempts >= 1;
  const validBinding = validationMatchesRequest(input.validation, input.request) &&
    input.validation.videoRequestId === input.request.requestId;
  if (!validConfiguration || !validBinding || currentAttempt === 0) {
    return retryResult(
      'INVALID_BINDING', false, currentAttempt, input.maxAttempts,
      'INVALID_CONFIGURATION_OR_BINDING',
    );
  }
  if (input.validation.verdict === 'PASS') {
    return retryResult('NO_RETRY', false, currentAttempt, input.maxAttempts, 'PASS_NO_RETRY');
  }
  if (requiresRevalidation(input.validation)) {
    return retryResult(
      'REVALIDATE', false, currentAttempt, input.maxAttempts,
      'EVIDENCE_REVALIDATION_REQUIRED',
    );
  }
  if (input.validation.verdict === 'WARN' && input.retryWarn !== true) {
    return retryResult(
      'NO_RETRY', false, currentAttempt, input.maxAttempts,
      'WARN_RETRY_NOT_REQUESTED',
    );
  }
  if (currentAttempt >= input.maxAttempts) {
    return retryResult(
      'RETRY_EXHAUSTED', false, currentAttempt, input.maxAttempts,
      'MAX_ATTEMPTS_REACHED',
    );
  }
  return retryResult(
    'RETRY',
    true,
    currentAttempt,
    input.maxAttempts,
    input.validation.verdict === 'FAIL' ? 'FAIL_RETRY_ALLOWED' : 'WARN_RETRY_ALLOWED',
    currentAttempt + 1,
  );
}

export function getVideoGenerationAttemptNumber(
  request: VideoGenerationRequest,
): number | undefined {
  const correction = request.metadata?.videoCorrection;
  if (correction === undefined) return 1;
  if (correction === null || Array.isArray(correction) || typeof correction !== 'object') {
    return undefined;
  }
  const attempt = (correction as Readonly<Record<string, unknown>>).attemptNumber;
  return typeof attempt === 'number' && Number.isInteger(attempt) && attempt >= 2
    ? attempt
    : undefined;
}

function validationMatchesRequest(
  validation: VideoValidationResult,
  request: VideoGenerationRequest,
): boolean {
  const temporal = request.temporalIdentity;
  return validation.projectId === temporal.projectId &&
    validation.sceneId === temporal.sceneId &&
    validation.stageId === temporal.stageId &&
    validation.operationId === temporal.operationId &&
    validation.snapshotId === temporal.snapshotId &&
    validation.sourceImageAssetId === request.sourceImage.id &&
    validation.physicalActionIRId === request.canonicalAnimationSpec.identity.physicalActionIRId &&
    validation.canonicalAnimationSpecId === request.canonicalAnimationSpec.id &&
    validation.temporalAuthority === temporal.temporalAuthority &&
    validation.snapshotKind === temporal.snapshotKind &&
    validation.stageOutcome === temporal.stageOutcome &&
    validation.temporalPoint === temporal.temporalPoint &&
    validation.worldStateSource === temporal.worldStateSource &&
    stableEqual(validation.temporalPosition, temporal.temporalPosition);
}

function planMatchesRequest(plan: VideoCorrectionPlan, request: VideoGenerationRequest): boolean {
  const temporal = request.temporalIdentity;
  return plan.sourceVideoRequestId === request.requestId &&
    plan.projectId === temporal.projectId &&
    plan.sceneId === temporal.sceneId &&
    plan.stageId === temporal.stageId &&
    plan.operationId === temporal.operationId &&
    plan.snapshotId === temporal.snapshotId &&
    plan.sourceImageAssetId === request.sourceImage.id &&
    plan.physicalActionIRId === request.canonicalAnimationSpec.identity.physicalActionIRId &&
    plan.canonicalAnimationSpecId === request.canonicalAnimationSpec.id &&
    stableEqual(plan.temporalIdentity, temporal);
}

function issueFromFinding(
  finding: VideoValidationFinding,
  request: VideoGenerationRequest,
): VideoCorrectionIssue {
  const code = correctionCode(finding.code);
  return {
    code,
    sourceFindingCode: finding.code,
    severity: finding.severity,
    description: finding.message,
    correctionHint: correctionHint(code, finding.element, request),
    element: finding.element,
  };
}

function correctionCode(code: VideoValidationFinding['code']): VideoCorrectionIssueCode {
  switch (code) {
    case 'WRONG_PRIMARY_ACTION':
    case 'UNEXPECTED_ACTION': return 'WRONG_ACTION';
    case 'MISSING_PRIMARY_ACTION': return 'MISSING_ACTION';
    case 'FUTURE_ACTION': return 'FUTURE_ACTION';
    case 'SOURCE_IMAGE_CONTINUITY': return 'SOURCE_CONTINUITY';
    case 'CHARACTER_CONTINUITY': return 'CHARACTER_MISMATCH';
    case 'CLOTHING_CONTINUITY': return 'CLOTHING_MISMATCH';
    case 'ENVIRONMENT_CONTINUITY': return 'ENVIRONMENT_MISMATCH';
    case 'CONSTRUCTION_CONTINUITY': return 'CONSTRUCTION_MISMATCH';
    case 'MATERIAL_CONTINUITY': return 'MATERIAL_MISMATCH';
    case 'CAMERA_CONTINUITY': return 'CAMERA_MISMATCH';
    case 'MOTION_QUALITY': return 'MOTION_QUALITY';
    case 'DURATION_MISMATCH': return 'DURATION_MISMATCH';
    case 'INSUFFICIENT_EVIDENCE': return 'INSUFFICIENT_EVIDENCE';
    default: return 'OTHER';
  }
}

function correctionHint(
  code: VideoCorrectionIssueCode,
  element: string | undefined,
  request: VideoGenerationRequest,
): string {
  const primary = request.canonicalAnimationSpec.motion.primaryAction.description;
  switch (code) {
    case 'WRONG_ACTION': return `perform only the approved action: ${primary}`;
    case 'MISSING_ACTION': return `show the complete approved action: ${primary}`;
    case 'FUTURE_ACTION': return element
      ? `remove future action ${element}; perform only the approved action: ${primary}`
      : `remove every future action; perform only the approved action: ${primary}`;
    case 'SOURCE_CONTINUITY': return 'restore exact continuity with the official source image';
    case 'CHARACTER_MISMATCH': return 'restore the canonical character identity';
    case 'CLOTHING_MISMATCH': return 'restore the canonical clothing';
    case 'ENVIRONMENT_MISMATCH': return 'restore the canonical environment';
    case 'CONSTRUCTION_MISMATCH':
      return `restore current construction geometry; allow only: ${primary}`;
    case 'MATERIAL_MISMATCH': return 'restore canonical material continuity';
    case 'CAMERA_MISMATCH': return 'restore the canonical camera movement, framing and viewpoint';
    case 'MOTION_QUALITY': return `improve motion quality without changing the action: ${primary}`;
    case 'DURATION_MISMATCH': return `match duration ${request.durationSeconds} seconds`;
    case 'INSUFFICIENT_EVIDENCE': return 'obtain sufficient evidence before regeneration';
    default: return 'correct only the reported video validation finding';
  }
}

function renderCorrectionLayer(
  request: VideoGenerationRequest,
  plan: VideoCorrectionPlan,
): string {
  return [
    renderCanonicalAnimationPrompt(request.canonicalAnimationSpec),
    '',
    'VIDEO CORRECTION LAYER',
    `correction plan: ${plan.correctionPlanId}`,
    `attempt: ${plan.attemptNumber}`,
    'CHANGE ONLY:',
    ...plan.changeInstructions.map(instruction => `- ${instruction}`),
    'PRESERVE:',
    ...plan.preserveInstructions.map(instruction => `- ${instruction}`),
  ].join('\n');
}

function requiresRevalidation(validation: VideoValidationResult): boolean {
  return validation.findings.some(finding =>
    finding.code === 'INSUFFICIENT_EVIDENCE' ||
    finding.code === 'EVIDENCE_VALIDATION_MISMATCH' ||
    finding.code === 'EVIDENCE_REQUEST_MISMATCH' ||
    finding.code === 'EVIDENCE_ASSET_MISMATCH'
  );
}

function retryResult(
  decision: VideoRetryEligibility['decision'],
  retry: boolean,
  currentAttempt: number,
  maxAttempts: number,
  reason: VideoRetryEligibility['reason'],
  nextAttempt?: number,
): VideoRetryEligibility {
  return { decision, retry, currentAttempt, nextAttempt, maxAttempts, reason };
}

function failure(
  errorCode: VideoCorrectionFailure['errorCode'],
  message: string,
): VideoCorrectionFailure {
  return { status: 'FAILURE', errorCode, message };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function stableEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
