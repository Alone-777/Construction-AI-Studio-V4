import { describe, expect, it } from 'vitest';
import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { FireflyExecutionJob } from './types';
import {
  buildConstructionFiscalVisualContext,
  deriveConstructionFiscalObservation,
} from './visual-fiscal-observer';

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
      forbiddenFutureElements: ['pilares_madeira', 'paredes_madeira'],
    },
    acceptanceChecklist: [],
    output: { videoSlot: 'video.mp4', lastFrameSlot: 'last.png' },
    status: 'READY',
  };
}

function claim<T>(value: T | null, classification: 'FACT' | 'HYPOTHESIS' | 'UNKNOWN' = 'FACT', confidence = 0.9) {
  return { value, classification, confidence, evidence: 'visible' };
}

function analysis(completion: number | null, completionClass: 'FACT' | 'HYPOTHESIS' | 'UNKNOWN' = 'FACT', visible: string[] = []): NormalizedVisualAnalysis {
  const base = claim(null, 'UNKNOWN', 0);
  return {
    schemaVersion: '1.0.0',
    providerId: 'test',
    summary: 'construction contact sheet',
    claims: {
      constructionType: base, environment: base, terrain: base, watercourse: base,
      vegetation: base, visibleComponents: claim(visible, 'FACT', 0.9),
      apparentMaterials: base, structure: base, foundation: base, floor: base, walls: base,
      roof: base, openings: base, externalAreas: base, paths: base, drainage: base,
      spatialRelations: base, naturalElements: base, preservationElements: base,
      apparentCompletion: claim(completion, completionClass, completionClass === 'UNKNOWN' ? 0 : 0.9),
    },
    uncertainties: [],
    technicalUnknowns: [],
  } as NormalizedVisualAnalysis;
}

describe('Construction visual fiscal observer', () => {
  it('asks the provider to judge only the current operation and terminal panel', () => {
    const context = buildConstructionFiscalVisualContext(job(), 'piso');
    expect(context).toContain('CURRENT OPERATION');
    expect(context).toContain('RIGHT = terminal/end');
    expect(context).toContain('must end at 50%');
    expect(context).toContain('pilares_madeira');
  });

  it('turns a confident 95% completion reading into fiscal-ready evidence', () => {
    const result = deriveConstructionFiscalObservation(job(), analysis(95));
    expect(result.readyForFiscal).toBe(true);
    expect(result.observation?.observedStagePercentage).toBe(95);
  });

  it('detects canonical future elements from visual components', () => {
    const result = deriveConstructionFiscalObservation(
      job(),
      analysis(50, 'FACT', ['pilares_madeira']),
    );
    expect(result.observation?.detectedFutureElements).toEqual(['pilares_madeira']);
  });

  it('refuses to invent progress when apparent completion is unknown', () => {
    const result = deriveConstructionFiscalObservation(job(), analysis(null, 'UNKNOWN'));
    expect(result.readyForFiscal).toBe(false);
    expect(result.blockers).toContain('APPARENT_COMPLETION_UNCERTAIN');
    expect(result.observation).toBeUndefined();
  });
});
