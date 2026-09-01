import { describe, expect, it, vi } from 'vitest';
import { compileDescriptionToBlueprint } from '../blueprints/description-blueprint';
import { DependencyBuilderStage } from '../engines/pipeline/dependency/DependencyBuilder';
import { DNABuilderStage } from '../engines/pipeline/dna/DNABuilder';
import { OperationsBuilderStage } from '../engines/pipeline/operations/OperationsBuilder';
import { ScenesBuilderStage } from '../engines/pipeline/scenes/ScenesBuilder';
import { SpatialBuilderStage } from '../engines/pipeline/spatial/SpatialBuilder';
import { StagesExecutorStage } from '../engines/pipeline/stages/StagesExecutor';
import type { PipelineContext } from '../engines/pipeline/types';
import { WorldBuilderStage } from '../engines/pipeline/world/WorldBuilder';
import type { FiscalRunner } from '../fiscals/fiscal-runner';
import { DEFAULT_VISUAL_DNA, type VisualDNA } from '../types/project';
import type { Operation, Scene, Stage } from '../types/scene';
import { buildStageVisualStateSnapshots } from './visual-state-snapshot';

function createContext(operationCount: number): PipelineContext {
  const compiled = compileDescriptionToBlueprint({
    description: 'Cabana simples de madeira em terreno plano.',
    name: 'Visual State Snapshot Integration',
  });
  const context: PipelineContext = {
    config: compiled.config,
    blueprint: {
      ...compiled.blueprint,
      components: compiled.blueprint.components.slice(0, operationCount),
      operations: compiled.blueprint.operations.slice(0, operationCount),
    },
    createdAt: 1,
  };

  const setupStages = [
    new SpatialBuilderStage(),
    new DNABuilderStage(),
    new DependencyBuilderStage(),
    new WorldBuilderStage(),
    new OperationsBuilderStage(),
    new ScenesBuilderStage(),
  ];

  for (const setupStage of setupStages) {
    const result = setupStage.execute(context);
    if (!result.success) throw result.error ?? new Error(`Failed to execute ${setupStage.name}`);
  }

  return context;
}

function fiscalResult(approved: boolean) {
  const errors = approved
    ? []
    : [{ code: 'E-VISUAL-STATE', message: 'Candidate rejected', severity: 'ERROR' as const }];

  return {
    results: {
      dependencies: approved,
      temporal: true,
      spatial: true,
      causality: true,
      conservation: true,
      character: true,
      tools: true,
      visibility: true,
      progression: true,
      approved,
      errors,
      checks: [],
    },
    errors,
    warnings: [],
    approved,
    qualityScore: {
      continuity: 80,
      causality: 80,
      progression: approved ? 80 : 40,
      space: 80,
      rhythm: 80,
      clarity: 80,
      camera: 80,
      jumpRisk: approved ? 20 : 60,
      overall: approved ? 80 : 60,
    },
    jumpRisk: approved ? 'LOW' as const : 'HIGH' as const,
    status: approved ? 'approved' as const : 'blocked' as const,
  };
}

function visualDNA(context: PipelineContext): VisualDNA {
  return {
    ...structuredClone(DEFAULT_VISUAL_DNA),
    id: 'visual-dna-integration',
    character: {
      ...structuredClone(DEFAULT_VISUAL_DNA.character),
      id: context.dna!.character.id,
      name: context.dna!.character.name,
      appearance: context.dna!.character.appearance,
      clothing: context.dna!.character.clothes,
    },
    updatedAt: 1,
  };
}

function snapshotInput(context: PipelineContext, scene: Scene, stage: Stage, operation: Operation) {
  return {
    projectId: context.blueprint.id,
    scene,
    stage,
    operation,
    visualDNA: visualDNA(context),
    spatialMap: context.spatialMap!,
    cameras: context.dna!.cameras,
  };
}

function stageAt(scene: Scene, percentage: Stage['percentage']): Stage {
  const stage = scene.stages.find(candidate => candidate.percentage === percentage);
  if (!stage) throw new Error(`Missing ${percentage}% stage`);
  return stage;
}

function runRejectedScenario(): PipelineContext {
  const context = createContext(1);
  context.fiscalRunner = {
    runAllFiscals: vi.fn(({ stage }: { stage: Stage }) => fiscalResult(stage.percentage !== 50)),
  } as unknown as FiscalRunner;
  const result = new StagesExecutorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Stages executor failed');
  return context;
}

describe('StagesExecutorStage - VisualStateSnapshot integration', () => {
  it('builds a committed official snapshot without future leakage after PASS', () => {
    const context = createContext(3);
    context.fiscalRunner = {
      runAllFiscals: vi.fn(() => fiscalResult(true)),
    } as unknown as FiscalRunner;
    const result = new StagesExecutorStage().execute(context);
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const stage = stageAt(scene, 100);

    const snapshots = buildStageVisualStateSnapshots(snapshotInput(context, scene, stage, operation));
    const [componentA, componentB, componentC] = context.operations!.map(item => item.componentId!);

    expect(result.success).toBe(true);
    expect(stage.physicalActionIR).toBeDefined();
    expect(snapshots.official).toMatchObject({
      kind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      worldStateSource: 'CANDIDATE',
    });
    expect(snapshots.official?.construction.visibleComponents).toContain(componentA);
    expect(snapshots.official?.construction.visibleComponents).not.toContain(componentB);
    expect(snapshots.official?.construction.visibleComponents).not.toContain(componentC);
    expect(snapshots.official?.continuity.futureForbidden).toEqual(
      expect.arrayContaining([componentB, componentC]),
    );
  });

  it('keeps rejected candidate visual state isolated from official', () => {
    const context = runRejectedScenario();
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const stage = stageAt(scene, 50);

    const snapshots = buildStageVisualStateSnapshots(snapshotInput(context, scene, stage, operation));

    expect(stage.status).toBe('rejected');
    expect(stage.physicalActionIR).toBeDefined();
    expect(snapshots.candidate).toMatchObject({
      kind: 'CANDIDATE',
      worldStateSource: 'CANDIDATE',
      construction: { progress: stage.worldStateAfter!.construction.progress },
    });
    expect(snapshots.official).toMatchObject({
      kind: 'OFFICIAL',
      worldStateSource: 'BEFORE',
      construction: { progress: stage.worldStateBefore!.construction.progress },
    });
    expect(snapshots.official?.construction.progress).not.toBe(
      snapshots.candidate?.construction.progress,
    );
  });

  it('builds no fake visual state for a stage skipped after FAIL', () => {
    const context = runRejectedScenario();
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const skippedStage = stageAt(scene, 75);

    expect(skippedStage.physicalActionIR).toBeUndefined();
    expect(buildStageVisualStateSnapshots(
      snapshotInput(context, scene, skippedStage, operation),
    )).toEqual({});
  });
});
