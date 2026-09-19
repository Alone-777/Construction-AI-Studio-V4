import { describe, expect, it } from 'vitest';
import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { VisualProvider } from '../providers/visual-provider';
import type { FireflyExecutionJob } from './types';
import { reviewConstructionVideo } from './visual-fiscal-service';

function job(): FireflyExecutionJob {
  return {
    id: 'job-005',
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
    source: { kind: 'PREVIOUS_JOB_LAST_FRAME', previousJobId: 'job-004' },
    terminalRequirement: 'INTERMEDIATE_CONTINUATION',
    entryKeyframeId: 'entry',
    exitKeyframeId: 'exit',
    prompt: 'floor prompt',
    negativeConstraints: [],
    continuityLocks: {
      preserveWorkerIdentity: 'builder_01',
      preserveExistingComponents: ['sapatas_pedra'],
      preservePermanentObjects: ['creek'],
      preserveZones: ['Z1'],
      preserveTerrain: true,
      forbiddenFutureElements: ['pilares_madeira'],
    },
    acceptanceChecklist: [],
    output: { videoSlot: 'video.mp4', lastFrameSlot: 'last.png' },
    status: 'READY',
  };
}

function claim<T>(value: T | null, classification: 'FACT' | 'HYPOTHESIS' | 'UNKNOWN' = 'FACT', confidence = 0.9) {
  return { value, classification, confidence, evidence: 'visible' };
}

function analysis(completion: number | null, completionClass: 'FACT' | 'HYPOTHESIS' | 'UNKNOWN' = 'FACT'): NormalizedVisualAnalysis {
  const base = claim(null, 'UNKNOWN', 0);
  return {
    schemaVersion: '1.0.0',
    providerId: 'fake',
    summary: 'contact sheet review',
    claims: {
      constructionType: base, environment: base, terrain: base, watercourse: base,
      vegetation: base, visibleComponents: claim([], 'FACT', 0.9), apparentMaterials: base,
      structure: base, foundation: base, floor: base, walls: base, roof: base,
      openings: base, externalAreas: base, paths: base, drainage: base,
      spatialRelations: base, naturalElements: base, preservationElements: base,
      apparentCompletion: claim(completion, completionClass, completionClass === 'UNKNOWN' ? 0 : 0.9),
    },
    uncertainties: [],
    technicalUnknowns: [],
  } as NormalizedVisualAnalysis;
}

function provider(result: NormalizedVisualAnalysis, contexts: string[]): VisualProvider {
  return {
    descriptor: { id: 'fake', name: 'Fake Visual', kind: 'custom', configured: true },
    async analyze(request) {
      contexts.push(request.userContext ?? '');
      return result;
    },
  };
}

describe('Construction visual fiscal service', () => {
  it('reviews Job 005 automatically and returns RETRY on visual overshoot', async () => {
    const contexts: string[] = [];
    const result = await reviewConstructionVideo({
      job: job(),
      operationType: 'piso',
      contactSheetImageData: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      provider: provider(analysis(95), contexts),
    });

    expect(result.status).toBe('ASSESSED');
    if (result.status !== 'ASSESSED') throw new Error('expected assessed');
    expect(result.assessment.verdict).toBe('RETRY');
    expect(result.assessment.failures[0]?.code).toBe('PROGRESS_OVERSHOOT');
    expect(result.assessment.retryPrompt).toContain('Stop clearly at 50% completion');
    expect(contexts[0]).toContain('Current operation type: piso');
  });

  it('requests re-observation instead of inventing progress', async () => {
    const result = await reviewConstructionVideo({
      job: job(),
      operationType: 'piso',
      contactSheetImageData: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      provider: provider(analysis(null, 'UNKNOWN'), []),
    });

    expect(result).toEqual({
      status: 'REOBSERVE',
      providerId: 'fake',
      blockers: ['APPARENT_COMPLETION_UNCERTAIN'],
    });
  });
});
