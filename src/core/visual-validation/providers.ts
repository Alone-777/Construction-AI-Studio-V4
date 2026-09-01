import type {
  VisualObservation,
  VisualObservationProvider,
  VisualValidationEvidence,
  VisualValidationRequest,
} from './types';

export interface CreateManualVisualObservationProviderInput {
  readonly id?: string;
  readonly evidenceId: string;
  readonly observedAt: number;
  readonly observation: VisualObservation;
}

export function createManualVisualObservationProvider(
  input: CreateManualVisualObservationProviderInput,
): VisualObservationProvider {
  const id = input.id ?? 'manual-visual-observer';
  if (!id.trim() || !input.evidenceId.trim() || !Number.isFinite(input.observedAt)) {
    throw new Error('Manual visual observation provider requires valid identity and time.');
  }
  const observation = structuredClone(input.observation);

  return {
    id,
    kind: 'MANUAL',
    async observe(request): Promise<VisualValidationEvidence> {
      return evidenceFor(
        request,
        id,
        'MANUAL',
        input.evidenceId,
        input.observedAt,
        observation,
      );
    },
  };
}

export type MockVisualObservationScenario =
  | 'COHERENT'
  | 'FUTURE_ELEMENT'
  | 'MISSING_REQUIRED'
  | 'MINOR_DIVERGENCE'
  | 'INSUFFICIENT';

export function createDeterministicMockVisualObservationProvider(
  scenario: MockVisualObservationScenario,
  id = 'mock-visual-observer',
): VisualObservationProvider {
  if (!id.trim()) throw new Error('Mock visual observation provider id is required.');
  return {
    id,
    kind: 'MOCK',
    async observe(request): Promise<VisualValidationEvidence> {
      return evidenceFor(
        request,
        id,
        'MOCK',
        `mock-evidence:${request.validationId}:${scenario.toLowerCase()}`,
        0,
        mockObservation(request, scenario),
      );
    },
  };
}

function mockObservation(
  request: VisualValidationRequest,
  scenario: MockVisualObservationScenario,
): VisualObservation {
  const required = [...request.expected.requiredElements];
  const future = request.expected.forbiddenFutureElements[0] ?? 'mock-future-element';
  const base: VisualObservation = {
    coverage: 'SUFFICIENT',
    detectedElements: required,
    missingElements: [],
    unexpectedElements: [],
    characterConsistency: 'MATCH',
    clothingConsistency: 'MATCH',
    environmentConsistency: 'MATCH',
    constructionConsistency: 'MATCH',
    materialConsistency: 'MATCH',
    geometryConsistency: 'MATCH',
    previousOfficialContinuity: request.previousOfficialReference ? 'MATCH' : 'NOT_APPLICABLE',
    temporalAnomalies: [],
    notes: [],
    confidence: 1,
  };

  if (scenario === 'FUTURE_ELEMENT') {
    return {
      ...base,
      detectedElements: [...required, future],
      unexpectedElements: [future],
      temporalAnomalies: [{
        code: 'FUTURE_ELEMENT',
        element: future,
        message: `Future element ${future} was observed.`,
      }],
    };
  }
  if (scenario === 'MISSING_REQUIRED') {
    const missing = required[0] ?? 'mock-required-element';
    return {
      ...base,
      detectedElements: required.filter(element => element !== missing),
      missingElements: [missing],
    };
  }
  if (scenario === 'MINOR_DIVERGENCE') {
    return { ...base, environmentConsistency: 'MINOR_DIVERGENCE' };
  }
  if (scenario === 'INSUFFICIENT') {
    return {
      ...base,
      coverage: 'INSUFFICIENT',
      detectedElements: [],
      characterConsistency: 'UNKNOWN',
      clothingConsistency: 'UNKNOWN',
      environmentConsistency: 'UNKNOWN',
      constructionConsistency: 'UNKNOWN',
      materialConsistency: 'UNKNOWN',
      geometryConsistency: 'UNKNOWN',
      previousOfficialContinuity: request.previousOfficialReference ? 'UNKNOWN' : 'NOT_APPLICABLE',
      confidence: 0,
    };
  }
  return base;
}

function evidenceFor(
  request: VisualValidationRequest,
  providerId: string,
  providerKind: 'MANUAL' | 'MOCK',
  evidenceId: string,
  observedAt: number,
  observation: VisualObservation,
): VisualValidationEvidence {
  return {
    ...structuredClone(observation),
    evidenceId,
    validationId: request.validationId,
    requestId: request.requestId,
    assetId: request.candidateAsset.id,
    source: { providerId, providerKind },
    observedAt,
  };
}
