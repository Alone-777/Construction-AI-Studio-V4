import type { ImageGenerationRequest } from '../image-generation';
import {
  isVisualReferenceStrictlyBefore,
  type VisualReferenceRecord,
} from '../visual-reference';
import {
  createVisualValidationId,
  type VisualValidationFinding,
  type VisualValidationResult,
} from '../visual-validation';
import type {
  CreateVisualCorrectionPlanInput,
  CreateVisualCorrectionPlanResult,
  VisualCorrectionFailure,
  VisualCorrectionIssue,
  VisualCorrectionIssueCode,
  VisualCorrectionPlan,
  VisualCorrectionPreviousOfficialReference,
} from './types';

export function createVisualCorrectionPlan(
  input: CreateVisualCorrectionPlanInput,
): CreateVisualCorrectionPlanResult {
  const { request, candidate, validation } = input;
  if (candidate.status !== 'SUCCESS' || candidate.outputStatus !== 'UNREVIEWED') {
    return failure('CANDIDATE_SUCCESS_REQUIRED', 'Correction requires an unreviewed SUCCESS candidate.');
  }
  if (candidate.requestId !== request.requestId || candidate.providerId !== request.providerId) {
    return failure('SOURCE_REQUEST_MISMATCH', 'Candidate does not belong to the source request.');
  }
  if (validation.requestId !== request.requestId) {
    return failure('SOURCE_REQUEST_MISMATCH', 'Validation does not belong to the source request.');
  }
  if (validation.assetId !== candidate.asset.id) {
    return failure('SOURCE_ASSET_MISMATCH', 'Validation does not belong to the candidate asset.');
  }
  if (validation.validationId !== createVisualValidationId(request.requestId, candidate.asset.id)) {
    return failure('SOURCE_VALIDATION_MISMATCH', 'Validation identity does not match request and asset.');
  }
  if (!validationMatchesTemporalIdentity(validation, request)) {
    return failure('TEMPORAL_IDENTITY_MISMATCH', 'Validation temporal identity does not match request.');
  }
  const evidenceBindingFailure = validation.findings.find(finding =>
    finding.code === 'EVIDENCE_VALIDATION_MISMATCH' ||
    finding.code === 'EVIDENCE_REQUEST_MISMATCH' ||
    finding.code === 'EVIDENCE_ASSET_MISMATCH'
  );
  if (evidenceBindingFailure) {
    if (evidenceBindingFailure.code === 'EVIDENCE_REQUEST_MISMATCH') {
      return failure('SOURCE_REQUEST_MISMATCH', 'Validation evidence belongs to another request.');
    }
    if (evidenceBindingFailure.code === 'EVIDENCE_ASSET_MISMATCH') {
      return failure('SOURCE_ASSET_MISMATCH', 'Validation evidence belongs to another asset.');
    }
    return failure('SOURCE_VALIDATION_MISMATCH', 'Validation evidence identity is invalid.');
  }

  const previousOfficialReference = input.previousOfficialReference
    ? previousReference(input.previousOfficialReference, request)
    : undefined;
  if (input.previousOfficialReference && !previousOfficialReference) {
    return failure(
      'PREVIOUS_OFFICIAL_REFERENCE_INVALID',
      'Correction previous reference must be official, prior and present on the request.',
    );
  }

  if (validation.verdict === 'PASS') return { status: 'NOT_REQUIRED', reason: 'PASS' };
  if (validation.verdict === 'WARN' && input.retryWarn !== true) {
    return { status: 'NOT_REQUIRED', reason: 'WARN_RETRY_NOT_REQUESTED' };
  }

  const currentAttempt = getImageGenerationAttemptNumber(request);
  if (!currentAttempt) {
    return failure('INVALID_ATTEMPT_IDENTITY', 'Source request has invalid correction attempt metadata.');
  }
  const attemptNumber = currentAttempt + 1;
  const issues = validation.findings.length > 0
    ? validation.findings.map(issueFromFinding)
    : [fallbackIssue(validation)];
  const correctionPlanId = `visual-correction:${validation.validationId}:attempt:${attemptNumber}`;
  const plan: VisualCorrectionPlan = {
    correctionPlanId,
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    operationId: request.metadata.operationId,
    snapshotId: request.metadata.snapshotId,
    canonicalSpecId: request.metadata.canonicalSpecId,
    sourceRequestId: request.requestId,
    sourceAssetId: candidate.asset.id,
    sourceValidationId: validation.validationId,
    attemptNumber,
    issues,
    correctionInstructions: unique(issues.map(issue => issue.correctionHint)),
    preserveConstraints: unique([
      'preserve the canonical prompt and every unaffected visual fact',
      'preserve project, scene, stage, snapshot and canonical temporal identity',
      'preserve all official image references already attached to the request',
      previousOfficialReference
        ? `preserve previous official reference asset ${previousOfficialReference.assetId}`
        : undefined,
    ]),
    forbiddenChanges: [
      'do not change official physical state or timeline position',
      'do not treat the failed candidate as an official reference',
      'do not add forbidden future construction elements',
      'do not change unrelated canonical visual details',
    ],
    previousOfficialReference,
    temporalAuthority: request.temporalAuthority,
    snapshotKind: request.snapshotKind,
    stageOutcome: request.metadata.stageOutcome,
    temporalPoint: request.metadata.temporalPoint,
    worldStateSource: request.metadata.worldStateSource,
    temporalPosition: request.metadata.temporalPosition
      ? { ...request.metadata.temporalPosition }
      : undefined,
    metadata: input.metadata ? structuredClone(input.metadata) : undefined,
  };

  return { status: 'CREATED', plan: deepFreeze(plan) };
}

