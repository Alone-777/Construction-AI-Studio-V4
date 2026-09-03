import { compileCanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-compiler';
import { renderCanonicalImagePrompt } from '../image-prompts/canonical-image-prompt-renderer';
import {
  completeManualImageGeneration,
  createImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProviderKind,
} from '../image-generation';
import {
  createCorrectedImageGenerationRequest,
  createVisualCorrectionPlan,
  evaluateVisualRetryEligibility,
  getImageGenerationAttemptNumber,
} from '../visual-correction';
import {
  approveGeneratedImageAsOfficial,
  enrichImageGenerationRequestWithOfficialReference,
  selectBestOfficialReference,
} from '../visual-reference';
import {
  createVisualValidationRequest,
  evaluateVisualApprovalEligibility,
  validateVisualContinuity,
} from '../visual-validation';
import {
  completeManualVideoGeneration,
  createCanonicalAnimationPromptSpec,
  createVideoGenerationRequest,
  type VideoGenerationResult,
} from '../video-generation';
import {
  createCorrectedVideoGenerationRequest,
  createVideoCorrectionPlan,
  createVideoValidationRequest,
  evaluateVideoApprovalEligibility,
  evaluateVideoRetryEligibility,
  getVideoGenerationAttemptNumber,
  validateVideoContinuity,
} from '../video-validation';
import type {
  ApprovePipelineImageInput,
  CreateVisualPipelineOrchestratorInput,
  StartVisualPipelineInput,
  VisualPipelineFailure,
  VisualPipelineFailureCode,
  VisualPipelineImageAttempt,
  VisualPipelineOrchestrator,
  VisualPipelineRequiredAction,
  VisualPipelineRun,
  VisualPipelineStepResult,
  VisualPipelineVideoAttempt,
} from './types';

const DEFAULT_WORKFLOW_VERSION = 'visual-pipeline-v1';
const BINDING_FINDINGS = new Set([
  'EVIDENCE_VALIDATION_MISMATCH',
  'EVIDENCE_REQUEST_MISMATCH',
  'EVIDENCE_ASSET_MISMATCH',
]);

export function createVisualPipelineOrchestrator(
  input: CreateVisualPipelineOrchestratorInput,
): VisualPipelineOrchestrator {
  const maxImageAttempts = input.maxImageAttempts ?? 3;
  const maxVideoAttempts = input.maxVideoAttempts ?? 3;
  const workflowVersion = input.workflowVersion?.trim() || DEFAULT_WORKFLOW_VERSION;
  assertRetryLimit(maxImageAttempts, 'image');
  assertRetryLimit(maxVideoAttempts, 'video');
  const imageObservers = providerMap(input.imageObservationProviders, 'image observation');
  const videoObservers = providerMap(input.videoObservationProviders, 'video observation');

  return {
    start(startInput) {
      const preparationFailure = validateStartInput(startInput);
      if (preparationFailure) return failure(undefined, preparationFailure.code, preparationFailure.message);

      const physicalAction = clone(startInput.physicalAction);
      const snapshot = clone(startInput.snapshot);
      const canonicalImageSpec = compileCanonicalImagePromptSpec(snapshot);
      if (!canonicalImageSpec) {
        return failure(undefined, 'INVALID_INPUT', 'An OFFICIAL visual snapshot is required.');
      }

      try {
        const baseRequest = createImageGenerationRequest({
          canonicalSpec: canonicalImageSpec,
          providerPrompt: {
            canonicalSpecId: canonicalImageSpec.id,
            prompt: renderCanonicalImagePrompt(canonicalImageSpec),
            mode: 'GENERATE',
            adapterId: 'canonical-image-prompt-renderer',
          },
          providerId: startInput.image.providerId,
          mode: 'GENERATE',
          aspectRatio: startInput.image.aspectRatio,
          resolution: startInput.image.resolution,
          temporalPosition: startInput.image.temporalPosition,
          metadata: startInput.image.metadata,
        });
        const previousOfficialReference = selectBestOfficialReference(startInput.memory, baseRequest);
        const request = enrichImageGenerationRequestWithOfficialReference(
          baseRequest,
          previousOfficialReference,
        );
        const run = freezeRun({
          runId: createRunId(workflowVersion, canonicalImageSpec.id, snapshot.id),
          workflowVersion,
          status: 'READY',
          currentPhase: 'IMAGE_REQUEST_READY',
          temporalIdentity: {
            projectId: snapshot.identity.projectId,
            sceneId: snapshot.identity.sceneId,
            stageId: snapshot.identity.stageId,
            operationId: snapshot.identity.operationId,
            snapshotId: snapshot.id,
            physicalActionIRId: physicalAction.id,
            canonicalSpecId: canonicalImageSpec.id,
            temporalAuthority: 'OFFICIAL',
            snapshotKind: 'OFFICIAL',
            stageOutcome: 'COMMITTED',
            temporalPoint: 'AFTER',
            worldStateSource: 'CANDIDATE',
            temporalPosition: { ...startInput.image.temporalPosition },
          },
          physicalAction,
          snapshot,
          canonicalImageSpec: clone(canonicalImageSpec),
          memory: startInput.memory,
          imageState: {
            request,
            previousOfficialReference,
            warningAcknowledged: false,
            history: [],
          },
          videoConfig: clone(startInput.video),
          retryInfo: {
            imageAttempt: 1,
            imageMaxAttempts: maxImageAttempts,
            videoMaxAttempts: maxVideoAttempts,
          },
          warnings: [],
          errors: [],
        });
        return success(run);
      } catch (error) {
        return failure(undefined, 'INVALID_INPUT', messageOf(error));
      }
    },

    async generateImage(run) {
      const invalid = requirePhase(run, ['IMAGE_REQUEST_READY']);
      if (invalid) return invalid;
      let result: ImageGenerationResult;
      try {
        result = clone(await input.imageGenerationService.generate(run.imageState.request));
      } catch (error) {
        return terminalFailure(run, 'PROVIDER_FAILURE', messageOf(error), 'PROVIDER_EXECUTION_ERROR');
      }
      if (result.requestId !== run.imageState.request.requestId ||
          result.providerId !== run.imageState.request.providerId) {
        return terminalFailure(
          run,
          'PROVIDER_FAILURE',
          'Image provider returned a result for another request.',
          'PROVIDER_MISMATCH',
        );
      }
      if (result.status === 'FAILURE') {
        return terminalFailure(run, 'PROVIDER_FAILURE', result.message, result.errorCode);
      }
      if (result.status === 'MANUAL_READY') {
        return success(transition(run, {
          status: 'MANUAL_ACTION_REQUIRED',
          currentPhase: 'IMAGE_MANUAL_ACTION_REQUIRED',
          imageState: { ...run.imageState, result },
          requiredAction: action(
            'GENERATE_IMAGE_EXTERNALLY',
            'Generate the image externally and submit its lightweight asset reference.',
            run.imageState.request.requestId,
          ),
        }));
      }
      return success(imageValidationRequired(run, result));
    },

    submitImage(run, submission) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (imageSubmissionAlreadyApplied(run, submission)) return success(run);
      if (run.currentPhase !== 'IMAGE_MANUAL_ACTION_REQUIRED' ||
          run.imageState.result?.status !== 'MANUAL_READY') {
        return invalidState(run, 'Image submission requires IMAGE_MANUAL_ACTION_REQUIRED.');
      }
      const result = completeManualImageGeneration({
        request: run.imageState.request,
        manualReadyResult: run.imageState.result,
        submission,
      });
      if (result.status !== 'SUCCESS') {
        return failure(run, submissionFailureCode(run.imageState.request.requestId, submission),
          result.status === 'FAILURE' ? result.message : 'Image completion did not produce SUCCESS.',
          result.status === 'FAILURE' ? result.errorCode : 'MANUAL_COMPLETION_RESULT_REQUIRED');
      }
      return success(imageValidationRequired(run, clone(result)));
    },

    async validateImage(run, observationProviderId) {
      const invalid = requirePhase(run, ['IMAGE_VALIDATION_REQUIRED']);
      if (invalid) return invalid;
      const result = run.imageState.result;
      if (!result || result.status !== 'SUCCESS') {
        return invalidState(run, 'Image validation requires an unreviewed SUCCESS image.');
      }
      const provider = imageObservers.get(observationProviderId);
      if (!provider) {
        return failure(run, 'UNKNOWN_OBSERVATION_PROVIDER',
          `Image observation provider '${observationProviderId}' is not configured.`);
      }
      try {
        const validationRequest = createVisualValidationRequest({
          request: run.imageState.request,
          result,
          canonicalSpec: run.canonicalImageSpec,
          previousOfficialReference: run.imageState.previousOfficialReference,
        });
        const evidence = await provider.observe(clone(validationRequest));
        const validation = validateVisualContinuity(validationRequest, clone(evidence));
        if (hasBindingFailure(validation.findings)) {
          return failure(run, 'VALIDATION_BINDING_MISMATCH',
            'Image evidence does not match this run request and asset.');
        }
        const imageState = {
          ...run.imageState,
          validationRequest,
          validation,
          warningAcknowledged: false,
        };
        const base = {
          imageState,
          lastValidation: { kind: 'IMAGE' as const, result: validation },
        };
        if (validation.verdict === 'PASS') {
          return success(transition(run, {
            ...base,
            status: 'APPROVAL_REQUIRED',
            currentPhase: 'IMAGE_APPROVAL_REQUIRED',
            requiredAction: action('APPROVE_IMAGE',
              'Explicitly approve the validated image before it becomes official.',
              run.imageState.request.requestId, validation.validationId),
          }));
        }
        if (validation.verdict === 'WARN') {
          if (hasInsufficientEvidence(validation.findings)) {
            return success(transition(run, {
              ...base,
              status: 'VALIDATION_REQUIRED',
              currentPhase: 'IMAGE_VALIDATION_REQUIRED',
              requiredAction: action('PROVIDE_IMAGE_EVIDENCE',
                'Provide sufficient image evidence; the pipeline will not pass automatically.',
                run.imageState.request.requestId, validation.validationId),
            }));
          }
          return success(transition(run, {
            ...base,
            status: 'APPROVAL_REQUIRED',
            currentPhase: 'IMAGE_APPROVAL_REQUIRED',
            requiredAction: action('ACKNOWLEDGE_IMAGE_WARNING',
              'Explicitly acknowledge the image warning before approval, or request a retry.',
              run.imageState.request.requestId, validation.validationId),
          }));
        }
        return success(transition(run, {
          ...base,
          status: 'CORRECTION_REQUIRED',
          currentPhase: 'IMAGE_CORRECTION_REQUIRED',
          requiredAction: action('RETRY_IMAGE',
            'Create an explicit corrected image request from the failed validation.',
            run.imageState.request.requestId, validation.validationId),
        }));
      } catch (error) {
        return failure(run, 'OBSERVATION_PROVIDER_FAILURE', messageOf(error));
      }
    },

    acknowledgeImageWarning(run) {
      const invalid = requirePhase(run, ['IMAGE_APPROVAL_REQUIRED']);
      if (invalid) return invalid;
      const validation = run.imageState.validation;
      if (!validation || validation.verdict !== 'WARN') {
        return invalidState(run, 'Image warning acknowledgement requires a WARN validation.');
      }
      const eligibility = evaluateVisualApprovalEligibility({ validation, warnAcknowledged: true });
      if (!eligibility.eligible) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL', 'Image warning cannot be acknowledged.');
      }
      return success(transition(run, {
        imageState: { ...run.imageState, warningAcknowledged: true },
        requiredAction: action('APPROVE_IMAGE',
          'Explicitly approve the acknowledged image before it becomes official.',
          run.imageState.request.requestId, validation.validationId),
      }));
    },

    retryImage(run) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (run.currentPhase === 'IMAGE_REQUEST_READY' &&
          getImageGenerationAttemptNumber(run.imageState.request)! > 1) return success(run);
      if (run.currentPhase !== 'IMAGE_CORRECTION_REQUIRED' &&
          !(run.currentPhase === 'IMAGE_APPROVAL_REQUIRED' &&
            run.imageState.validation?.verdict === 'WARN')) {
        return invalidState(run, 'Image retry requires FAIL or an explicit retry of WARN.');
      }
      const candidate = run.imageState.result;
      const validation = run.imageState.validation;
      if (!candidate || !validation) return invalidState(run, 'Image retry requires candidate and validation.');
      const retryWarn = validation.verdict === 'WARN';
      const eligibility = evaluateVisualRetryEligibility({
        request: run.imageState.request,
        validation,
        maxAttempts: maxImageAttempts,
        retryWarn,
      });
      if (eligibility.decision === 'RETRY_EXHAUSTED') {
        return terminalFailure(run, 'RETRY_EXHAUSTED', 'Image retry limit reached.');
      }
      if (!eligibility.retry) {
        return failure(run, 'CORRECTION_FAILURE',
          `Image retry is not eligible: ${eligibility.reason}.`);
      }
      const planned = createVisualCorrectionPlan({
        request: run.imageState.request,
        candidate,
        validation,
        previousOfficialReference: run.imageState.previousOfficialReference,
        retryWarn,
      });
      if (planned.status !== 'CREATED') {
        return failure(run, 'CORRECTION_FAILURE',
          planned.status === 'FAILURE' ? planned.message : planned.reason,
          planned.status === 'FAILURE' ? planned.errorCode : undefined);
      }
      const corrected = createCorrectedImageGenerationRequest(run.imageState.request, planned.plan);
      if (corrected.status !== 'CREATED') {
        return failure(run, 'CORRECTION_FAILURE', corrected.message, corrected.errorCode);
      }
      const completedAttempt: VisualPipelineImageAttempt = {
        request: run.imageState.request,
        result: candidate,
        validationRequest: run.imageState.validationRequest,
        validation,
        correctionPlan: planned.plan,
      };
      return success(transition(run, {
        status: 'READY',
        currentPhase: 'IMAGE_REQUEST_READY',
        requiredAction: undefined,
        imageState: {
          request: corrected.request,
          previousOfficialReference: run.imageState.previousOfficialReference,
          warningAcknowledged: false,
          history: [...run.imageState.history, completedAttempt],
          correctionPlan: planned.plan,
        },
        retryInfo: {
          ...run.retryInfo,
          imageAttempt: eligibility.nextAttempt!,
        },
      }));
    },

    approveImage(run, approvalInput) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (run.imageState.officialReference) return success(run);
      if (run.currentPhase !== 'IMAGE_APPROVAL_REQUIRED') {
        return invalidState(run, 'Image approval requires IMAGE_APPROVAL_REQUIRED.');
      }
      const result = run.imageState.result;
      const validation = run.imageState.validation;
      if (!result || !validation) return invalidState(run, 'Image approval requires result and validation.');
      const eligibility = evaluateVisualApprovalEligibility({
        validation,
        warnAcknowledged: run.imageState.warningAcknowledged,
      });
      if (!eligibility.eligible) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL',
          'Image validation is not eligible for explicit approval.');
      }
      const providerKind = imageProviderKind(result);
      if (!providerKind) {
        return failure(run, 'PROVIDER_FAILURE', 'Image provider kind is missing from its result.');
      }
      try {
        const officialReference = approveGeneratedImageAsOfficial({
          request: run.imageState.request,
          result,
          providerKind,
          approval: {
            approved: true,
            recordedAt: approvalInput.recordedAt,
            metadata: approvalInput.metadata,
          },
        });
        const memory = run.memory.append(officialReference);
        return success(transition(run, {
          status: 'READY',
          currentPhase: 'IMAGE_APPROVED',
          memory,
          imageState: { ...run.imageState, officialReference },
          requiredAction: action('PREPARE_VIDEO',
            'Prepare video generation from the newly approved official image.',
            run.imageState.request.requestId),
        }));
      } catch (error) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL', messageOf(error));
      }
    },

    prepareVideo(run) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (run.videoState) return success(run);
      if (run.currentPhase !== 'IMAGE_APPROVED' || !run.imageState.officialReference) {
        return invalidState(run, 'Video preparation requires the current image to be explicitly official.');
      }
      if (!run.memory.records.some(record => record.id === run.imageState.officialReference?.id)) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL',
          'The approved image is not present in visual reference memory.');
      }
      const prepared = createCanonicalAnimationPromptSpec({
        physicalAction: run.physicalAction,
        snapshot: run.snapshot,
        source: run.imageState.officialReference,
        output: {
          durationSeconds: run.videoConfig.durationSeconds,
          resolution: run.videoConfig.resolution,
        },
      });
      if (prepared.status === 'FAILURE') {
        return failure(run, 'TEMPORAL_BINDING_MISMATCH', prepared.message, prepared.errorCode);
      }
      try {
        const request = createVideoGenerationRequest({
          providerId: run.videoConfig.providerId,
          canonicalAnimationSpec: prepared.spec,
          source: prepared.source,
          metadata: run.videoConfig.metadata,
        });
        return success(transition(run, {
          status: 'READY',
          currentPhase: 'VIDEO_REQUEST_READY',
          requiredAction: undefined,
          videoState: {
            canonicalSpec: prepared.spec,
            request,
            warningAcknowledged: false,
            history: [],
          },
          retryInfo: { ...run.retryInfo, videoAttempt: 1 },
        }));
      } catch (error) {
        return failure(run, 'INVALID_INPUT', messageOf(error));
      }
    },

    async generateVideo(run) {
      const invalid = requirePhase(run, ['VIDEO_REQUEST_READY']);
      if (invalid) return invalid;
      const videoState = run.videoState!;
      let result: VideoGenerationResult;
      try {
        result = clone(await input.videoGenerationService.generate(videoState.request));
      } catch (error) {
        return terminalFailure(run, 'PROVIDER_FAILURE', messageOf(error), 'PROVIDER_EXECUTION_ERROR');
      }
      if (result.requestId !== videoState.request.requestId ||
          result.providerId !== videoState.request.providerId) {
        return terminalFailure(run, 'PROVIDER_FAILURE',
          'Video provider returned a result for another request.', 'PROVIDER_MISMATCH');
      }
      if (result.status === 'FAILURE') {
        return terminalFailure(run, 'PROVIDER_FAILURE', result.message, result.errorCode);
      }
      if (result.status === 'MANUAL_READY') {
        return success(transition(run, {
          status: 'MANUAL_ACTION_REQUIRED',
          currentPhase: 'VIDEO_MANUAL_ACTION_REQUIRED',
          videoState: { ...videoState, result },
          requiredAction: action('GENERATE_VIDEO_EXTERNALLY',
            'Generate the video externally and submit its lightweight asset reference.',
            videoState.request.requestId),
        }));
      }
      return success(videoValidationRequired(run, result));
    },

    submitVideo(run, submission) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (videoSubmissionAlreadyApplied(run, submission)) return success(run);
      if (run.currentPhase !== 'VIDEO_MANUAL_ACTION_REQUIRED' ||
          run.videoState?.result?.status !== 'MANUAL_READY') {
        return invalidState(run, 'Video submission requires VIDEO_MANUAL_ACTION_REQUIRED.');
      }
      const result = completeManualVideoGeneration({
        request: run.videoState.request,
        manualReadyResult: run.videoState.result,
        submission,
      });
      if (result.status !== 'SUCCESS') {
        return failure(run, submissionFailureCode(run.videoState.request.requestId, submission),
          result.status === 'FAILURE' ? result.message : 'Video completion did not produce SUCCESS.',
          result.status === 'FAILURE' ? result.errorCode : 'MANUAL_COMPLETION_INVALID_RESULT_STATUS');
      }
      return success(videoValidationRequired(run, clone(result)));
    },

    async validateVideo(run, observationProviderId) {
      const invalid = requirePhase(run, ['VIDEO_VALIDATION_REQUIRED']);
      if (invalid) return invalid;
      const videoState = run.videoState!;
      const result = videoState.result;
      if (!result || result.status !== 'SUCCESS') {
        return invalidState(run, 'Video validation requires an unreviewed SUCCESS video.');
      }
      const provider = videoObservers.get(observationProviderId);
      if (!provider) {
        return failure(run, 'UNKNOWN_OBSERVATION_PROVIDER',
          `Video observation provider '${observationProviderId}' is not configured.`);
      }
      try {
        const validationRequest = createVideoValidationRequest({ request: videoState.request, result });
        const evidence = await provider.observe(clone(validationRequest));
        const validation = validateVideoContinuity(validationRequest, clone(evidence));
        if (hasBindingFailure(validation.findings)) {
          return failure(run, 'VALIDATION_BINDING_MISMATCH',
            'Video evidence does not match this run request and asset.');
        }
        const nextVideoState = {
          ...videoState,
          validationRequest,
          validation,
          warningAcknowledged: false,
        };
        const base = {
          videoState: nextVideoState,
          lastValidation: { kind: 'VIDEO' as const, result: validation },
        };
        if (validation.verdict === 'PASS') {
          return success(transition(run, {
            ...base,
            status: 'ACCEPTANCE_REQUIRED',
            currentPhase: 'VIDEO_ACCEPTANCE_REQUIRED',
            requiredAction: action('ACCEPT_VIDEO',
              'Explicitly accept the validated visual output to complete the run.',
              videoState.request.requestId, validation.validationId),
          }));
        }
        if (validation.verdict === 'WARN') {
          if (hasInsufficientEvidence(validation.findings)) {
            return success(transition(run, {
              ...base,
              status: 'VALIDATION_REQUIRED',
              currentPhase: 'VIDEO_VALIDATION_REQUIRED',
              requiredAction: action('PROVIDE_VIDEO_EVIDENCE',
                'Provide sufficient video evidence; the pipeline will not pass automatically.',
                videoState.request.requestId, validation.validationId),
            }));
          }
          return success(transition(run, {
            ...base,
            status: 'ACCEPTANCE_REQUIRED',
            currentPhase: 'VIDEO_ACCEPTANCE_REQUIRED',
            requiredAction: action('ACKNOWLEDGE_VIDEO_WARNING',
              'Explicitly acknowledge the video warning before acceptance, or request a retry.',
              videoState.request.requestId, validation.validationId),
          }));
        }
        return success(transition(run, {
          ...base,
          status: 'CORRECTION_REQUIRED',
          currentPhase: 'VIDEO_CORRECTION_REQUIRED',
          requiredAction: action('RETRY_VIDEO',
            'Create an explicit corrected video request from the failed validation.',
            videoState.request.requestId, validation.validationId),
        }));
      } catch (error) {
        return failure(run, 'OBSERVATION_PROVIDER_FAILURE', messageOf(error));
      }
    },

    acknowledgeVideoWarning(run) {
      const invalid = requirePhase(run, ['VIDEO_ACCEPTANCE_REQUIRED']);
      if (invalid) return invalid;
      const validation = run.videoState?.validation;
      if (!validation || validation.verdict !== 'WARN') {
        return invalidState(run, 'Video warning acknowledgement requires a WARN validation.');
      }
      const eligibility = evaluateVideoApprovalEligibility({ validation, warnAcknowledged: true });
      if (!eligibility.eligible) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL', 'Video warning cannot be acknowledged.');
      }
      return success(transition(run, {
        videoState: { ...run.videoState!, warningAcknowledged: true },
        requiredAction: action('ACCEPT_VIDEO',
          'Explicitly accept the acknowledged video to complete the run.',
          run.videoState!.request.requestId, validation.validationId),
      }));
    },

    retryVideo(run) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (run.currentPhase === 'VIDEO_REQUEST_READY' && run.videoState &&
          getVideoGenerationAttemptNumber(run.videoState.request)! > 1) return success(run);
      if (!run.videoState ||
          (run.currentPhase !== 'VIDEO_CORRECTION_REQUIRED' &&
           !(run.currentPhase === 'VIDEO_ACCEPTANCE_REQUIRED' &&
             run.videoState.validation?.verdict === 'WARN'))) {
        return invalidState(run, 'Video retry requires FAIL or an explicit retry of WARN.');
      }
      const candidate = run.videoState.result;
      const validation = run.videoState.validation;
      if (!candidate || !validation) return invalidState(run, 'Video retry requires candidate and validation.');
      const retryWarn = validation.verdict === 'WARN';
      const eligibility = evaluateVideoRetryEligibility({
        request: run.videoState.request,
        validation,
        maxAttempts: maxVideoAttempts,
        retryWarn,
      });
      if (eligibility.decision === 'RETRY_EXHAUSTED') {
        return terminalFailure(run, 'RETRY_EXHAUSTED', 'Video retry limit reached.');
      }
      if (!eligibility.retry) {
        return failure(run, 'CORRECTION_FAILURE',
          `Video retry is not eligible: ${eligibility.reason}.`);
      }
      const planned = createVideoCorrectionPlan({
        request: run.videoState.request,
        candidate,
        validation,
        retryWarn,
      });
      if (planned.status !== 'CREATED') {
        return failure(run, 'CORRECTION_FAILURE',
          planned.status === 'FAILURE' ? planned.message : planned.reason,
          planned.status === 'FAILURE' ? planned.errorCode : undefined);
      }
      const corrected = createCorrectedVideoGenerationRequest(run.videoState.request, planned.plan);
      if (corrected.status !== 'CREATED') {
        return failure(run, 'CORRECTION_FAILURE', corrected.message, corrected.errorCode);
      }
      const completedAttempt: VisualPipelineVideoAttempt = {
        request: run.videoState.request,
        result: candidate,
        validationRequest: run.videoState.validationRequest,
        validation,
        correctionPlan: planned.plan,
      };
      return success(transition(run, {
        status: 'READY',
        currentPhase: 'VIDEO_REQUEST_READY',
        requiredAction: undefined,
        videoState: {
          canonicalSpec: run.videoState.canonicalSpec,
          request: corrected.request,
          warningAcknowledged: false,
          history: [...run.videoState.history, completedAttempt],
          correctionPlan: planned.plan,
        },
        retryInfo: { ...run.retryInfo, videoAttempt: eligibility.nextAttempt! },
      }));
    },

    acceptVideo(run) {
      const integrityFailure = validateRunIntegrity(run);
      if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
      if (run.currentPhase === 'COMPLETED') return success(run);
      if (run.currentPhase !== 'VIDEO_ACCEPTANCE_REQUIRED' || !run.videoState?.validation) {
        return invalidState(run, 'Video acceptance requires VIDEO_ACCEPTANCE_REQUIRED.');
      }
      const eligibility = evaluateVideoApprovalEligibility({
        validation: run.videoState.validation,
        warnAcknowledged: run.videoState.warningAcknowledged,
      });
      if (!eligibility.eligible) {
        return failure(run, 'MISSING_REQUIRED_APPROVAL',
          'Video validation is not eligible for explicit acceptance.');
      }
      return success(transition(run, {
        status: 'COMPLETED',
        currentPhase: 'COMPLETED',
        requiredAction: undefined,
      }));
    },
  };
}

