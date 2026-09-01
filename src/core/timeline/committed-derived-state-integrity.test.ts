import { describe, expect, it } from 'vitest';
import type { PipelineContext } from '../engines/pipeline/types';
import { ProjectAssemblerStage } from '../engines/pipeline/assembly/ProjectAssembler';
import { EpisodePlannerStage } from '../engines/pipeline/episode-planner/EpisodePlannerStage';
import { SceneDirectorStage } from '../engines/pipeline/scene-director/SceneDirectorStage';
import { ConstructionSeriesGenerator } from '../series/ConstructionSeriesGenerator';
import { createProjectConstructionSnapshot } from '../state/createConstructionSnapshot';
import { DEFAULT_VISUAL_DNA } from '../types/project';
import type { Project, Scene, Stage, WorldState } from '../types';
import type { ConstructionTimelineFrame } from '../types/construction-timeline';
import { createConstructionTimeline } from './createConstructionTimeline';

function worldState(
  progress: number,
  existingComponents: string[],
  partialComponents: string[],
  futureComponents: string[],
  options: {
    materialQuantity?: number;
    consumedQuantity?: number;
    action?: string;
    zone?: string;
    climate?: string;
    light?: string;
  } = {}
): WorldState {
  return {
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'house', progress, status: progress === 100 ? 'complete' : 'in_progress' },
    existingComponents: [...existingComponents],
    partialComponents: [...partialComponents],
    futureComponents: [...futureComponents],
    materials: [{
      materialId: 'wood',
      quantity: options.materialQuantity ?? 10,
      status: 'disponivel',
      location: 'site',
      origin: 'supplied',
    }],
    consumedMaterials: options.consumedQuantity
      ? [{ materialId: 'wood', quantity: options.consumedQuantity, status: 'incorporado', location: 'site', origin: 'operation' }]
      : [],
    residues: [],
    tools: [{ toolId: 'hammer', status: 'em_uso', location: 'site', inUse: true }],
    character: {
      characterId: 'builder',
      currentZone: options.zone ?? 'zone-a',
      orientation: 'NORTH',
      currentAction: options.action ?? 'idle',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: options.zone ?? 'zone-a',
    climate: options.climate ?? 'clear',
    light: options.light ?? 'day',
    vegetation: {},
    camera: 'cameraA',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: progress,
  } as unknown as WorldState;
}

function stage(
  before: WorldState | undefined,
  after: WorldState | undefined,
  options: {
    status?: Stage['status'];
    committed?: boolean;
    plannedCompleted?: string[];
    plannedPartial?: string[];
    futureElements?: string[];
    component?: string;
  } = {}
): Stage {
  return {
    percentage: 100,
    initialState: {},
    characterPosition: 'planned-zone',
    activeZone: 'planned-zone',
    physicalAction: 'planned action',
    tool: 'planned-tool',
    component: options.component,
    allowedChanges: [],
    finalState: {},
    visualEvidence: [],
    preservedZones: [],
    futureElements: options.futureElements ?? [],
    physicalState: {
      elementProgress: {},
      completedElements: options.plannedCompleted ?? [],
      partialElements: options.plannedPartial ?? [],
    },
    cameraId: 'A',
    validations: {
      dependencies: true,
      temporal: true,
      spatial: true,
      causality: true,
      conservation: true,
      character: true,
      tools: true,
      visibility: true,
      progression: true,
      approved: options.status !== 'rejected',
      errors: [],
    },
    worldStateBefore: before,
    worldStateAfter: after,
    status: options.status,
    decision: options.committed === false || options.status === 'rejected'
      ? undefined
      : { action: 'EXECUTE_OPERATION', operationId: options.component ?? 'operation', reason: 'committed', confidence: 1 },
  };
}

function scene(id: string, operationId: string, stages: Stage[]): Scene {
  return {
    id,
    number: 1,
    timecodeStart: 0,
    timecodeEnd: 10,
    duration: 10,
    operationId,
    stages,
    camera: 'A',
    activeZones: ['zone-a'],
    characterId: 'builder',
    status: 'validated',
    riskLevel: 'LOW',
    microTimeline: [],
  };
}