export function getImageGenerationAttemptNumber(
  request: ImageGenerationRequest,
): number | undefined {
  const correction = request.metadata.attributes?.visualCorrection;
  if (correction === undefined) return 1;
  if (correction === null || Array.isArray(correction) || typeof correction !== 'object') {
    return undefined;
  }
  const attempt = (correction as Readonly<Record<string, unknown>>).attemptNumber;
  return typeof attempt === 'number' && Number.isInteger(attempt) && attempt >= 2
    ? attempt
    : undefined;
}

function validationMatchesTemporalIdentity(
  validation: VisualValidationResult,
  request: ImageGenerationRequest,
): boolean {
  return validation.projectId === request.projectId &&
    validation.sceneId === request.sceneId &&
    validation.stageId === request.stageId &&
    validation.operationId === request.metadata.operationId &&
    validation.snapshotId === request.metadata.snapshotId &&
    validation.canonicalSpecId === request.metadata.canonicalSpecId &&
    validation.temporalAuthority === request.temporalAuthority &&
    validation.snapshotKind === request.snapshotKind &&
    validation.stageOutcome === request.metadata.stageOutcome &&
    validation.temporalPoint === request.metadata.temporalPoint;
}

function previousReference(
  record: VisualReferenceRecord,
  request: ImageGenerationRequest,
): VisualCorrectionPreviousOfficialReference | undefined {
  const official = record.approvalStatus === 'APPROVED' &&
    record.temporalAuthority === 'OFFICIAL' &&
    record.snapshotKind === 'OFFICIAL' &&
    record.stageOutcome === 'COMMITTED';
  const attached = request.references.some(reference => reference.asset.id === record.asset.id);
  if (!official || !attached || !isVisualReferenceStrictlyBefore(record, request)) return undefined;
  return {
    recordId: record.id,
    requestId: record.requestId,
    assetId: record.asset.id,
    projectId: record.projectId,
    sceneId: record.sceneId,
    stageId: record.stageId,
  };
}

function issueFromFinding(finding: VisualValidationFinding): VisualCorrectionIssue {
  const code = correctionCode(finding.code);
  const element = finding.element;
  return {
    code,
    sourceFindingCode: finding.code,
    severity: finding.severity,
    description: finding.message,
    expected: code === 'FUTURE_ELEMENT' && element
      ? `${element} absent from the current temporal state`
      : code === 'MISSING_REQUIRED_ELEMENT' && element
        ? `${element} present in the current temporal state`
        : undefined,
    observed: code === 'FUTURE_ELEMENT' && element
      ? `${element} detected`
      : code === 'MISSING_REQUIRED_ELEMENT' && element
        ? `${element} missing`
        : undefined,
    correctionHint: correctionHint(code, element),
  };
}

function correctionCode(code: VisualValidationFinding['code']): VisualCorrectionIssueCode {
  switch (code) {
    case 'FUTURE_ELEMENT_LEAK': return 'FUTURE_ELEMENT';
    case 'REQUIRED_ELEMENT_MISSING': return 'MISSING_REQUIRED_ELEMENT';
    case 'CHARACTER_CONTINUITY': return 'CHARACTER_MISMATCH';
    case 'CLOTHING_CONTINUITY': return 'CLOTHING_MISMATCH';
    case 'ENVIRONMENT_CONTINUITY': return 'ENVIRONMENT_MISMATCH';
    case 'CONSTRUCTION_CONTINUITY': return 'CONSTRUCTION_MISMATCH';
    case 'MATERIAL_CONTINUITY': return 'MATERIAL_MISMATCH';
    case 'GEOMETRY_CONTINUITY': return 'GEOMETRY_MISMATCH';
    case 'PREVIOUS_OFFICIAL_CONTINUITY': return 'CONTINUITY_BREAK';
    case 'INSUFFICIENT_EVIDENCE': return 'INSUFFICIENT_EVIDENCE';
    default: return 'OTHER';
  }
}

function correctionHint(code: VisualCorrectionIssueCode, element?: string): string {
  switch (code) {
    case 'FUTURE_ELEMENT': return element
      ? `remove future element ${element}; preserve the current construction state`
      : 'remove the reported future element; preserve the current construction state';
    case 'MISSING_REQUIRED_ELEMENT': return element
      ? `restore required current element ${element}`
      : 'restore the reported required current element';
    case 'CHARACTER_MISMATCH': return 'restore the canonical character identity';
    case 'CLOTHING_MISMATCH': return 'restore the canonical clothing';
    case 'ENVIRONMENT_MISMATCH': return 'restore the canonical environment';
    case 'CONSTRUCTION_MISMATCH': return 'match the canonical construction snapshot';
    case 'MATERIAL_MISMATCH': return 'restore canonical material continuity';
    case 'GEOMETRY_MISMATCH': return 'restore canonical structural geometry';
    case 'CONTINUITY_BREAK': return 'match the previous official visual continuity';
    case 'INSUFFICIENT_EVIDENCE': return 'obtain sufficient structured evidence before regeneration';
    default: return 'correct only the reported validation finding';
  }
}

function fallbackIssue(validation: VisualValidationResult): VisualCorrectionIssue {
  return {
    code: 'OTHER',
    sourceFindingCode: 'TEMPORAL_ANOMALY',
    severity: validation.verdict === 'FAIL' ? 'FAIL' : 'WARN',
    description: `Validation returned ${validation.verdict} without structured findings.`,
    correctionHint: 'obtain a structured validation finding before changing the image',
  };
}

function failure(
  errorCode: VisualCorrectionFailure['errorCode'],
  message: string,
): VisualCorrectionFailure {
  return { status: 'FAILURE', errorCode, message };
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
