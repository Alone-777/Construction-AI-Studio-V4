import type { PipelineContext, StageResult } from '../types';
import { ConstructionDecisionEngine, createDecisionEngine } from '../../../decision/ConstructionDecisionEngine';
import type { OperationDependency, DecisionContext, ConstructionDecision } from '../../../decision/ConstructionDecision';
import type { Operation, WorldState } from '../../../types';

/**
 * Stage 7.5: Decision Stage
 * Runs after StagesExecutorStage to determine the next operation decision
 * Stores decision in context.project.decision for PromptsGeneratorStage to use
 */
export class DecisionStage {
  name = 'decision';
  private engine: ConstructionDecisionEngine;

  constructor() {
    this.engine = createDecisionEngine();
  }

  execute(context: PipelineContext): StageResult<ConstructionDecision> {
    if (!context.operations || !context.worldState || !context.blueprint) {
      return { success: false, error: new Error('Missing required context for decision stage') };
    }

    try {
      // Build decision context from current pipeline state
      const decisionContext = this.buildDecisionContext(
        context.operations,
        context.worldState,
        context.blueprint
      );

      // Get decision from engine
      const decision = this.engine.decide(decisionContext);

      // Store decision in context for PromptsGeneratorStage
      context.decision = decision;

      return { success: true, data: decision };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.decision) {
      return { success: false, error: new Error('Decision not generated') };
    }
    return { success: true };
  }

  private buildDecisionContext(
    operations: Operation[],
    worldState: WorldState,
    blueprint: any
  ): DecisionContext {
    // Determine completed elements from executed operations
    // Since StagesExecutorStage processes all operations, we can check which components are complete
    const completedElements = this.getCompletedElements(worldState, operations, blueprint);
    const activeElements = this.getActiveElements(worldState, operations);
    const pendingElements = this.getPendingElements(operations, completedElements, activeElements);

    // Build material state from world state
    const materialState = this.getMaterialState(worldState);

    // Build worker state from world state
    const workerState = this.getWorkerState(worldState);

    // Build available operations with visualBasis info
    const availableOperations = this.buildAvailableOperations(operations, blueprint);

    // Build inventory from world state
    const inventory = this.buildInventory(worldState);

    // Build dependencies from blueprint
    const dependencies = this.buildDependencies(blueprint);

    return {
      constructionState: {
        completedElements,
        activeElements,
        pendingElements,
        materialState,
        workerState,
      },
      availableOperations,
      inventory,
      dependencies,
    };
  }

  private getCompletedElements(
    worldState: WorldState,
    operations: Operation[],
    blueprint: any
  ): string[] {
    const completed: string[] = [];

    // Check existing components in world state
    if (worldState.existingComponents) {
      completed.push(...worldState.existingComponents);
    }

    // Also check blueprint operations that have been fully executed
    // In the pipeline, all operations in context.operations have been executed
    // by the time this stage runs
    for (const operation of operations) {
      const spec = blueprint.operations.find((op: any) => op.id === operation.id);
      if (spec && spec.components) {
        for (const component of spec.components) {
          if (!completed.includes(component)) {
            completed.push(component);
          }
        }
      }
    }

    return completed;
  }

  private getActiveElements(worldState: WorldState, operations: Operation[]): string[] {
    // After all operations complete, there should be no active elements
    // But check partial components
    return worldState.partialComponents || [];
  }

  private getPendingElements(
    operations: Operation[],
    completedElements: string[],
    activeElements: string[]
  ): string[] {
    const allElements = new Set<string>();
    for (const op of operations) {
      if (op.elements) {
        op.elements.forEach(el => allElements.add(el));
      }
    }

    return Array.from(allElements).filter(
      el => !completedElements.includes(el) && !activeElements.includes(el)
    );
  }

  private getMaterialState(worldState: WorldState): DecisionContext['constructionState']['materialState'] {
    const available: string[] = [];
    const consumed: string[] = [];
    const remaining: string[] = [];

    for (const material of worldState.materials) {
      if (material.status === 'disponivel' && material.quantity > 0) {
        available.push(material.materialId);
      } else if (material.status === 'incorporado' || material.status === 'em_uso') {
        consumed.push(material.materialId);
      }
      // Track remaining (available + partially consumed)
      if (material.quantity > 0) {
        remaining.push(material.materialId);
      }
    }

    // Add consumed materials from consumedMaterials array
    for (const consumedMat of worldState.consumedMaterials) {
      if (!consumed.includes(consumedMat.materialId)) {
        consumed.push(consumedMat.materialId);
      }
    }

    return { available, consumed, remaining };
  }

  private getWorkerState(worldState: WorldState): DecisionContext['constructionState']['workerState'] {
    return {
      position: worldState.character?.currentZone || 'site',
      action: worldState.character?.currentAction || 'idle',
      tools: worldState.tools?.filter(t => t.status === 'em_uso').map(t => t.toolId) || [],
    };
  }

  private buildAvailableOperations(
    operations: Operation[],
    blueprint: any
  ): DecisionContext['availableOperations'] {
    return operations.map(op => {
      const spec = blueprint.operations.find((bop: any) => bop.id === op.id);
      return {
        id: op.id,
        name: op.name || spec?.name || op.id,
        elements: op.elements || [],
        zones: op.zones || [],
        visualBasis: {
          // Extract materials from blueprint's materialUse
          materials: spec?.materialUse ? Object.keys(spec.materialUse) : undefined,
          // Extract tool from blueprint's tool field
          tools: spec?.tool ? [spec.tool] : undefined,
        },
      };
    });
  }

  private buildInventory(worldState: WorldState): DecisionContext['inventory'] {
    const materials: Record<string, number> = {};

    for (const material of worldState.materials) {
      materials[material.materialId] = material.quantity;
    }

    const tools = worldState.tools?.map(t => t.toolId) || [];

    return { materials, tools };
  }

  private buildDependencies(blueprint: any): OperationDependency[] {
    // Build dependencies from blueprint operation dependencies
    const dependencies: OperationDependency[] = [];

    if (blueprint.operations) {
      for (const op of blueprint.operations) {
        if (op.dependsOn && op.dependsOn.length > 0) {
          dependencies.push({
            operationId: op.id,
            dependsOn: op.dependsOn,
          });
        }
      }
    }

    return dependencies;
  }
}

export function createDecisionStage(): DecisionStage {
  return new DecisionStage();
}