function validateStartInput(input: StartVisualPipelineInput): VisualPipelineFailure | undefined {
  const { physicalAction, snapshot } = input;
  const idsPresent = [
    physicalAction.id,
    physicalAction.sceneId,
    physicalAction.stageId,
    physicalAction.operationId,
    snapshot.id,
    snapshot.identity.projectId,
    snapshot.identity.sceneId,
    snapshot.identity.stageId,
    snapshot.identity.operationId,
    input.image.providerId,
    input.video.providerId,
  ].every(value => !!value.trim());
  if (!idsPresent) return pipelineError('INVALID_INPUT', 'Visual pipeline identity fields are required.');
  if (snapshot.kind !== 'OFFICIAL' || snapshot.temporalPoint !== 'AFTER' ||
      snapshot.stageOutcome !== 'COMMITTED' || snapshot.worldStateSource !== 'CANDIDATE') {
    return pipelineError('TEMPORAL_BINDING_MISMATCH',
      'Visual pipeline requires the committed OFFICIAL AFTER snapshot.');
  }
  if (physicalAction.id !== snapshot.action.physicalActionIRId ||
      physicalAction.sceneId !== snapshot.identity.sceneId ||
      physicalAction.stageId !== snapshot.identity.stageId ||
      physicalAction.operationId !== snapshot.identity.operationId ||
      physicalAction.actor.characterId !== snapshot.actor.characterId) {
    return pipelineError('TEMPORAL_BINDING_MISMATCH',
      'PhysicalActionIR does not match the supplied stage snapshot.');
  }
  const position = input.image.temporalPosition;
  if (!Number.isInteger(position.sceneOrder) || position.sceneOrder < 0 ||
      !Number.isInteger(position.stageOrder) || position.stageOrder < 0) {
    return pipelineError('INVALID_INPUT', 'A non-negative integer temporal position is required.');
  }
  if (!Number.isFinite(input.video.durationSeconds) || input.video.durationSeconds <= 0) {
    return pipelineError('INVALID_INPUT', 'Video duration must be finite and greater than zero.');
  }
  return undefined;
}

