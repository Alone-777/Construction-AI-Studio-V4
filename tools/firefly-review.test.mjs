import { describe, expect, it } from 'vitest';
import {
  assessNormalizedVisualAnalysis,
  buildFireflyReviewContext,
  resolveOperationType,
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

  it('builds provider context around the current operation rather than global completion', () => {
    const context = buildFireflyReviewContext(job());
    expect(context).toContain('Current operation type: piso');
    expect(context).toContain('must end at 50%');
    expect(context).toContain('never for the whole building');
    expect(context).toContain('pilares_madeira');
  });
});
