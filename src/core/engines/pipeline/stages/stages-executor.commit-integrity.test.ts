import { describe, expect, it, vi } from 'vitest';
import { compileDescriptionToBlueprint } from '../../../blueprints/description-blueprint';
import type { ConstructionDecision, DecisionContext } from '../../../decision/ConstructionDecision';
import type { FiscalRunner } from '../../../fiscals/fiscal-runner';
import type { Stage } from '../../../types';
import { DependencyBuilderStage } from '../dependency/DependencyBuilder';
import { DNABuilderStage } from '../dna/DNABuilder';
import { OperationsBuilderStage } from '../operations/OperationsBuilder';
import { ScenesBuilderStage } from '../scenes/ScenesBuilder';
import { SpatialBuilderStage } from '../spatial/SpatialBuilder';
import type { PipelineContext } from '../types';
import { WorldBuilderStage } from '../world/WorldBuilder';
import { StagesExecutorStage } from './StagesExecutor';

function createContext(operationCount: number): PipelineContext {
  const compiled = compileDescriptionToBlueprint({
    description: 'Cabana simples de madeira em terreno plano.',
    name: 'Commit Integrity',
  });
  const context: PipelineContext = {
    config: compiled.config,
    blueprint: {
      ...compiled.blueprint,
      components: compiled.blueprint.components.slice(0, operationCount),
      operations: compiled.blueprint.operations.slice(0, operationCount),
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
    : [{ code: 'E-COMMIT', message: 'Candidate rejected', severity: 'ERROR' as const }];

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

function runRejectedScenario() {
  const context = createContext(1);
  const fiscal = vi.fn(({ stage }: { stage: Stage }) => fiscalResult(stage.percentage !== 50));
  context.fiscalRunner = { runAllFiscals: fiscal } as unknown as FiscalRunner;

  const result = new StagesExecutorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Stages executor failed');

  return {
    context,
    fiscal,
    stage25: stageAt(context, 25),
    stage50: stageAt(context, 50),
    stage75: stageAt(context, 75),
    stage100: stageAt(context, 100),
  };
}

describe('StagesExecutorStage - commit integrity', () => {
  it('marks a fiscal FAIL stage as rejected', () => {
    const { stage50 } = runRejectedScenario();

    expect(stage50.status).toBe('rejected');
  });

  it('does not attach a temporal decision to a rejected stage', () => {
    const { stage50 } = runRejectedScenario();

    expect(stage50.decision).toBeUndefined();
  });

  it('keeps the last approved state as the official world state', () => {
    const { context, stage25, stage50 } = runRejectedScenario();

    expect(context.worldState).toBe(stage25.worldStateAfter);
    expect(context.worldState).not.toBe(stage50.worldStateAfter);
    expect(context.worldState?.construction.progress).toBe(25);
  });

  it('stops physical progression after the first rejected stage', () => {
    const { context, fiscal, stage75, stage100 } = runRejectedScenario();

    expect(fiscal).toHaveBeenCalledTimes(3); // 0% and 25% PASS, 50% FAIL
    expect(stage75.worldStateBefore).toBeUndefined();
    expect(stage75.worldStateAfter).toBeUndefined();
    expect(stage100.worldStateBefore).toBeUndefined();
    expect(stage100.worldStateAfter).toBeUndefined();
    expect(context.worldState?.construction.progress).toBe(25);
  });

  it('does not complete a component whose operation was rejected', () => {
    const { context } = runRejectedScenario();
    const component = context.dependencyGraph?.nodes[0];

    expect(component?.status).not.toBe('COMPLETE');
  });

  it('does not force final construction progress to 100 after rejection', () => {
    const { context } = runRejectedScenario();

    expect(context.worldState?.construction.progress).toBe(25);
    expect(context.worldState?.construction.status).toBe('em andamento');
  });

  it('preserves the rejected candidate state as stage evidence', () => {
    const { context, stage50 } = runRejectedScenario();

    expect(stage50.worldStateAfter).toBeDefined();
    expect(stage50.worldStateAfter?.construction.progress).toBe(50);
    expect(stage50.worldStateAfter).not.toBe(context.worldState);
  });

  it('builds decisions only from components committed by that temporal point', () => {
    const context = createContext(3);
    context.fiscalRunner = {
      runAllFiscals: vi.fn(() => fiscalResult(true)),
    } as unknown as FiscalRunner;

    const decisionContexts: DecisionContext[] = [];
    const executor = new StagesExecutorStage();
    const decide = vi.fn((decisionContext: DecisionContext): ConstructionDecision => {
      decisionContexts.push(decisionContext);
      return {
        action: 'EXECUTE_OPERATION',
        operationId: 'observed-operation',
        reason: 'Observed committed state',
        confidence: 1,
      };
    });
    (executor as unknown as { engine: { decide: typeof decide } }).engine = { decide };

    const result = executor.execute(context);
    expect(result.success).toBe(true);

    const [componentA, componentB, componentC] = context.operations!.map(operation => operation.componentId!);
    const afterA = decisionContexts[4].constructionState.completedElements;
    const afterB = decisionContexts[9].constructionState.completedElements;

    expect(afterA).toContain(componentA);
    expect(afterA).not.toContain(componentB);
    expect(afterA).not.toContain(componentC);
    expect(afterB).toContain(componentA);
    expect(afterB).toContain(componentB);
    expect(afterB).not.toContain(componentC);
  });
});
