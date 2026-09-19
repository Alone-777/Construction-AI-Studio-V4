import type { FireflyExecutionJob } from './types';

export type ConstructionFiscalFailureCode =
  | 'PROGRESS_OVERSHOOT'
  | 'PROGRESS_UNDERSHOOT'
  | 'FUTURE_ELEMENT_LEAK'
  | 'MISSING_EVIDENCE'
  | 'CHARACTER_DRIFT'
  | 'ENVIRONMENT_DRIFT'
  | 'GEOMETRY_DRIFT'
  | 'SOURCE_CONTINUITY_DRIFT';

export interface ConstructionFiscalObservation {
  observedStagePercentage: number;
  detectedFutureElements?: string[];
  missingEvidence?: string[];
  characterContinuity?: 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE' | 'UNKNOWN';
  environmentContinuity?: 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE' | 'UNKNOWN';
  geometryContinuity?: 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE' | 'UNKNOWN';
  sourceContinuity?: 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE' | 'UNKNOWN';
  confidence?: number;
  notes?: string[];
}

export interface ConstructionFiscalFailure {
  code: ConstructionFiscalFailureCode;
  severity: 'RETRY';
  message: string;
  correction: string;
}

export interface ConstructionFiscalAssessment {
  verdict: 'PASS' | 'RETRY';
  jobId: string;
  observedStagePercentage: number;
  targetStagePercentage: number;
  failures: ConstructionFiscalFailure[];
  retryPrompt?: string;
}

export interface ConstructionLearningRecord {
  operationType: string;
  provider: FireflyExecutionJob['model'];
  failureCode: ConstructionFiscalFailureCode;
  correction: string;
  successfulRetry: boolean;
  uses: number;
}

export interface ConstructionLearningMemory {
  records: ConstructionLearningRecord[];
}

export interface AssessConstructionJobOptions {
  operationType: string;
  progressTolerance?: number;
  memory?: ConstructionLearningMemory;
}

const DEFAULT_PROGRESS_TOLERANCE = 12;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function retryFailure(
  code: ConstructionFiscalFailureCode,
  message: string,
  correction: string,
): ConstructionFiscalFailure {
  return { code, severity: 'RETRY', message, correction };
}

