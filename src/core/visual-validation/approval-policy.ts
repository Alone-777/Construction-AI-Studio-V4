import type { VisualApprovalEligibility, VisualValidationResult } from './types';

export interface EvaluateVisualApprovalEligibilityInput {
  readonly validation: VisualValidationResult;
  readonly warnAcknowledged?: boolean;
}

/** Eligibility is advisory and never performs approval or mutates official memory. */
export function evaluateVisualApprovalEligibility(
  input: EvaluateVisualApprovalEligibilityInput,
): VisualApprovalEligibility {
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
