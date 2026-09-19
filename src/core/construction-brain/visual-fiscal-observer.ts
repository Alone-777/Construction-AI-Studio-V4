import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { FireflyExecutionJob } from './types';
import type { ConstructionFiscalObservation } from './fiscal-learning';

export interface ConstructionVisualFiscalObservationResult {
  readyForFiscal: boolean;
  observation?: ConstructionFiscalObservation;
  blockers: string[];
}

const MIN_PROGRESS_CONFIDENCE = 0.55;

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function visibleComponents(analysis: NormalizedVisualAnalysis): string[] {
  const claim = analysis.claims.visibleComponents;
  if (claim.classification === 'UNKNOWN' || !Array.isArray(claim.value)) return [];
  return claim.value.map(item => String(item));
}

function matchesCanonicalElement(observed: string, canonical: string): boolean {
  const left = normalizeToken(observed);
  const right = normalizeToken(canonical);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function buildConstructionFiscalVisualContext(
  job: FireflyExecutionJob,
  operationType: string,
): string {
  return [
    'CONSTRUCTION FISCAL MODE.',
    'The supplied image is a chronological contact sheet from ONE generated video clip: LEFT = source/start, CENTER = midpoint, RIGHT = terminal/end.',
    'Judge progress only for the CURRENT OPERATION, never for the whole building.',
    'Current operation type: ' + operationType + '.',
    'Stage starts at ' + job.startStagePercentage + '% and must end at ' + job.targetStagePercentage + '%.',
    'For claims.apparentCompletion, estimate the RIGHT panel completion percentage of this current operation only.',
    'Use the LEFT and CENTER panels only as evidence of progression and continuity.',
    'If exact progress is not visually supportable, classify apparentCompletion as UNKNOWN instead of guessing.',
    'When any of these canonical forbidden elements are visible, write their exact canonical IDs in claims.visibleComponents: ' +
      (job.continuityLocks.forbiddenFutureElements.join(', ') || 'none') + '.',
    'Preserve worker identity, terrain, environment, camera composition and previously completed construction when comparing panels.',
    'Do not infer hidden work or invisible construction.',
  ].join(' ');
}

export function deriveConstructionFiscalObservation(
  job: FireflyExecutionJob,
  analysis: NormalizedVisualAnalysis,
): ConstructionVisualFiscalObservationResult {
  const blockers: string[] = [];
  const completion = analysis.claims.apparentCompletion;

  if (
    completion.classification === 'UNKNOWN' ||
    typeof completion.value !== 'number' ||
    completion.confidence < MIN_PROGRESS_CONFIDENCE
  ) {
    blockers.push('APPARENT_COMPLETION_UNCERTAIN');
  }

  if (blockers.length > 0) {
    return { readyForFiscal: false, blockers };
  }

  const observed = visibleComponents(analysis);
  const detectedFutureElements = job.continuityLocks.forbiddenFutureElements.filter(canonical =>
    observed.some(item => matchesCanonicalElement(item, canonical))
  );

  return {
    readyForFiscal: true,
    blockers: [],
    observation: {
      observedStagePercentage: completion.value as number,
      detectedFutureElements,
      characterContinuity: 'UNKNOWN',
      environmentContinuity: 'UNKNOWN',
      geometryContinuity: 'UNKNOWN',
      sourceContinuity: 'UNKNOWN',
      confidence: completion.confidence,
      notes: [analysis.summary, ...analysis.uncertainties],
    },
  };
}
