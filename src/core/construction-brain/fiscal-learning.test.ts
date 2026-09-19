import { describe, expect, it } from 'vitest';
import type { FireflyExecutionJob } from './types';
import {
  applyLearnedCorrectionsToPrompt,
  assessConstructionJob,
  createConstructionLearningMemory,
  learnedCorrections,
  recordConstructionRetryOutcome,
} from './fiscal-learning';

function job(overrides: Partial<FireflyExecutionJob> = {}): FireflyExecutionJob {
  return {
    id: 'firefly:scene_op_base:scene_op_base:segment:1',
    projectId: 'project-1',
    sceneId: 'scene_op_base',
    sceneNumber: 3,
    segmentId: 'scene_op_base:segment:1',
    segmentIndex: 1,
    startStagePercentage: 0,
    targetStagePercentage: 50,
    model: 'KLING',
    durationSeconds: 15,
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    source: { kind: 'PREVIOUS_JOB_LAST_FRAME', previousJobId: 'previous' },
    terminalRequirement: 'INTERMEDIATE_CONTINUATION',
    entryKeyframeId: 'entry',
    exitKeyframeId: 'exit',
    prompt: 'Build the timber base only until 50%.',
    negativeConstraints: [],
    continuityLocks: {
      preserveWorkerIdentity: 'builder_01',
      preserveExistingComponents: ['sapatas_pedra'],
      preservePermanentObjects: ['creek'],
      preserveZones: ['Z1'],
      preserveTerrain: true,
      forbiddenFutureElements: ['pilares_madeira', 'paredes_madeira'],
    },
    acceptanceChecklist: [],
    output: {
      videoSlot: 'outputs/base/segment1.mp4',
      lastFrameSlot: 'outputs/base/segment1.last-frame.png',
    },
    status: 'READY',
    ...overrides,
  };
}

describe('Construction Fiscal + learning loop', () => {
  it('turns the real Job 005 pattern into PROGRESS_OVERSHOOT', () => {
    const assessment = assessConstructionJob(job(), {
      observedStagePercentage: 95,
      characterContinuity: 'MATCH',
      environmentContinuity: 'MATCH',
      geometryContinuity: 'MATCH',
      sourceContinuity: 'MATCH',
    }, { operationType: 'piso' });

    expect(assessment.verdict).toBe('RETRY');
    expect(assessment.failures).toContainEqual(expect.objectContaining({
      code: 'PROGRESS_OVERSHOOT',
    }));
    expect(assessment.retryPrompt).toContain('Stop clearly at 50% completion');
    expect(assessment.retryPrompt).toContain('visibly unfinished portion');
  });

  it('passes a result that lands inside the progress tolerance', () => {
    const assessment = assessConstructionJob(job(), {
      observedStagePercentage: 56,
      characterContinuity: 'MATCH',
      environmentContinuity: 'MATCH',
      geometryContinuity: 'MATCH',
      sourceContinuity: 'MATCH',
    }, { operationType: 'piso' });

    expect(assessment.verdict).toBe('PASS');
    expect(assessment.failures).toEqual([]);
    expect(assessment.retryPrompt).toBeUndefined();
  });

  it('detects future element leaks and continuity drift independently', () => {
    const assessment = assessConstructionJob(job(), {
      observedStagePercentage: 50,
      detectedFutureElements: ['pilares_madeira'],
      characterContinuity: 'MAJOR_DIVERGENCE',
      sourceContinuity: 'MAJOR_DIVERGENCE',
    }, { operationType: 'piso' });

    expect(assessment.verdict).toBe('RETRY');
    expect(assessment.failures.map(item => item.code)).toEqual(expect.arrayContaining([
      'FUTURE_ELEMENT_LEAK',
      'CHARACTER_DRIFT',
      'SOURCE_CONTINUITY_DRIFT',
    ]));
  });

  it('stores a successful correction and reuses it for future piso + Kling work', () => {
    const first = assessConstructionJob(job(), { observedStagePercentage: 95 }, {
      operationType: 'piso',
    });
    const learned = recordConstructionRetryOutcome(
      createConstructionLearningMemory(),
      {
        operationType: 'piso',
        provider: 'KLING',
        assessment: first,
        successfulRetry: true,
      },
    );

    expect(learned.records).toHaveLength(1);
    expect(learnedCorrections(learned, 'piso', 'KLING')[0])
      .toContain('Stop clearly at 50% completion');

    const futurePrompt = applyLearnedCorrectionsToPrompt(
      'Future floor generation prompt.',
      learned,
      'piso',
      'KLING',
    );
    expect(futurePrompt).toContain('LEARNED PRODUCTION RULES');
    expect(futurePrompt).toContain('visibly unfinished portion');
  });

  it('does not transfer a floor-specific lesson to unrelated operation types', () => {
    const assessment = assessConstructionJob(job(), { observedStagePercentage: 95 }, {
      operationType: 'piso',
    });
    const memory = recordConstructionRetryOutcome(
      createConstructionLearningMemory(),
      { operationType: 'piso', provider: 'KLING', assessment, successfulRetry: true },
    );

    expect(learnedCorrections(memory, 'cobertura', 'KLING')).toEqual([]);
    expect(applyLearnedCorrectionsToPrompt('roof prompt', memory, 'cobertura', 'KLING'))
      .toBe('roof prompt');
  });
});
