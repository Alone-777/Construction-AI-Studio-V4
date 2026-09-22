const CONTINUITY_FAILURES = {
  source: ['SOURCE_CONTINUITY_DRIFT', 'Start from the exact supplied source frame without resetting or redesigning the scene.'],
  worker: ['CHARACTER_DRIFT', 'Preserve the exact worker identity, clothing, proportions and protective equipment.'],
  environment: ['ENVIRONMENT_DRIFT', 'Preserve the exact terrain, vegetation, background, weather and lighting.'],
  geometry: ['GEOMETRY_DRIFT', 'Preserve existing geometry and change only the authorized work zone through visible physical action.'],
};

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function failure(code, message, correction) {
  return { code, message, correction };
}

function uniqueFailures(values) {
  const byCode = new Map();
  for (const item of values) {
    if (!item?.code) continue;
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }
  return [...byCode.values()].slice(0, 10);
}

export function assessFiscalRound(context, analysis, {
  progressTolerance = 12,
  minimumEvidenceConfidence = 0.55,
  minimumPassConfidence = 0.85,
} = {}) {
  const job = context?.job ?? {};
  const target = Number(job.targetStagePercentage);
  const observed = analysis.observedStagePercentage;
  const failures = [...analysis.failures];
  const blockers = [];
  const warnings = [];

  if (!Number.isFinite(target) || target < 0 || target > 100) {
    blockers.push('INVALID_JOB_TARGET');
  }
  if (observed === null || !Number.isFinite(observed)) {
    blockers.push('APPARENT_COMPLETION_UNKNOWN');
  } else if (Number.isFinite(target)) {
    if (observed > target + progressTolerance) {
      failures.push(failure(
        'PROGRESS_OVERSHOOT',
        `Observed progress ${observed}% exceeds the ${target}% target.`,
        `Stop clearly at ${target}% and leave the remaining portion visibly unfinished.`,
      ));
    }
    if (observed < target - progressTolerance) {
      failures.push(failure(
        'PROGRESS_UNDERSHOOT',
        `Observed progress ${observed}% is below the ${target}% target.`,
        `Advance the visible physical result to approximately ${target}% before the clip ends.`,
      ));
    }
  }

  for (const [field, [code, correction]] of Object.entries(CONTINUITY_FAILURES)) {
    const value = analysis.continuity[field];
    if (value === 'UNKNOWN') {
      blockers.push(`${field.toUpperCase()}_CONTINUITY_UNKNOWN`);
    } else if (value !== 'MATCH') {
      failures.push(failure(
        code,
        `${field} continuity is ${value.toLowerCase().replaceAll('_', ' ')}.`,
        correction,
      ));
    }
  }

  if (analysis.futureElementsVisible.length) {
    failures.push(failure(
      'FUTURE_ELEMENT_LEAK',
      `Forbidden future elements are visible: ${analysis.futureElementsVisible.join(', ')}.`,
      `Keep these future elements absent: ${analysis.futureElementsVisible.join(', ')}.`,
    ));
  }
  if (analysis.missingEvidence.length) {
    failures.push(failure(
      'MISSING_EVIDENCE',
      `Required evidence is missing: ${analysis.missingEvidence.join('; ')}.`,
      `Make these results visibly undeniable before the clip ends: ${analysis.missingEvidence.join('; ')}.`,
    ));
  }

  if (analysis.terminalFrameValid === null) {
    blockers.push('TERMINAL_FRAME_UNKNOWN');
  } else if (!analysis.terminalFrameValid) {
    failures.push(failure(
      'TERMINAL_FRAME_INVALID',
      'The terminal frame is not stable and reusable.',
      'End on a stable, unobstructed frame that can be reused as the next Job source.',
    ));
  }

  if (analysis.physicalCausality === 'UNKNOWN') {
    blockers.push('PHYSICAL_CAUSALITY_UNKNOWN');
  } else if (analysis.physicalCausality !== 'VALID') {
    failures.push(failure(
      'PHYSICAL_CAUSALITY_FAILURE',
      `Physical causality is ${analysis.physicalCausality.toLowerCase()}.`,
      'Show continuous operator, tool and material contact causing every visible change; no teleportation, morphing or hidden progress.',
    ));
  }

  if (analysis.confidence < minimumEvidenceConfidence) {
    blockers.push('EVIDENCE_CONFIDENCE_TOO_LOW');
  } else if (analysis.confidence < minimumPassConfidence && failures.length === 0) {
    blockers.push('AUTOPASS_CONFIDENCE_TOO_LOW');
  }
  if (analysis.uncertainties.length) warnings.push(...analysis.uncertainties);

  const normalizedFailures = uniqueFailures(failures);
  return {
    verdict: normalizedFailures.length
      ? 'RETRY'
      : blockers.length
        ? 'REVIEW_REQUIRED'
        : 'PASS',
    observedStagePercentage: observed,
    confidence: analysis.confidence,
    continuity: analysis.continuity,
    failures: normalizedFailures,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    summary: analysis.summary,
  };
}

