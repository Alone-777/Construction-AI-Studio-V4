import { describe, expect, it } from 'vitest';
import type { ConstructionDecision } from '../../decision/ConstructionDecision';
import type { ConstructionTimelineFrame } from '../../types/construction-timeline';
import { DEFAULT_VISUAL_DNA, type Project, type Scene, type Stage } from '../../types';
import { ConstructionSeriesGenerator } from '../ConstructionSeriesGenerator';

function createFrame(sceneId = 'scene-temporal'): ConstructionTimelineFrame {
  return {
    id: `${sceneId}_frame_0`,
    sceneId,
    progress: 25,
    state: {
      sceneId,
      progress: 25,
      completedElements: [],
      activeElements: ['component-a'],
      pendingElements: ['component-b'],
      materialState: { available: ['wood'], consumed: [], remaining: ['wood'] },
      workerState: { position: 'zone-a', action: 'building', tools: ['hammer'] },
      environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
      createdAt: new Date(0),
    },
    visualChanges: { added: [], removed: [], modified: ['component-a'] },
    createdAt: new Date(0),
  };
}

function createProject(stage?: Partial<Stage>): Project {
  const frame = createFrame();
  const scene = {
    id: frame.sceneId,
    stages: stage === undefined ? [] : [stage as Stage],
  } as Scene;

  return {
    id: 'project-temporal',
    name: 'Temporal Integrity',
    visualDNA: DEFAULT_VISUAL_DNA,
    scenes: [scene],
    timeline: {
      id: 'timeline-temporal',
      projectId: 'project-temporal',
      frames: [frame],
      currentFrameId: frame.id,
      createdAt: new Date(0),
    },
    simulation: {
      currentOperationId: 'simulation-operation',
    },
  } as unknown as Project;
}

describe('ConstructionSeriesGenerator - temporal decision integrity', () => {
  it('uses the corresponding Stage.decision instead of simulation state', () => {
    const stageDecision: ConstructionDecision = {
      action: 'EXECUTE_OPERATION',
      operationId: 'stage-operation',
      reason: 'Stage is the temporal authority',
      confidence: 0.99,
    };
    const project = createProject({ decision: stageDecision });

    const series = new ConstructionSeriesGenerator().generate(project);

    expect(series.episodes[0].metadata.decision).toBe(stageDecision);
    expect(series.episodes[0].metadata.decision?.operationId).toBe('stage-operation');
  });

  it('does not synthesize a simulation decision for a rejected frame', () => {
    const project = createProject({ status: 'rejected', decision: undefined });

    const series = new ConstructionSeriesGenerator().generate(project);

    expect(series.episodes).toHaveLength(1);
    expect(series.episodes[0].metadata.decision).toBeUndefined();
    expect(series.episodes[0].metadata.decisionConfidence).toBeUndefined();
  });

  it('keeps simulation fallback when no corresponding temporal Stage exists', () => {
    const project = createProject();

    const series = new ConstructionSeriesGenerator().generate(project);

    expect(series.episodes[0].metadata.decision).toEqual({
      action: 'EXECUTE_OPERATION',
      operationId: 'simulation-operation',
      reason: 'Continuar operação em andamento',
      confidence: 0.8,
    });
  });
});
