import { describe, expect, it } from 'vitest';
import { assessFiscalRound, combineFiscalRounds } from './decision.mjs';

function context() {
  return {
    jobId: 'job-001',
    attempt: 1,
    contactSheetSha256: 'a'.repeat(64),
    job: {
      id: 'job-001',
      targetStagePercentage: 25,
    },
  };
}

function analysis(overrides = {}) {
  return {
    summary: 'Visible causal work reaches the requested partial state.',
    observedStagePercentage: 25,
    confidence: 0.93,
    continuity: {
      source: 'MATCH',
      worker: 'MATCH',
      environment: 'MATCH',
      geometry: 'MATCH',
    },
    futureElementsVisible: [],
    missingEvidence: [],
    terminalFrameValid: true,
    physicalCausality: 'VALID',
    failures: [],
    uncertainties: [],
    ...overrides,
  };
}

describe('visual fiscal deterministic decision', () => {
  it('allows PASS only after two agreeing high-confidence rounds', () => {
    const primary = assessFiscalRound(context(), analysis());
    const verification = assessFiscalRound(context(), analysis({ observedStagePercentage: 27 }));
    const result = combineFiscalRounds(context(), primary, verification);

    expect(result).toMatchObject({
      verdict: 'PASS',
      observedStagePercentage: 26,
      requiredEvidenceSatisfied: true,
      futureElementsAbsent: true,
      terminalFrameValid: true,
      canonicalWorldAdvanced: false,
    });
  });

  it('returns RETRY when both rounds confirm progress overshoot', () => {
    const primary = assessFiscalRound(context(), analysis({ observedStagePercentage: 78 }));
    const verification = assessFiscalRound(context(), analysis({ observedStagePercentage: 82 }));
    const result = combineFiscalRounds(context(), primary, verification);

    expect(result.verdict).toBe('RETRY');
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROGRESS_OVERSHOOT' }),
    ]));
  });

  it('fails closed when independent rounds disagree', () => {
    const primary = assessFiscalRound(context(), analysis());
    const verification = assessFiscalRound(context(), analysis({
      continuity: {
        source: 'MATCH',
        worker: 'MAJOR_DIVERGENCE',
        environment: 'MATCH',
        geometry: 'MATCH',
      },
    }));
    const result = combineFiscalRounds(context(), primary, verification);

    expect(result.verdict).toBe('REVIEW_REQUIRED');
    expect(result.blockers).toContain('INDEPENDENT_REVIEWS_DISAGREE');
    expect(result.failures).toEqual([]);
  });
});
