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
import { buildStageVisualStateSnapshots } from '../visual-state/visual-state-snapshot';
import { compileCanonicalImagePromptSpec } from './canonical-image-prompt-compiler';

function createContext(operationCount: number): PipelineContext {
  const compiled = compileDescriptionToBlueprint({
    description: 'Cabana simples de madeira em terreno plano.',
    name: 'Canonical Image Prompt Integration',
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
    : [{ code: 'E-CANONICAL-PROMPT', message: 'Candidate rejected', severity: 'ERROR' as const }];
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
    id: 'canonical-prompt-visual-dna',
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

function snapshotsFor(
  context: PipelineContext,
  scene: Scene,
  stage: Stage,
  operation: Operation,
) {
  return buildStageVisualStateSnapshots({
    projectId: context.blueprint.id,
    scene,
    stage,
    operation,
    visualDNA: visualDNA(context),
    spatialMap: context.spatialMap!,
    cameras: context.dna!.cameras,
  });
}

function stageAt(scene: Scene, percentage: Stage['percentage']): Stage {
  const stage = scene.stages.find(candidate => candidate.percentage === percentage);
  if (!stage) throw new Error(`Missing ${percentage}% stage`);
  return stage;
}

function execute(context: PipelineContext, approve: (stage: Stage) => boolean): void {
  context.fiscalRunner = {
    runAllFiscals: vi.fn(({ stage }: { stage: Stage }) => fiscalResult(approve(stage))),
  } as unknown as FiscalRunner;
  const result = new StagesExecutorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Stages executor failed');
}

describe('StagesExecutorStage - canonical image prompt integration', () => {
  it('compiles a committed official stage with the correct action and forbidden future', () => {
    const context = createContext(3);
    execute(context, () => true);
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const stage = stageAt(scene, 100);
    const official = snapshotsFor(context, scene, stage, operation).official;
    const spec = compileCanonicalImagePromptSpec(official);
    const [componentA, componentB, componentC] = context.operations!.map(item => item.componentId!);

    expect(stage.physicalActionIR).toBeDefined();
    expect(spec).toMatchObject({
      identity: { snapshotKind: 'OFFICIAL', stageOutcome: 'COMMITTED' },
      primaryAction: {
        physicalActionIRId: stage.physicalActionIR!.id,
        target: { id: componentA },
      },
    });
    expect(spec?.currentConstruction.presentComponents).toContain(componentA);
    expect(spec?.currentConstruction.presentComponents).not.toContain(componentB);
    expect(spec?.currentConstruction.presentComponents).not.toContain(componentC);
    expect(spec?.mustNotShow.futureComponents).toEqual(
      expect.arrayContaining([componentB, componentC]),
    );
  });

  it('allows a rejected candidate spec without classifying it as official', () => {
    const context = createContext(1);
    execute(context, stage => stage.percentage !== 50);
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const stage = stageAt(scene, 50);
    const candidate = snapshotsFor(context, scene, stage, operation).candidate;
    const spec = compileCanonicalImagePromptSpec(candidate);

    expect(stage.status).toBe('rejected');
    expect(stage.physicalActionIR).toBeDefined();
    expect(spec).toMatchObject({
      identity: { snapshotKind: 'CANDIDATE', stageOutcome: 'REJECTED' },
      primaryAction: { visibility: 'ATTEMPTED' },
    });
    expect(spec?.identity.snapshotKind).not.toBe('OFFICIAL');
  });

  it('keeps A/B/C temporal construction visibility isolated at each official stage', () => {
    const context = createContext(3);
    execute(context, () => true);
    const [operationA, operationB, operationC] = context.operations!;
    const sceneA = context.scenes!.find(scene => scene.operationId === operationA.id)!;
    const sceneB = context.scenes!.find(scene => scene.operationId === operationB.id)!;
    const specAfterA = compileCanonicalImagePromptSpec(
      snapshotsFor(context, sceneA, stageAt(sceneA, 100), operationA).official,
    )!;
    const specAfterB = compileCanonicalImagePromptSpec(
      snapshotsFor(context, sceneB, stageAt(sceneB, 100), operationB).official,
    )!;
    const componentA = operationA.componentId!;
    const componentB = operationB.componentId!;
    const componentC = operationC.componentId!;

    expect(specAfterA.currentConstruction.presentComponents).toContain(componentA);
    expect(specAfterA.currentConstruction.presentComponents).not.toContain(componentB);
    expect(specAfterA.currentConstruction.presentComponents).not.toContain(componentC);
    expect(specAfterA.mustNotShow.futureComponents).toEqual(
      expect.arrayContaining([componentB, componentC]),
    );

    expect(specAfterB.currentConstruction.presentComponents).toEqual(
      expect.arrayContaining([componentA, componentB]),
    );
    expect(specAfterB.currentConstruction.presentComponents).not.toContain(componentC);
    expect(specAfterB.mustNotShow.futureComponents).toContain(componentC);
  });

  it('cannot compile a fake spec for a stage skipped after rejection', () => {
    const context = createContext(1);
    execute(context, stage => stage.percentage !== 50);
    const scene = context.scenes![0];
    const operation = context.operations![0];
    const skipped = stageAt(scene, 75);
    const snapshots = snapshotsFor(context, scene, skipped, operation);

    expect(skipped.physicalActionIR).toBeUndefined();
    expect(snapshots).toEqual({});
    expect(compileCanonicalImagePromptSpec(snapshots.candidate)).toBeUndefined();
  });
});
