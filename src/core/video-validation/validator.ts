import type {
  VideoApprovalEligibility,
  VideoConsistencyObservation,
  VideoMotionQuality,
  VideoValidationEvidence,
  VideoValidationFinding,
  VideoValidationFindingCode,
  VideoValidationRequest,
  VideoValidationResult,
} from './types';

const CHECKED_RULES = [
  'EVIDENCE_BINDING',
  'EVIDENCE_SUFFICIENCY',
  'PRIMARY_ACTION',
  'FUTURE_ACTIONS',
  'TEMPORAL_CONSISTENCY',
  'SOURCE_IMAGE_CONTINUITY',
  'CHARACTER_CONTINUITY',
  'CLOTHING_CONTINUITY',
  'ENVIRONMENT_CONTINUITY',
  'CONSTRUCTION_CONTINUITY',
  'MATERIAL_CONTINUITY',
  'CAMERA_CONTINUITY',
  'MOTION_QUALITY',
  'DURATION',
] as const;

export function validateVideoContinuity(
  request: VideoValidationRequest,
  evidence: VideoValidationEvidence,
): VideoValidationResult {
  const findings: VideoValidationFinding[] = [];
  validateBinding(request, evidence, findings);
  if (findings.length === 0) evaluateEvidence(request, evidence, findings);

  const verdict = findings.some(finding => finding.severity === 'FAIL')
    ? 'FAIL'
    : findings.length > 0
      ? 'WARN'
      : 'PASS';

  return deepFreeze({
    validationId: request.validationId,
    videoRequestId: request.videoRequestId,
    videoAssetId: request.videoAsset.id,
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    operationId: request.operationId,
    snapshotId: request.snapshotId,
    sourceImageAssetId: request.sourceImageAssetId,
    physicalActionIRId: request.physicalActionIRId,
    canonicalAnimationSpecId: request.canonicalAnimationSpecId,
    temporalAuthority: request.temporalAuthority,
    snapshotKind: request.snapshotKind,
    stageOutcome: request.stageOutcome,
    temporalPoint: request.temporalPoint,
    worldStateSource: request.worldStateSource,
    temporalPosition: { ...request.temporalPosition },
    findings,
    checkedRules: [...CHECKED_RULES],
    evidenceSource: { ...evidence.source },
    validatedAt: evidence.observedAt,
    metadata: request.metadata ? structuredClone(request.metadata) : undefined,
    verdict,
  });
}

export interface EvaluateVideoApprovalEligibilityInput {
  readonly validation: VideoValidationResult;
  readonly warnAcknowledged?: boolean;
}

/** Eligibility is advisory and never approves output or changes official state. */
export function evaluateVideoApprovalEligibility(
  input: EvaluateVideoApprovalEligibilityInput,
): VideoApprovalEligibility {
  if (
    input.validation.temporalAuthority !== 'OFFICIAL' ||
    input.validation.snapshotKind !== 'OFFICIAL' ||
    input.validation.stageOutcome !== 'COMMITTED'
  ) {
    return {
      eligible: false,
      requiresAcknowledgement: false,
      reason: 'TEMPORAL_INELIGIBLE',
    };
  }
  if (input.validation.verdict === 'FAIL') {
    return { eligible: false, requiresAcknowledgement: false, reason: 'FAIL' };
  }
  if (input.validation.verdict === 'WARN') {
    if (input.warnAcknowledged === true) {
      return { eligible: true, requiresAcknowledgement: false, reason: 'WARN_ACKNOWLEDGED' };
    }
    return {
      eligible: false,
      requiresAcknowledgement: true,
      reason: 'WARN_ACKNOWLEDGEMENT_REQUIRED',
    };
  }
  return { eligible: true, requiresAcknowledgement: false, reason: 'PASS' };
}

function validateBinding(
  request: VideoValidationRequest,
  evidence: VideoValidationEvidence,
  findings: VideoValidationFinding[],
): void {
  if (evidence.validationId !== request.validationId) {
    fail(findings, 'EVIDENCE_VALIDATION_MISMATCH', 'Evidence validationId does not match.');
  }
  if (evidence.videoRequestId !== request.videoRequestId) {
    fail(findings, 'EVIDENCE_REQUEST_MISMATCH', 'Evidence videoRequestId does not match.');
  }
  if (evidence.videoAssetId !== request.videoAsset.id) {
    fail(findings, 'EVIDENCE_ASSET_MISMATCH', 'Evidence videoAssetId does not match.');
  }
}