function validateRunIntegrity(run: VisualPipelineRun): VisualPipelineFailure | undefined {
  const temporal = run.temporalIdentity;
  const snapshot = run.snapshot;
  const actionIR = run.physicalAction;
  const request = run.imageState.request;
  if (snapshot.identity.projectId !== temporal.projectId ||
      request.projectId !== temporal.projectId) {
    return pipelineError('WRONG_PROJECT', 'Run contains a cross-project binding.');
  }
  if (snapshot.identity.sceneId !== temporal.sceneId || request.sceneId !== temporal.sceneId ||
      actionIR.sceneId !== temporal.sceneId || snapshot.identity.stageId !== temporal.stageId ||
      request.stageId !== temporal.stageId || actionIR.stageId !== temporal.stageId) {
    return pipelineError('WRONG_STAGE', 'Run contains a cross-scene or cross-stage binding.');
  }
  const identityMatches = snapshot.id === temporal.snapshotId &&
    snapshot.identity.operationId === temporal.operationId &&
    actionIR.operationId === temporal.operationId &&
    actionIR.id === temporal.physicalActionIRId &&
    snapshot.action.physicalActionIRId === temporal.physicalActionIRId &&
    run.canonicalImageSpec.id === temporal.canonicalSpecId &&
    request.metadata.canonicalSpecId === temporal.canonicalSpecId &&
    request.metadata.snapshotId === temporal.snapshotId &&
    request.metadata.operationId === temporal.operationId &&
    request.temporalAuthority === temporal.temporalAuthority &&
    request.snapshotKind === temporal.snapshotKind &&
    request.metadata.stageOutcome === temporal.stageOutcome &&
    request.metadata.temporalPoint === temporal.temporalPoint &&
    request.metadata.worldStateSource === temporal.worldStateSource &&
    stableEqual(request.metadata.temporalPosition, temporal.temporalPosition);
  if (!identityMatches) {
    return pipelineError('TEMPORAL_BINDING_MISMATCH', 'Run temporal identity is inconsistent.');
  }
  if (run.imageState.officialReference) {
    const official = run.imageState.officialReference;
    if (official.projectId !== temporal.projectId || official.sceneId !== temporal.sceneId ||
        official.stageId !== temporal.stageId || official.snapshotId !== temporal.snapshotId ||
        official.asset.id !== (run.imageState.result?.status === 'SUCCESS'
          ? run.imageState.result.asset.id : official.asset.id)) {
      return pipelineError('TEMPORAL_BINDING_MISMATCH', 'Official image does not belong to this run.');
    }
  }
  if (run.videoState) {
    const video = run.videoState.request;
    if (video.temporalIdentity.projectId !== temporal.projectId ||
        video.temporalIdentity.sceneId !== temporal.sceneId ||
        video.temporalIdentity.stageId !== temporal.stageId ||
        video.temporalIdentity.operationId !== temporal.operationId ||
        video.temporalIdentity.snapshotId !== temporal.snapshotId ||
        video.canonicalAnimationSpec.identity.physicalActionIRId !== temporal.physicalActionIRId ||
        video.sourceImage.id !== run.imageState.officialReference?.asset.id) {
      return pipelineError('TEMPORAL_BINDING_MISMATCH', 'Video state does not match the run authority.');
    }
  }
  return undefined;
}