function history(rejectB = false): { scenes: Scene[]; finalState: WorldState } {
  const initial = worldState(0, [], [], ['A', 'B', 'C'], { action: 'idle' });
  const afterA = worldState(25, ['A'], [], ['B', 'C'], { materialQuantity: 8, consumedQuantity: 2, action: 'built A' });
  const candidateB = worldState(50, ['A', 'B'], [], ['C'], {
    materialQuantity: 5,
    consumedQuantity: 5,
    action: 'built B',
    climate: 'rain',
    light: 'night',
  });

  const stageA = stage(initial, afterA, { status: 'approved', component: 'A', plannedCompleted: ['A'] });
  const stageB = rejectB
    ? stage(afterA, candidateB, { status: 'rejected', committed: false, component: 'B', plannedCompleted: ['A', 'B'] })
    : stage(afterA, candidateB, { status: 'approved', component: 'B', plannedCompleted: ['A', 'B'] });
  const unexecutedC = stage(undefined, undefined, {
    committed: false,
    component: 'C',
    plannedCompleted: ['A', 'B', 'C'],
    futureElements: [],
  });

  return {
    scenes: [scene('scene-a', 'op-a', [stageA]), scene('scene-b', 'op-b', [stageB]), scene('scene-c', 'op-c', [unexecutedC])],
    finalState: rejectB ? afterA : candidateB,
  };
}

function pipelineContext(rejectB = true): PipelineContext {
  const { scenes, finalState } = history(rejectB);
  const camera = {
    id: 'A',
    relativePosition: { x: 0, y: 0 },
    orientation: 0,
    framing: 'medium',
    conceptualHeight: 'media',
    allowedMovement: 'FIXA',
    visibleZones: ['zone-a'],
    partiallyVisibleZones: [],
    hiddenZones: [],
  };
  const character = {
    id: 'builder',
    name: 'Builder',
    appearance: 'worker',
    apparentAge: 30,
    hair: 'short',
    beard: '',
    clothes: 'work clothes',
    shoes: 'boots',
    accessories: [],
    tools: [],
  };
  const config = {
    name: 'Temporal project',
    environment: 'terreno_plano',
    construction: 'house',
    approximateForm: 'rectangular',
    materials: ['wood'],
    workerCount: 1,
    character,
    tools: ['hammer'],
    cameraA: camera,
    cameraB: camera,
    visualStyle: 'cinematografico',
    totalDuration: 60,
    sceneDuration: 10,
    detailLevel: 'alto',
    visualReferences: [],
    preserveTerrain: true,
  };
  const operations = ['a', 'b', 'c'].map(letter => ({
    id: `op-${letter}`,
    name: `Build ${letter.toUpperCase()}`,
    type: 'structure',
    componentId: letter.toUpperCase(),
    elements: [letter.toUpperCase()],
    zones: ['zone-a'],
    visualBasis: {
      classification: 'FACT',
      sourceClassification: 'FACT',
      sourceField: 'description',
      evidence: `Build ${letter.toUpperCase()}`,
      tools: ['hammer'],
    },
    stages: [0, 25, 50, 75, 100],
    topology: 'AREA',
    estimatedDuration: 10,
    scenes: [`scene-${letter}`],
  }));

  return {
    config,
    blueprint: {
      id: 'blueprint-temporal',
      map: { id: 'map', width: 10, height: 10, zones: [] },
      components: [],
      operations: [],
      materials: [],
      tools: [],
      protectedZoneIds: [],
      restrictions: [],
      permanentObjects: [],
      forbiddenElements: [],
      rules: [],
    },
    createdAt: 1,
    dna: {
      id: 'dna',
      config,
      environment: 'terreno_plano',
      finalConstruction: 'house',
      form: 'rectangular',
      materials: ['wood'],
      character,
      clothes: 'work clothes',
      cameras: { a: camera, b: camera },
      aesthetics: 'cinematografico',
      restrictions: [],
      permanentObjects: [],
      rules: [],
      references: [],
      forbiddenElements: [],
    },
    visualDNA: DEFAULT_VISUAL_DNA,
    worldState: finalState,
    spatialMap: { id: 'map', zones: [], width: 10, height: 10, orientation: {}, gridSize: 1 },
    dependencyGraph: { nodes: [], edges: [] },
    operations,
    scenes,
    storyboard: [],
  } as unknown as PipelineContext;
}

