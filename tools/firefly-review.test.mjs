import { describe, expect, it } from 'vitest';
import {
  assessNormalizedVisualAnalysis,
  buildFireflyReviewContext,
  isRetryableProviderError,
  resolveOperationType,
  visualProviderStatuses,
} from './firefly-review.mjs';

function job(overrides = {}) {
  return {
    id: 'firefly:scene_op_base:scene_op_base:segment:1',
    sceneId: 'scene_op_base',
    startStagePercentage: 0,
    targetStagePercentage: 50,
    model: 'KLING',
    prompt: 'Build the timber base only until 50%.',
    continuityLocks: {
      forbiddenFutureElements: ['pilares_madeira', 'paredes_madeira'],
    },
    ...overrides,
  };
}

function claim(value, classification = 'FACT', confidence = 0.9) {
  return { value, classification, confidence, evidence: 'visible' };
}

function analysis(completion, options = {}) {
  return {
    summary: 'contact sheet',
    claims: {
      apparentCompletion: claim(
        completion,
        options.completionClass ?? 'FACT',
        options.confidence ?? 0.9,
      ),
      visibleComponents: claim(options.visible ?? [], 'FACT', 0.9),
    },
    uncertainties: [],
  };
}

function fiscalAnalysis(completion, overrides = {}) {
  return {
    contract: 'construction-fiscal-v1',
    summary: 'fiscal contact sheet',
    apparentCompletion: claim(completion, 'FACT', 0.9),
    visibleCanonicalFutureElements: claim(overrides.future ?? [], 'FACT', 0.9),
    missingVisibleEvidence: claim(overrides.missing ?? [], 'FACT', 0.9),
    workerContinuity: claim(overrides.worker ?? 'MATCH', 'FACT', 0.9),
    environmentContinuity: claim(overrides.environment ?? 'MATCH', 'FACT', 0.9),
    geometryContinuity: claim(overrides.geometry ?? 'MATCH', 'FACT', 0.9),
    sourceContinuity: claim(overrides.source ?? 'MATCH', 'FACT', 0.9),
    uncertainties: [],
  };
}

describe('Firefly review transient provider policy', () => {
  it('retries only transient provider failures', () => {
    expect(isRetryableProviderError({ code: 'PROVIDER_TIMEOUT' })).toBe(true);
    expect(isRetryableProviderError({ code: 'PROVIDER_UNAVAILABLE' })).toBe(true);
    expect(isRetryableProviderError({ code: 'RATE_OR_QUOTA_LIMIT' })).toBe(true);
    expect(isRetryableProviderError({ code: 'QUOTA_EXCEEDED' })).toBe(true);
    expect(isRetryableProviderError({ code: 'INVALID_API_KEY' })).toBe(false);
    expect(isRetryableProviderError({ code: 'MODEL_NOT_AVAILABLE' })).toBe(false);
    expect(isRetryableProviderError({ code: 'INVALID_PROVIDER_RESPONSE' })).toBe(false);
  });

  it('never marks Gemini as trusted by default and keeps paid fallback opt-in', () => {
    const statuses = visualProviderStatuses({
      GEMINI_API_KEY: 'configured-without-printing',
      OPENAI_API_KEY: 'configured-without-printing',
    });
    const gemini = statuses.find(item => item.id === 'gemini');
    const openai = statuses.find(item => item.id === 'openai');

    expect(gemini).toMatchObject({
      configured: true,
      billingClass: 'free_or_quota',
      trustedByDefault: false,
      automaticFallback: true,
    });
    expect(openai).toMatchObject({
      configured: true,
      billingClass: 'paid',
      trustedByDefault: false,
      automaticFallback: false,
    });
    expect(JSON.stringify(statuses)).not.toContain('configured-without-printing');
  });
});

describe('Firefly review runtime', () => {
  it('keeps compatibility with the current cabana workspace scene ids', () => {
    expect(resolveOperationType(job())).toBe('piso');
    expect(resolveOperationType(job({ sceneId: 'scene_op_sapatas' }))).toBe('sapata');
  });

  it('classifies the real Job 005 pattern as progress overshoot', () => {
    const result = assessNormalizedVisualAnalysis(job(), analysis(95));
    expect(result.verdict).toBe('RETRY');
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: 'PROGRESS_OVERSHOOT',
    }));
  });

  it('refuses to guess when the visual provider cannot support completion', () => {
    const result = assessNormalizedVisualAnalysis(
      job(),
      analysis(null, { completionClass: 'UNKNOWN', confidence: 0 }),
    );
    expect(result.verdict).toBe('REOBSERVE');
    expect(result.blockers).toContain('APPARENT_COMPLETION_UNCERTAIN');
  });

  it('detects a canonical future element leak', () => {
    const result = assessNormalizedVisualAnalysis(
      job(),
      analysis(50, { visible: ['pilares_madeira'] }),
    );
    expect(result.verdict).toBe('RETRY');
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: 'FUTURE_ELEMENT_LEAK',
    }));
  });

  it('auto-passes only when fiscal continuity evidence is complete', () => {
    const result = assessNormalizedVisualAnalysis(job(), fiscalAnalysis(50));
    expect(result.verdict).toBe('PASS');
    expect(result.failures).toEqual([]);
  });

  it('retries when fiscal continuity has a major worker divergence', () => {
    const result = assessNormalizedVisualAnalysis(
      job(),
      fiscalAnalysis(50, { worker: 'MAJOR_DIVERGENCE' }),
    );
    expect(result.verdict).toBe('RETRY');
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: 'CHARACTER_DRIFT',
    }));
  });

  it('does not auto-pass a moderate-confidence result near the target', () => {
    const result = assessNormalizedVisualAnalysis(job(), fiscalAnalysis(52));
    result.confidence = 0.72;
    const lowConfidence = assessNormalizedVisualAnalysis(job(), {
      ...fiscalAnalysis(52),
      apparentCompletion: claim(52, 'FACT', 0.72),
    });
    expect(lowConfidence.verdict).toBe('REOBSERVE');
    expect(lowConfidence.blockers).toContain('AUTOPASS_CONFIDENCE_TOO_LOW');
  });

  it('builds provider context around the current operation rather than global completion', () => {
    const context = buildFireflyReviewContext(job());
    expect(context).toContain('Current operation type: piso');
    expect(context).toContain('must end at 50%');
    expect(context).toContain('never for the whole building');
    expect(context).toContain('pilares_madeira');
  });
});
