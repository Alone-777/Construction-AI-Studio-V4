import type { ImageGenerationRequest } from '../image-generation';
import type { VisualValidationResult } from '../visual-validation';
import { getImageGenerationAttemptNumber } from './correction-plan';
import type { VisualRetryEligibility } from './types';

export interface EvaluateVisualRetryEligibilityInput {
  readonly request: ImageGenerationRequest;
  readonly validation: VisualValidationResult;
  readonly maxAttempts: number;
  readonly retryWarn?: boolean;
}

export function evaluateVisualRetryEligibility(
  input: EvaluateVisualRetryEligibilityInput,
): VisualRetryEligibility {
  const currentAttempt = getImageGenerationAttemptNumber(input.request) ?? 0;
  const validConfiguration = Number.isInteger(input.maxAttempts) && input.maxAttempts >= 1;
  const validBinding = input.validation.requestId === input.request.requestId &&
    input.validation.projectId === input.request.projectId &&
    input.validation.sceneId === input.request.sceneId &&
    input.validation.stageId === input.request.stageId &&
    input.validation.operationId === input.request.metadata.operationId &&
    input.validation.snapshotId === input.request.metadata.snapshotId &&
    input.validation.canonicalSpecId === input.request.metadata.canonicalSpecId &&
    input.validation.temporalAuthority === input.request.temporalAuthority &&
    input.validation.snapshotKind === input.request.snapshotKind &&
    input.validation.stageOutcome === input.request.metadata.stageOutcome &&
    input.validation.temporalPoint === input.request.metadata.temporalPoint;
  if (!validConfiguration || !validBinding || currentAttempt === 0) {
    return result('INVALID_BINDING', false, currentAttempt, input.maxAttempts,
      'INVALID_CONFIGURATION_OR_BINDING');
  }
  if (input.validation.verdict === 'PASS') {
    return result('NO_RETRY', false, currentAttempt, input.maxAttempts, 'PASS_NO_RETRY');
  }
  if (requiresRevalidation(input.validation)) {
    return result(
      'REVALIDATE',
      false,
      currentAttempt,
      input.maxAttempts,
      'EVIDENCE_REVALIDATION_REQUIRED',
    );
  }
  if (input.validation.verdict === 'WARN' && input.retryWarn !== true) {
    return result(
      'NO_RETRY',
      false,
      currentAttempt,
      input.maxAttempts,
      'WARN_RETRY_NOT_REQUESTED',
    );
  }
  if (currentAttempt >= input.maxAttempts) {
    return result(
      'RETRY_EXHAUSTED',
      false,
      currentAttempt,
      input.maxAttempts,
      'MAX_ATTEMPTS_REACHED',
    );
  }
  return result(
    'RETRY',
    true,
    currentAttempt,
    input.maxAttempts,
    input.validation.verdict === 'FAIL' ? 'FAIL_RETRY_ALLOWED' : 'WARN_RETRY_ALLOWED',
    currentAttempt + 1,
  );
}

function requiresRevalidation(validation: VisualValidationResult): boolean {
  return validation.findings.some(finding =>
    finding.code === 'INSUFFICIENT_EVIDENCE' ||
    finding.code === 'EVIDENCE_VALIDATION_MISMATCH' ||
    finding.code === 'EVIDENCE_REQUEST_MISMATCH' ||
    finding.code === 'EVIDENCE_ASSET_MISMATCH'
  );
}

function result(
  decision: VisualRetryEligibility['decision'],
  retry: boolean,
  currentAttempt: number,
  maxAttempts: number,
  reason: VisualRetryEligibility['reason'],
  nextAttempt?: number,
): VisualRetryEligibility {
  return { decision, retry, currentAttempt, nextAttempt, maxAttempts, reason };
}