function imageValidationRequired(
  run: VisualPipelineRun,
  result: Extract<ImageGenerationResult, { status: 'SUCCESS' }>,
): VisualPipelineRun {
  return transition(run, {
    status: 'VALIDATION_REQUIRED',
    currentPhase: 'IMAGE_VALIDATION_REQUIRED',
    imageState: { ...run.imageState, result, validationRequest: undefined, validation: undefined },
    requiredAction: action('PROVIDE_IMAGE_EVIDENCE',
      'Provide structured evidence for the unreviewed image.', run.imageState.request.requestId),
  });
}

function videoValidationRequired(
  run: VisualPipelineRun,
  result: Extract<VideoGenerationResult, { status: 'SUCCESS' }>,
): VisualPipelineRun {
  return transition(run, {
    status: 'VALIDATION_REQUIRED',
    currentPhase: 'VIDEO_VALIDATION_REQUIRED',
    videoState: {
      ...run.videoState!,
      result,
      validationRequest: undefined,
      validation: undefined,
    },
    requiredAction: action('PROVIDE_VIDEO_EVIDENCE',
      'Provide structured evidence for the unreviewed video.', run.videoState!.request.requestId),
  });
}

function requirePhase(
  run: VisualPipelineRun,
  phases: readonly VisualPipelineRun['currentPhase'][],
): VisualPipelineStepResult | undefined {
  const integrityFailure = validateRunIntegrity(run);
  if (integrityFailure) return failure(run, integrityFailure.code, integrityFailure.message);
  if (!phases.includes(run.currentPhase)) {
    return invalidState(run, `Operation requires phase ${phases.join(' or ')}.`);
  }
  return undefined;
}

