import type {
  VideoObservation,
  VideoObservationProvider,
  VideoValidationEvidence,
  VideoValidationRequest,
} from './types';

export interface CreateManualVideoObservationProviderInput {
  readonly id?: string;
  readonly evidenceId: string;
  readonly observedAt: number;
  readonly observation: VideoObservation;
}

export function createManualVideoObservationProvider(
  input: CreateManualVideoObservationProviderInput,
): VideoObservationProvider {
  const id = input.id ?? 'manual-video-observer';
  if (!id.trim() || !input.evidenceId.trim() || !Number.isFinite(input.observedAt)) {
    throw new Error('Manual video observation provider requires valid identity and time.');
  }
  const observation = structuredClone(input.observation);
  return {
    id,
    kind: 'MANUAL',
    async observe(request): Promise<VideoValidationEvidence> {
      return evidenceFor(request, id, 'MANUAL', input.evidenceId, input.observedAt, observation);
    },
  };
}

export type MockVideoObservationScenario =
  | 'COHERENT'
  | 'WRONG_ACTION'
  | 'FUTURE_ACTION'
  | 'MISSING_PRIMARY'
  | 'MINOR_CAMERA'
  | 'INSUFFICIENT'
  | 'SOURCE_MISMATCH'
  | 'CHARACTER_MISMATCH'
  | 'ENVIRONMENT_MISMATCH'
  | 'CONSTRUCTION_MISMATCH'
  | 'CAMERA_MISMATCH';

export function createDeterministicMockVideoObservationProvider(
  scenario: MockVideoObservationScenario,
  id = 'mock-video-observer',
): VideoObservationProvider {
  if (!id.trim()) throw new Error('Mock video observation provider id is required.');
  return {
    id,
    kind: 'MOCK',
    async observe(request): Promise<VideoValidationEvidence> {
      return evidenceFor(
        request,
        id,
        'MOCK',
        `mock-video-evidence:${request.validationId}:${scenario.toLowerCase()}`,
        0,
        mockObservation(request, scenario),
      );
    },
  };
}

function mockObservation(
  request: VideoValidationRequest,
  scenario: MockVideoObservationScenario,
): VideoObservation {
  const required = request.expectedMotionFacts.requiredPrimaryAction.description;
  const base: VideoObservation = {
    coverage: 'SUFFICIENT',
    observedPrimaryAction: required,
    unexpectedActions: [],
    missingActions: [],
    futureActions: [],
    characterConsistency: 'MATCH',
    clothingConsistency: 'MATCH',
    environmentConsistency: 'MATCH',
    constructionConsistency: 'MATCH',
    materialConsistency: 'MATCH',
    cameraConsistency: 'MATCH',
    sourceFrameConsistency: 'MATCH',
    motionQuality: 'ACCEPTABLE',
    temporalAnomalies: [],
    durationObserved: request.expectedOutputFacts.expectedDuration,
    notes: [],
    confidence: 1,
  };

  switch (scenario) {
    case 'WRONG_ACTION':
      return {
        ...base,
        observedPrimaryAction: 'install entire roof',
        unexpectedActions: ['install entire roof'],
        constructionConsistency: 'MAJOR_DIVERGENCE',
      };
    case 'FUTURE_ACTION': {
      const future = request.expectedMotionFacts.forbiddenFutureActions[0] ?? 'future-stage-action';
      return {
        ...base,
        futureActions: [future],
        temporalAnomalies: [{
          code: 'FUTURE_ACTION',
          element: future,
          message: `Future action ${future} was observed.`,
        }],
      };
    }
    case 'MISSING_PRIMARY':
      return { ...base, observedPrimaryAction: undefined, missingActions: [required] };
    case 'MINOR_CAMERA':
      return { ...base, cameraConsistency: 'MINOR_DIVERGENCE' };
    case 'INSUFFICIENT':
      return {
        ...base,
        coverage: 'INSUFFICIENT',
        observedPrimaryAction: undefined,
        characterConsistency: 'UNKNOWN',
        clothingConsistency: 'UNKNOWN',
        environmentConsistency: 'UNKNOWN',
        constructionConsistency: 'UNKNOWN',
        materialConsistency: 'UNKNOWN',
        cameraConsistency: 'UNKNOWN',
        sourceFrameConsistency: 'UNKNOWN',
        motionQuality: 'UNKNOWN',
        durationObserved: undefined,
        confidence: 0,
      };
    case 'SOURCE_MISMATCH':
      return { ...base, sourceFrameConsistency: 'MAJOR_DIVERGENCE' };
    case 'CHARACTER_MISMATCH':
      return { ...base, characterConsistency: 'MAJOR_DIVERGENCE' };
    case 'ENVIRONMENT_MISMATCH':
      return { ...base, environmentConsistency: 'MAJOR_DIVERGENCE' };
    case 'CONSTRUCTION_MISMATCH':
      return { ...base, constructionConsistency: 'MAJOR_DIVERGENCE' };
    case 'CAMERA_MISMATCH':
      return { ...base, cameraConsistency: 'MAJOR_DIVERGENCE' };
    case 'COHERENT':
      return base;
  }
}

function evidenceFor(
  request: VideoValidationRequest,
  providerId: string,
  providerKind: 'MANUAL' | 'MOCK',
  evidenceId: string,
  observedAt: number,
  observation: VideoObservation,
): VideoValidationEvidence {
  return deepFreeze({
    ...structuredClone(observation),
    evidenceId,
    validationId: request.validationId,
    videoRequestId: request.videoRequestId,
    videoAssetId: request.videoAsset.id,
    source: { providerId, providerKind },
    observedAt,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