export function combineFiscalRounds(context, primary, verification, {
  maximumProgressDisagreement = 12,
} = {}) {
  const observedValues = [primary.observedStagePercentage, verification.observedStagePercentage]
    .filter(value => Number.isFinite(value));
  const observedStagePercentage = observedValues.length
    ? Math.round((observedValues.reduce((sum, value) => sum + value, 0) / observedValues.length) * 10) / 10
    : null;
  const progressDisagreement = observedValues.length === 2
    ? Math.abs(observedValues[0] - observedValues[1])
    : null;
  const common = {
    schemaVersion: 'construction-visual-fiscal-agent/1',
    jobId: String(context?.jobId ?? context?.job?.id ?? ''),
    expectedAttempts: Number(context?.attempt ?? 0),
    expectedContactSheetSha256: String(context?.contactSheetSha256 ?? ''),
    observedStagePercentage,
    targetStagePercentage: Number(context?.job?.targetStagePercentage),
    confidence: Math.min(primary.confidence, verification.confidence),
    progressDisagreement,
    rounds: { primary, verification },
    canonicalWorldAdvanced: false,
  };

  if (
    primary.verdict === 'PASS' &&
    verification.verdict === 'PASS' &&
    progressDisagreement !== null &&
    progressDisagreement <= maximumProgressDisagreement
  ) {
    return {
      ...common,
      verdict: 'PASS',
      continuity: { source: 'MATCH', worker: 'MATCH', environment: 'MATCH', geometry: 'MATCH' },
      futureElementsAbsent: true,
      requiredEvidenceSatisfied: true,
      terminalFrameValid: true,
      failures: [],
      blockers: [],
      warnings: uniqueStrings([...primary.warnings, ...verification.warnings]),
    };
  }

  if (primary.verdict === 'RETRY' && verification.verdict === 'RETRY') {
    return {
      ...common,
      verdict: 'RETRY',
      failures: uniqueFailures([...primary.failures, ...verification.failures]),
      blockers: uniqueStrings([...primary.blockers, ...verification.blockers]),
      warnings: uniqueStrings([...primary.warnings, ...verification.warnings]),
    };
  }

  const blockers = [
    ...primary.blockers,
    ...verification.blockers,
    'INDEPENDENT_REVIEWS_DISAGREE',
  ];
  if (progressDisagreement !== null && progressDisagreement > maximumProgressDisagreement) {
    blockers.push('PROGRESS_ESTIMATES_DISAGREE');
  }
  return {
    ...common,
    verdict: 'REVIEW_REQUIRED',
    failures: [],
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings([...primary.warnings, ...verification.warnings]),
  };
}

export function reviewRequiredDecision(context, blocker, details = {}) {
  return {
    schemaVersion: 'construction-visual-fiscal-agent/1',
    verdict: 'REVIEW_REQUIRED',
    jobId: String(context?.jobId ?? context?.job?.id ?? ''),
    expectedAttempts: Number(context?.attempt ?? 0),
    expectedContactSheetSha256: String(context?.contactSheetSha256 ?? ''),
    observedStagePercentage: null,
    targetStagePercentage: Number(context?.job?.targetStagePercentage),
    confidence: 0,
    failures: [],
    blockers: [blocker],
    warnings: [],
    providerRoute: details.providerRoute ?? [],
    errorCode: details.errorCode ?? null,
    canonicalWorldAdvanced: false,
  };
}