export function assessConstructionJob(
  job: FireflyExecutionJob,
  observation: ConstructionFiscalObservation,
  options: AssessConstructionJobOptions,
): ConstructionFiscalAssessment {
  const tolerance = options.progressTolerance ?? DEFAULT_PROGRESS_TOLERANCE;
  const failures: ConstructionFiscalFailure[] = [];
  const observed = observation.observedStagePercentage;
  const target = job.targetStagePercentage;

  if (!Number.isFinite(observed) || observed < 0 || observed > 100) {
    throw new Error('observedStagePercentage must be between 0 and 100.');
  }

  if (observed > target + tolerance) {
    failures.push(retryFailure(
      'PROGRESS_OVERSHOOT',
      'Observed progress ' + observed + '% exceeds target ' + target + '% by more than ' + tolerance + ' points.',
      'Stop clearly at ' + target + '% completion. Leave a visibly unfinished portion for the next segment; do not complete the current operation.',
    ));
  }

  if (observed < target - tolerance) {
    failures.push(retryFailure(
      'PROGRESS_UNDERSHOOT',
      'Observed progress ' + observed + '% is below target ' + target + '% by more than ' + tolerance + ' points.',
      'Advance the operation visibly to approximately ' + target + '% before the clip ends. Show the missing physical work on screen.',
    ));
  }

  const forbidden = new Set(job.continuityLocks.forbiddenFutureElements);
  const leaked = unique(observation.detectedFutureElements ?? [])
    .filter(element => forbidden.has(element));
  if (leaked.length > 0) {
    failures.push(retryFailure(
      'FUTURE_ELEMENT_LEAK',
      'Forbidden future elements were observed: ' + leaked.join(', ') + '.',
      'Do not show these future elements: ' + leaked.join(', ') + '. Keep them completely absent until their authorized operation.',
    ));
  }

  const missingEvidence = unique(observation.missingEvidence ?? []);
  if (missingEvidence.length > 0) {
    failures.push(retryFailure(
      'MISSING_EVIDENCE',
      'Required visible evidence is missing: ' + missingEvidence.join('; ') + '.',
      'Make these results visibly undeniable before the clip ends: ' + missingEvidence.join('; ') + '.',
    ));
  }

  if (observation.characterContinuity === 'MAJOR_DIVERGENCE') {
    failures.push(retryFailure(
      'CHARACTER_DRIFT',
      'Worker identity changed materially from the source frame.',
      'Preserve the exact same worker identity, clothing, body proportions and protective equipment from the source frame.',
    ));
  }
  if (observation.environmentContinuity === 'MAJOR_DIVERGENCE') {
    failures.push(retryFailure(
      'ENVIRONMENT_DRIFT',
      'Environment changed materially from the source frame.',
      'Preserve the exact forest, creek, lighting, weather, background objects and worksite layout from the source frame.',
    ));
  }
  if (observation.geometryContinuity === 'MAJOR_DIVERGENCE') {
    failures.push(retryFailure(
      'GEOMETRY_DRIFT',
      'Construction or terrain geometry changed outside the authorized work.',
      'Preserve all existing geometry exactly; alter only the current operation area through visible physical work.',
    ));
  }
  if (observation.sourceContinuity === 'MAJOR_DIVERGENCE') {
    failures.push(retryFailure(
      'SOURCE_CONTINUITY_DRIFT',
      'The generated clip does not continue faithfully from its source frame.',
      'Start from the supplied frame exactly. Do not reset, redesign or reinterpret the scene before beginning the physical action.',
    ));
  }

  if (failures.length === 0) {
    return {
      verdict: 'PASS',
      jobId: job.id,
      observedStagePercentage: observed,
      targetStagePercentage: target,
      failures: [],
    };
  }

  const learned = learnedCorrections(options.memory, options.operationType, job.model);
  const corrections = unique([
    ...failures.map(failure => failure.correction),
    ...learned,
  ]);

  return {
    verdict: 'RETRY',
    jobId: job.id,
    observedStagePercentage: observed,
    targetStagePercentage: target,
    failures,
    retryPrompt: [
      job.prompt,
      '',
      'CORRECTIVE RETRY REQUIREMENTS:',
      ...corrections.map((correction, index) => (index + 1) + '. ' + correction),
      'The retry must preserve the exact source frame continuity and correct only the failures above.',
    ].join('\n'),
  };
}

export function createConstructionLearningMemory(
  records: ConstructionLearningRecord[] = [],
): ConstructionLearningMemory {
  return { records: structuredClone(records) };
}

export function recordConstructionRetryOutcome(
  memory: ConstructionLearningMemory,
  input: {
    operationType: string;
    provider: FireflyExecutionJob['model'];
    assessment: ConstructionFiscalAssessment;
    successfulRetry: boolean;
  },
): ConstructionLearningMemory {
  const records = structuredClone(memory.records);

  for (const failure of input.assessment.failures) {
    const existing = records.find(record =>
      record.operationType === input.operationType &&
      record.provider === input.provider &&
      record.failureCode === failure.code &&
      record.correction === failure.correction
    );

    if (existing) {
      existing.uses += 1;
      existing.successfulRetry = existing.successfulRetry || input.successfulRetry;
    } else {
      records.push({
        operationType: input.operationType,
        provider: input.provider,
        failureCode: failure.code,
        correction: failure.correction,
        successfulRetry: input.successfulRetry,
        uses: 1,
      });
    }
  }

  return { records };
}

export function learnedCorrections(
  memory: ConstructionLearningMemory | undefined,
  operationType: string,
  provider: FireflyExecutionJob['model'],
): string[] {
  if (!memory) return [];

  return unique(
    memory.records
      .filter(record =>
        record.operationType === operationType &&
        record.provider === provider &&
        record.successfulRetry
      )
      .sort((a, b) => b.uses - a.uses)
      .map(record => record.correction),
  );
}

export function applyLearnedCorrectionsToPrompt(
  prompt: string,
  memory: ConstructionLearningMemory | undefined,
  operationType: string,
  provider: FireflyExecutionJob['model'],
): string {
  const corrections = learnedCorrections(memory, operationType, provider);
  if (corrections.length === 0) return prompt;

  return [
    prompt.trim(),
    '',
    'LEARNED PRODUCTION RULES:',
    ...corrections.map((correction, index) => (index + 1) + '. ' + correction),
  ].join('\n');
}