function imageSubmissionAlreadyApplied(
  run: VisualPipelineRun,
  submission: Parameters<VisualPipelineOrchestrator['submitImage']>[1],
): boolean {
  const result = run.imageState.result;
  return result?.status === 'SUCCESS' && result.requestId === submission.requestId &&
    result.providerMetadata?.submissionId === submission.submissionId &&
    stableEqual(result.asset, submission.asset);
}

function videoSubmissionAlreadyApplied(
  run: VisualPipelineRun,
  submission: Parameters<VisualPipelineOrchestrator['submitVideo']>[1],
): boolean {
  const result = run.videoState?.result;
  return result?.status === 'SUCCESS' && result.requestId === submission.requestId &&
    result.providerMetadata?.submissionId === submission.submissionId &&
    stableEqual(result.asset, submission.asset);
}

function submissionFailureCode(
  expectedRequestId: string,
  submission: { readonly requestId: string; readonly asset: { readonly id: string; readonly uri: string } },
): VisualPipelineFailureCode {
  if (submission.requestId !== expectedRequestId) return 'WRONG_SUBMISSION';
  if (!submission.asset.id.trim() || !submission.asset.uri.trim()) return 'WRONG_ASSET';
  return 'WRONG_SUBMISSION';
}

function imageProviderKind(result: ImageGenerationResult): ImageProviderKind | undefined {
  const kind = result.providerMetadata?.providerKind;
  return kind === 'MANUAL' || kind === 'MOCK' || kind === 'REMOTE' || kind === 'LOCAL'
    ? kind
    : undefined;
}