function semanticFrames(frames: ConstructionTimelineFrame[]) {
  return frames.map(frame => ({
    id: frame.id,
    sceneId: frame.sceneId,
    progress: frame.progress,
    state: {
      ...frame.state,
      createdAt: undefined,
    },
    visualChanges: frame.visualChanges,
    previousFrameId: frame.previousFrameId,
    nextFrameId: frame.nextFrameId,
  }));
}

describe('#11.1 T1 - committed timeline integrity', () => {
  it('uses the committed stage progress instead of final progress', () => {
    const { scenes } = history(false);
    expect(createConstructionTimeline('project', scenes).frames[0].state.progress).toBe(25);
  });

  it('does not retroactively change frame A after stage B commits', () => {
    const { scenes } = history(false);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames[0].state.completedElements).toEqual(['A']);
    expect(frames[1].state.completedElements).toEqual(['A', 'B']);
  });

  it('does not leak material consumption from B into frame A', () => {
    const { scenes } = history(false);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames[0].state.materialState.remaining).toEqual(['wood (8)']);
    expect(frames[0].state.materialState.consumed).toEqual(['wood (2)']);
    expect(frames[1].state.materialState.consumed).toEqual(['wood (5)']);
  });

  it('does not leak later environment values into frame A', () => {
    const { scenes } = history(false);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames[0].state.environmentState).toEqual({ terrain: 'flat', weather: 'clear', lighting: 'day' });
    expect(frames[1].state.environmentState).toEqual({ terrain: 'flat', weather: 'rain', lighting: 'night' });
  });

  it('uses worldStateBefore as the official frame for a rejected stage', () => {
    const { scenes } = history(true);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames[1].state.completedElements).toEqual(['A']);
    expect(frames[1].state.progress).toBe(25);
  });

  it('preserves rejected worldStateAfter as candidate evidence on Stage', () => {
    const { scenes } = history(true);
    createConstructionTimeline('project', scenes);
    expect(scenes[1].stages[0].worldStateAfter?.existingComponents).toEqual(['A', 'B']);
  });

  it('does not emit a frame for an unexecuted stage', () => {
    const { scenes } = history(true);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames).toHaveLength(2);
    expect(frames.some(frame => frame.sceneId === 'scene-c')).toBe(false);
  });

  it('links the first frame of scene B to the last official frame of scene A', () => {
    const { scenes } = history(false);
    const frames = createConstructionTimeline('project', scenes).frames;
    expect(frames[1].previousFrameId).toBe(frames[0].id);
    expect(frames[0].nextFrameId).toBe(frames[1].id);
    expect(frames[1].visualChanges.modified).toContain('B');
  });

  it('produces identical semantic frames for identical committed history', () => {
    const first = createConstructionTimeline('project', history(false).scenes);
    const second = createConstructionTimeline('project', history(false).scenes);
    expect(semanticFrames(first.frames)).toEqual(semanticFrames(second.frames));
  });
});

describe('#11.1 T2 - official project constructionState', () => {
  it('excludes rejected planned completedElements', () => {
    const { scenes, finalState } = history(true);
    const snapshot = createProjectConstructionSnapshot(scenes, finalState);
    expect(snapshot.completedElements).toEqual(['A']);
    expect(snapshot.completedElements).not.toContain('B');
  });

  it('includes committed existingComponents', () => {
    const { scenes, finalState } = history(false);
    expect(createProjectConstructionSnapshot(scenes, finalState).completedElements).toEqual(['A', 'B']);
  });

  it('does not promote a planned future component to completed', () => {
    const { scenes, finalState } = history(true);
    expect(createProjectConstructionSnapshot(scenes, finalState).completedElements).not.toContain('C');
  });

  it('matches authoritative final existingComponents exactly', () => {
    const { scenes, finalState } = history(false);
    const snapshot = createProjectConstructionSnapshot(scenes, finalState);
    expect(snapshot.completedElements).toEqual(finalState.existingComponents);
  });

  it('uses the official WorldState worker instead of the last rejected Stage action', () => {
    const { scenes, finalState } = history(true);
    const snapshot = createProjectConstructionSnapshot(scenes, finalState);
    expect(snapshot.workerState.action).toBe('built A');
    expect(snapshot.workerState.action).not.toBe('planned action');
  });

  it('keeps completed, active and pending mutually exclusive', () => {
    const state = worldState(40, ['A'], ['A', 'B'], ['A', 'B', 'C']);
    const snapshot = createProjectConstructionSnapshot([], state);
    expect(snapshot.completedElements).toEqual(['A']);
    expect(snapshot.activeElements).toEqual(['B']);
    expect(snapshot.pendingElements).toEqual(['C']);
  });
});

