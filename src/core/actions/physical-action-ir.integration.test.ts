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
import type { Stage } from '../types';

function createContext(): PipelineContext {
  const compiled = compileDescriptionToBlueprint({
    description: 'Cabana simples de madeira em terreno plano.',
    name: 'Physical Action IR Integration',
  });
  const context: PipelineContext = {
    config: compiled.config,
    blueprint: {
      ...compiled.blueprint,
      components: compiled.blueprint.components.slice(0, 1),
      operations: compiled.blueprint.operations.slice(0, 1),
    },
    createdAt: Date.now(),
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
    : [{ code: 'E-ACTION-IR', message: 'Candidate rejected', severity: 'ERROR' as const }];

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

function stageAt(context: PipelineContext, percentage: Stage['percentage']): Stage {
  const stage = context.scenes?.[0].stages.find(candidate => candidate.percentage === percentage);
  if (!stage) throw new Error(`Missing ${percentage}% stage`);
  return stage;
}

function runRejectedScenario(): PipelineContext {
  const context = createContext();
  context.fiscalRunner = {
    runAllFiscals: vi.fn(({ stage }: { stage: Stage }) => fiscalResult(stage.percentage !== 50)),
  } as unknown as FiscalRunner;
  const result = new StagesExecutorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Stages executor failed');
  return context;
}

describe('StagesExecutorStage - PhysicalActionIR integration', () => {
  it('attaches a coherent IR to a committed stage', () => {
    const context = createContext();
    context.fiscalRunner = {
      runAllFiscals: vi.fn(() => fiscalResult(true)),
    } as unknown as FiscalRunner;

    const result = new StagesExecutorStage().execute(context);
    const stage = stageAt(context, 25);
    const operation = context.operations![0];

    expect(result.success).toBe(true);
    expect(stage.physicalActionIR).toMatchObject({
      sceneId: context.scenes![0].id,
      stageId: '25',
      operationId: operation.id,
      actor: { characterId: stage.worldStateBefore!.character.characterId },
      target: { id: operation.componentId },
      zone: stage.activeZone,
      before: { constructionProgress: stage.worldStateBefore!.construction.progress },
      after: { constructionProgress: stage.worldStateAfter!.construction.progress },
    });
    expect(stage.physicalActionIR?.primaryAction).toBeDefined();
    expect(stage.physicalActionIR).not.toHaveProperty('actions');
  });

  it('preserves the attempted IR and candidate evidence on a rejected stage', () => {
    const context = runRejectedScenario();
    const rejectedStage = stageAt(context, 50);

    expect(rejectedStage.status).toBe('rejected');
    expect(rejectedStage.physicalActionIR).toBeDefined();
    expect(rejectedStage.physicalActionIR?.after.constructionProgress).toBe(
      rejectedStage.worldStateAfter?.construction.progress,
    );
    expect(rejectedStage.physicalActionIR?.evidence[0]).toBeTruthy();
    expect(context.worldState).not.toBe(rejectedStage.worldStateAfter);
  });

  it('does not create fictitious IRs for stages skipped after rejection', () => {
    const context = runRejectedScenario();

    expect(stageAt(context, 75).physicalActionIR).toBeUndefined();
    expect(stageAt(context, 100).physicalActionIR).toBeUndefined();
  });
});
