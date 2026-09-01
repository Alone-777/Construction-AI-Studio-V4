import type {
  VisualConsistencyObservation,
  VisualValidationEvidence,
  VisualValidationFinding,
  VisualValidationFindingCode,
  VisualValidationRequest,
  VisualValidationResult,
} from './types';

const CHECKED_RULES = [
  'EVIDENCE_BINDING',
  'EVIDENCE_SUFFICIENCY',
  'FUTURE_ELEMENT_LEAK',
  'REQUIRED_ELEMENTS',
  'TEMPORAL_CONSISTENCY',
  'CHARACTER_CONTINUITY',
  'CLOTHING_CONTINUITY',
  'ENVIRONMENT_CONTINUITY',
  'CONSTRUCTION_CONTINUITY',
  'MATERIAL_CONTINUITY',
  'GEOMETRY_CONTINUITY',
  'PREVIOUS_OFFICIAL_CONTINUITY',
] as const;

export function validateVisualContinuity(
  request: VisualValidationRequest,
  evidence: VisualValidationEvidence,
): VisualValidationResult {
  const findings: VisualValidationFinding[] = [];
  validateBinding(request, evidence, findings);

  if (findings.length === 0) {
    evaluateEvidence(request, evidence, findings);
  }

  const verdict = findings.some(finding => finding.severity === 'FAIL')
    ? 'FAIL'
    : findings.length > 0
      ? 'WARN'
      : 'PASS';

  return {
    validationId: request.validationId,
    requestId: request.requestId,
    assetId: request.candidateAsset.id,
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    operationId: request.operationId,
    snapshotId: request.snapshotId,
    canonicalSpecId: request.canonicalSpecId,
    temporalAuthority: request.temporalAuthority,
    snapshotKind: request.snapshotKind,
    stageOutcome: request.stageOutcome,
    temporalPoint: request.temporalPoint,
    verdict,
    findings,
    checkedRules: [...CHECKED_RULES],
    evidenceSource: { ...evidence.source },
    validatedAt: evidence.observedAt,
  };
}

function validateBinding(
  request: VisualValidationRequest,
  evidence: VisualValidationEvidence,
  findings: VisualValidationFinding[],
): void {
  if (evidence.validationId !== request.validationId) {
    fail(findings, 'EVIDENCE_VALIDATION_MISMATCH', 'Evidence validationId does not match.');
  }
  if (evidence.requestId !== request.requestId) {
    fail(findings, 'EVIDENCE_REQUEST_MISMATCH', 'Evidence requestId does not match.');
  }
  if (evidence.assetId !== request.candidateAsset.id) {
    fail(findings, 'EVIDENCE_ASSET_MISMATCH', 'Evidence assetId does not match.');
  }
}

function evaluateEvidence(
  request: VisualValidationRequest,
  evidence: VisualValidationEvidence,
  findings: VisualValidationFinding[],
): void {
  if (evidence.coverage !== 'SUFFICIENT') {
    warn(findings, 'INSUFFICIENT_EVIDENCE', `Evidence coverage is ${evidence.coverage}.`);
  }

  const forbidden = new Set(request.expected.forbiddenFutureElements);
  const observedFuture = unique([
    ...evidence.detectedElements,
    ...evidence.unexpectedElements,
  ]).filter(element => forbidden.has(element));
  for (const element of observedFuture) {
    fail(findings, 'FUTURE_ELEMENT_LEAK', `Forbidden future element ${element} was observed.`, element);
  }

  const detected = new Set(evidence.detectedElements);
  const explicitMissing = new Set(evidence.missingElements);
  const missingRequired = request.expected.requiredElements.filter(element =>
    explicitMissing.has(element) ||
    (evidence.coverage === 'SUFFICIENT' && !detected.has(element))
  );
  for (const element of unique(missingRequired)) {
    fail(findings, 'REQUIRED_ELEMENT_MISSING', `Required element ${element} is missing.`, element);
  }

  for (const anomaly of evidence.temporalAnomalies) {
    fail(findings, 'TEMPORAL_ANOMALY', anomaly.message, anomaly.element);
  }

  for (const element of unique(evidence.unexpectedElements).filter(item => !forbidden.has(item))) {
    warn(findings, 'UNEXPECTED_ELEMENT', `Unexpected element ${element} was observed.`, element);
  }

  evaluateConsistency(findings, 'CHARACTER_CONTINUITY', 'Character', evidence.characterConsistency);
  evaluateConsistency(findings, 'CLOTHING_CONTINUITY', 'Clothing', evidence.clothingConsistency);
  evaluateConsistency(findings, 'ENVIRONMENT_CONTINUITY', 'Environment', evidence.environmentConsistency);
  evaluateConsistency(findings, 'CONSTRUCTION_CONTINUITY', 'Construction', evidence.constructionConsistency);
  evaluateConsistency(findings, 'MATERIAL_CONTINUITY', 'Material', evidence.materialConsistency);
  evaluateConsistency(findings, 'GEOMETRY_CONTINUITY', 'Geometry', evidence.geometryConsistency);

  if (request.previousOfficialReference) {
    if (evidence.previousOfficialContinuity === 'NOT_APPLICABLE') {
      warn(
        findings,
        'PREVIOUS_OFFICIAL_CONTINUITY',
        'Previous official continuity was not evaluated.',
      );
    } else {
      evaluateConsistency(
        findings,
        'PREVIOUS_OFFICIAL_CONTINUITY',
        'Previous official reference',
        evidence.previousOfficialContinuity,
      );
    }
  }
}

function evaluateConsistency(
  findings: VisualValidationFinding[],
  code: VisualValidationFindingCode,
  label: string,
  observation: VisualConsistencyObservation,
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

function fail(
  findings: VisualValidationFinding[],
  code: VisualValidationFindingCode,
  message: string,
  element?: string,
): void {
  findings.push({ code, severity: 'FAIL', message, element });
}

function warn(
  findings: VisualValidationFinding[],
  code: VisualValidationFindingCode,
  message: string,
  element?: string,
): void {
  findings.push({ code, severity: 'WARN', message, element });
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