function evaluateEvidence(
  request: VideoValidationRequest,
  evidence: VideoValidationEvidence,
  findings: VideoValidationFinding[],
): void {
  if (evidence.coverage !== 'SUFFICIENT') {
    warn(findings, 'INSUFFICIENT_EVIDENCE', `Video evidence coverage is ${evidence.coverage}.`);
  }

  const required = request.expectedMotionFacts.requiredPrimaryAction.description;
  const observed = evidence.observedPrimaryAction?.trim();
  if (observed && normalize(observed) !== normalize(required)) {
    fail(
      findings,
      'WRONG_PRIMARY_ACTION',
      `Observed primary action '${observed}' does not match '${required}'.`,
      observed,
    );
  } else if (
    evidence.coverage === 'SUFFICIENT' &&
    (!observed || evidence.missingActions.some(action => normalize(action) === normalize(required)))
  ) {
    fail(findings, 'MISSING_PRIMARY_ACTION', `Required primary action '${required}' is missing.`, required);
  }

  for (const action of unique(evidence.futureActions)) {
    fail(findings, 'FUTURE_ACTION', `Future action '${action}' was observed.`, action);
  }

  const allowed = new Set(request.expectedMotionFacts.allowedSecondaryActions.map(normalize));
  for (const action of unique(evidence.unexpectedActions)) {
    if (!allowed.has(normalize(action))) {
      fail(findings, 'UNEXPECTED_ACTION', `Unapproved action '${action}' was observed.`, action);
    }
  }

  for (const anomaly of evidence.temporalAnomalies) {
    fail(findings, 'TEMPORAL_ANOMALY', anomaly.message, anomaly.element);
  }

  evaluateConsistency(
    findings,
    'SOURCE_IMAGE_CONTINUITY',
    'Official source image continuity',
    evidence.sourceFrameConsistency,
  );
  evaluateConsistency(findings, 'CHARACTER_CONTINUITY', 'Character', evidence.characterConsistency);
  evaluateConsistency(findings, 'CLOTHING_CONTINUITY', 'Clothing', evidence.clothingConsistency);
  evaluateConsistency(findings, 'ENVIRONMENT_CONTINUITY', 'Environment', evidence.environmentConsistency);
  evaluateConsistency(
    findings,
    'CONSTRUCTION_CONTINUITY',
    'Construction geometry',
    evidence.constructionConsistency,
  );
  evaluateConsistency(findings, 'MATERIAL_CONTINUITY', 'Materials', evidence.materialConsistency);
  evaluateConsistency(findings, 'CAMERA_CONTINUITY', 'Camera', evidence.cameraConsistency);
  evaluateMotionQuality(findings, evidence.motionQuality);
  evaluateDuration(request, evidence, findings);
}

function evaluateConsistency(
  findings: VideoValidationFinding[],
  code: VideoValidationFindingCode,
  label: string,
  observation: VideoConsistencyObservation,
): void {
  if (observation === 'MATCH') return;
  if (observation === 'MAJOR_DIVERGENCE') {
    fail(findings, code, `${label} has a major divergence.`);
    return;
  }
  if (observation === 'MINOR_DIVERGENCE') {
    warn(findings, code, `${label} has a minor divergence.`);
    return;
  }
  warn(findings, code, `${label} consistency is unknown.`);
}

function evaluateMotionQuality(
  findings: VideoValidationFinding[],
  quality: VideoMotionQuality,
): void {
  if (quality === 'ACCEPTABLE') return;
  if (quality === 'MAJOR_ISSUE') {
    fail(findings, 'MOTION_QUALITY', 'Video motion has a major quality issue.');
    return;
  }
  warn(findings, 'MOTION_QUALITY', `Video motion quality is ${quality.toLowerCase()}.`);
}

function evaluateDuration(
  request: VideoValidationRequest,
  evidence: VideoValidationEvidence,
  findings: VideoValidationFinding[],
): void {
  const observed = evidence.durationObserved;
  if (observed === undefined) {
    if (evidence.coverage === 'SUFFICIENT') {
      warn(findings, 'INSUFFICIENT_EVIDENCE', 'Observed video duration was not supplied.');
    }
    return;
  }
  if (!Number.isFinite(observed) || observed <= 0) {
    fail(findings, 'DURATION_MISMATCH', 'Observed video duration is invalid.');
    return;
  }
  const expected = request.expectedOutputFacts.expectedDuration;
  const difference = Math.abs(observed - expected);
  if (difference > Math.max(1, expected * 0.2)) {
    fail(findings, 'DURATION_MISMATCH', `Observed duration ${observed}s differs from ${expected}s.`);
  } else if (difference > 0.25) {
    warn(findings, 'DURATION_MISMATCH', `Observed duration ${observed}s slightly differs from ${expected}s.`);
  }
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function fail(
  findings: VideoValidationFinding[],
  code: VideoValidationFindingCode,
  message: string,
  element?: string,
): void {
  findings.push({ code, severity: 'FAIL', message, element });
}

function warn(
  findings: VideoValidationFinding[],
  code: VideoValidationFindingCode,
  message: string,
  element?: string,
): void {
  findings.push({ code, severity: 'WARN', message, element });
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
