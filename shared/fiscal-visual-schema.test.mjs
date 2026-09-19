import { describe, expect, it } from 'vitest';
import { validateAndNormalizeFiscalVisualAnalysis } from './fiscal-visual-schema.mjs';

function claim(value, classification = 'FACT', confidence = 0.9) {
  return { value, classification, confidence, evidence: 'directly visible' };
}

function validRaw() {
  return {
    summary: 'The floor is approximately half complete and continuity is preserved.',
    apparentCompletion: claim(50),
    visibleCanonicalFutureElements: claim([]),
    missingVisibleEvidence: claim([]),
    workerContinuity: claim('MATCH'),
    environmentContinuity: claim('MATCH'),
    geometryContinuity: claim('MATCH'),
    sourceContinuity: claim('MATCH'),
    uncertainties: [],
  };
}

describe('fiscal visual schema', () => {
  it('normalizes a complete fiscal observation', () => {
    const result = validateAndNormalizeFiscalVisualAnalysis(validRaw(), 'gemini');
    expect(result.contract).toBe('construction-fiscal-v1');
    expect(result.apparentCompletion.value).toBe(50);
    expect(result.workerContinuity.value).toBe('MATCH');
  });

  it('allows explicit unknowns without inventing values', () => {
    const raw = validRaw();
    raw.apparentCompletion = claim(null, 'UNKNOWN', 0);
    const result = validateAndNormalizeFiscalVisualAnalysis(raw, 'gemini');
    expect(result.apparentCompletion.value).toBeNull();
    expect(result.apparentCompletion.classification).toBe('UNKNOWN');
  });

  it('rejects invalid continuity values', () => {
    const raw = validRaw();
    raw.workerContinuity = claim('SAME_ENOUGH');
    expect(() => validateAndNormalizeFiscalVisualAnalysis(raw, 'gemini'))
      .toThrow(/workerContinuity/);
  });
});