function hasBindingFailure(findings: readonly { readonly code: string }[]): boolean {
  return findings.some(finding => BINDING_FINDINGS.has(finding.code));
}

function hasInsufficientEvidence(findings: readonly { readonly code: string }[]): boolean {
  return findings.some(finding => finding.code === 'INSUFFICIENT_EVIDENCE');
}

function action(
  type: VisualPipelineRequiredAction['type'],
  description: string,
  requestId?: string,
  validationId?: string,
): VisualPipelineRequiredAction {
  return { type, description, requestId, validationId };
}

function createRunId(workflowVersion: string, canonicalSpecId: string, snapshotId: string): string {
  return `visual-pipeline:${encodeURIComponent(workflowVersion)}:${encodeURIComponent(canonicalSpecId)}:${encodeURIComponent(snapshotId)}`;
}

function providerMap<T extends { readonly id: string }>(
  providers: readonly T[],
  label: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const provider of providers) {
    if (!provider.id.trim()) throw new Error(`${label} provider id is required.`);
    if (result.has(provider.id)) throw new Error(`Duplicate ${label} provider '${provider.id}'.`);
    result.set(provider.id, provider);
  }
  return result;
}

function assertRetryLimit(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Visual pipeline ${label} maxAttempts must be a positive integer.`);
  }
}

function invalidState(run: VisualPipelineRun, message: string): VisualPipelineStepResult {
  return failure(run, 'INVALID_RUN_STATE', message);
}

function terminalFailure(
  run: VisualPipelineRun,
  code: VisualPipelineFailureCode,
  message: string,
  causeCode?: string,
): VisualPipelineStepResult {
  const error = pipelineError(code, message, causeCode);
  const failedRun = transition(run, {
    status: 'FAILED',
    currentPhase: 'FAILED',
    requiredAction: undefined,
    errors: [...run.errors, error],
  });
  return { status: 'FAILURE', run: failedRun, error };
}

function failure(
  run: VisualPipelineRun | undefined,
  code: VisualPipelineFailureCode,
  message: string,
  causeCode?: string,
): VisualPipelineStepResult {
  return { status: 'FAILURE', run, error: pipelineError(code, message, causeCode) };
}

function pipelineError(
  code: VisualPipelineFailureCode,
  message: string,
  causeCode?: string,
): VisualPipelineFailure {
  return deepFreeze({ code, message, causeCode });
}

function success(run: VisualPipelineRun): VisualPipelineStepResult {
  return { status: 'SUCCESS', run };
}

function transition(
  run: VisualPipelineRun,
  patch: Partial<VisualPipelineRun>,
): VisualPipelineRun {
  return freezeRun({ ...run, ...patch });
}

function freezeRun(run: VisualPipelineRun): VisualPipelineRun {
  for (const [key, value] of Object.entries(run)) {
    if (key !== 'memory') deepFreeze(value);
  }
  return Object.freeze(run);
}

function stableEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Visual pipeline operation failed.';
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