describe('#11.1 T3 - real-history episode and cinematic planning', () => {
  it('EpisodePlannerStage does not mark a rejected operation as completed', () => {
    const context = pipelineContext(true);
    const result = new EpisodePlannerStage().execute(context);
    expect(result.success).toBe(true);
    expect(context.episodes?.every(episode => !episode.metadata.completedElements.includes('B'))).toBe(true);
  });

  it('EpisodePlannerStage does not mark an unexecuted future operation as completed', () => {
    const context = pipelineContext(true);
    new EpisodePlannerStage().execute(context);
    expect(context.episodes?.every(episode => !episode.metadata.completedElements.includes('C'))).toBe(true);
  });

  it('EpisodePlannerStage uses real scene/stage frame identifiers', () => {
    const context = pipelineContext(true);
    new EpisodePlannerStage().execute(context);
    expect(context.episodes?.map(episode => episode.metadata.frameId)).toEqual([
      'scene-a_frame_0',
      'scene-b_frame_0',
    ]);
  });

  it('A PASS -> B FAIL -> C unexecuted yields only two official-history episodes', () => {
    const context = pipelineContext(true);
    new EpisodePlannerStage().execute(context);
    expect(context.episodes).toHaveLength(2);
    expect(context.episodes?.[1].metadata.completedElements).toEqual(['A']);
  });

  it('SceneDirectorStage fallback uses real history for rejected B', () => {
    const context = pipelineContext(true);
    const result = new SceneDirectorStage().execute(context);
    expect(result.success).toBe(true);
    expect(context.episodes?.every(episode => !episode.metadata.completedElements.includes('B'))).toBe(true);
  });

  it('SceneDirectorStage fallback excludes unexecuted C from completed state', () => {
    const context = pipelineContext(true);
    new SceneDirectorStage().execute(context);
    expect(context.episodes?.every(episode => !episode.metadata.completedElements.includes('C'))).toBe(true);
  });

  it('ConstructionSeriesGenerator preserves official timeline order when progress repeats or decreases', () => {
    const context = pipelineContext(true);
    const timeline = createConstructionTimeline(context.blueprint.id, context.scenes!);
    timeline.frames[0].progress = 50;
    timeline.frames[0].state.progress = 50;
    timeline.frames[1].progress = 25;
    timeline.frames[1].state.progress = 25;
    const project = {
      id: 'project',
      name: 'Project',
      visualDNA: DEFAULT_VISUAL_DNA,
      worldState: context.worldState,
      scenes: context.scenes,
      timeline,
    } as Project;
    const series = new ConstructionSeriesGenerator().generate(project);
    expect(series.episodes.map(episode => episode.metadata.frameId)).toEqual([
      timeline.frames[0].id,
      timeline.frames[1].id,
    ]);
  });

  it('ProjectAssembler keeps final worldState while old frames and constructionState stay authoritative', () => {
    const context = pipelineContext(false);
    const result = new ProjectAssemblerStage().execute(context);
    expect(result.success).toBe(true);
    const project = result.data!;
    expect(project.worldState.existingComponents).toEqual(['A', 'B']);
    expect(project.timeline.frames[0].state.completedElements).toEqual(['A']);
    expect(project.timeline.frames[0].state.progress).toBe(25);
    expect(project.constructionState.completedElements).toEqual(['A', 'B']);
  });
});
