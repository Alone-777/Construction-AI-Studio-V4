import {
  withImageGenerationPrompt,
  type ImageGenerationRequest,
  type ImageMetadataValue,
} from '../image-generation';
import { getImageGenerationAttemptNumber } from './correction-plan';
import type {
  CreateCorrectedImageGenerationRequestResult,
  VisualCorrectionFailure,
  VisualCorrectionPlan,
} from './types';

/**
 * Builds a derived prompt layer without changing the canonical spec or temporal identity.
 * The failed candidate is intentionally not added as a reference; official references are preserved.
 */
export function createCorrectedImageGenerationRequest(
  request: ImageGenerationRequest,
  plan: VisualCorrectionPlan,
): CreateCorrectedImageGenerationRequestResult {
  if (!planMatchesRequest(plan, request)) {
    return failure('PLAN_REQUEST_MISMATCH', 'Correction plan does not belong to this request.');
  }
  const currentAttempt = getImageGenerationAttemptNumber(request);
  if (!currentAttempt || plan.attemptNumber !== currentAttempt + 1) {
    return failure('INVALID_ATTEMPT_IDENTITY', 'Correction plan does not create the next attempt.');
  }
  if (plan.issues.every(issue => issue.code === 'INSUFFICIENT_EVIDENCE')) {
    return failure('REVALIDATION_REQUIRED', 'Insufficient evidence requires revalidation, not regeneration.');
  }
  if (plan.previousOfficialReference) {
    const preserved = request.references.some(
      reference => reference.asset.id === plan.previousOfficialReference?.assetId,
    );
    if (!preserved) {
      return failure(
        'PREVIOUS_OFFICIAL_REFERENCE_INVALID',
        'Correction request no longer contains its previous official reference.',
      );
    }
  }

  const prompt = renderCorrectionLayer(request.prompt, plan);
  const correctionMetadata: Readonly<Record<string, ImageMetadataValue>> = {
    visualCorrection: {
      correctionPlanId: plan.correctionPlanId,
      attemptNumber: plan.attemptNumber,
      sourceRequestId: plan.sourceRequestId,
      sourceAssetId: plan.sourceAssetId,
      sourceValidationId: plan.sourceValidationId,
    },
  };
  const corrected = withImageGenerationPrompt(request, prompt, correctionMetadata);
  if (corrected.requestId === request.requestId) {
    return failure('REQUEST_ID_UNCHANGED', 'Corrected semantic content must create a new requestId.');
  }
  return { status: 'CREATED', request: corrected };
}

function planMatchesRequest(plan: VisualCorrectionPlan, request: ImageGenerationRequest): boolean {
  return plan.sourceRequestId === request.requestId &&
    plan.projectId === request.projectId &&
    plan.sceneId === request.sceneId &&
    plan.stageId === request.stageId &&
    plan.operationId === request.metadata.operationId &&
    plan.snapshotId === request.metadata.snapshotId &&
    plan.canonicalSpecId === request.metadata.canonicalSpecId &&
    plan.temporalAuthority === request.temporalAuthority &&
    plan.snapshotKind === request.snapshotKind &&
    plan.stageOutcome === request.metadata.stageOutcome &&
    plan.temporalPoint === request.metadata.temporalPoint &&
    plan.worldStateSource === request.metadata.worldStateSource;
}

function renderCorrectionLayer(requestPrompt: string, plan: VisualCorrectionPlan): string {
  return [
    requestPrompt,
    '',
    'VISUAL CORRECTION LAYER',
    `correction plan: ${plan.correctionPlanId}`,
    `attempt: ${plan.attemptNumber}`,
    'CHANGE ONLY:',
    ...plan.correctionInstructions.map(instruction => `- ${instruction}`),
    'PRESERVE:',
    ...plan.preserveConstraints.map(constraint => `- ${constraint}`),
    'FORBIDDEN CHANGES:',
    ...plan.forbiddenChanges.map(change => `- ${change}`),
  ].join('\n');
}

function failure(
  errorCode: VisualCorrectionFailure['errorCode'],
  message: string,
): VisualCorrectionFailure {
  return { status: 'FAILURE', errorCode, message };
}
