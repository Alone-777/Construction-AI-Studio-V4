import type { Operation, ConstructionComponent } from '../../../types';
import type { BlueprintOperation } from '../../../engines/project-orchestrator';
import { analyzeTopology } from '../../../engines/topology';
import { planWorkRoute } from '../../../engines/work-route';
import type { PipelineContext, StageResult } from '../types';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Stage 5: Operations Creation
 * Creates operations from blueprint specifications with topology and work routes
 * Note: Does NOT activate components - dependency validation happens during stage execution
 */
export class OperationsBuilderStage {
  name = 'operations';

  execute(context: PipelineContext): StageResult<Operation[]> {
    if (!context.blueprint || !context.dependencyGraph || !context.spatialMap || !context.worldState || !context.dna || !context.config) {
      return { success: false, error: new Error('Missing required context for operations') };
    }

    try {
      const operations: Operation[] = [];

      context.blueprint.operations.forEach(specification => {
        const component = context.dependencyGraph!.nodes.find(node => node.id === specification.componentId);
        if (!component) throw new Error(`Componente não encontrado: ${specification.componentId}`);
        // Don't activate components here - done during stage execution in StagesExecutorStage

        const topology = analyzeTopology(specification.elements, specification.type, specification.zones);
        const visualBasis = specification.visualBasis
          ? {
              ...specification.visualBasis,
              materials: Object.keys(specification.materialUse ?? {}),
              tools: specification.tool ? [specification.tool] : undefined,
            }
          : {
              classification: 'FACT' as const,
              sourceClassification: 'FACT' as const,
              sourceField: 'blueprint',
              evidence: specification.name,
              sourceOrigin: 'PROVIDER' as const,
              materials: Object.keys(specification.materialUse ?? {}),
              tools: specification.tool ? [specification.tool] : undefined,
            };

        const operation: Operation = {
          id: specification.id,
          name: specification.name,
          type: specification.type,
          componentId: specification.componentId,
          elements: [...specification.elements],
          zones: [...specification.zones],
          visualBasis,
          stages: [0, 25, 50, 75, 100],
          topology: topology.recommendedType,
          estimatedDuration: context.config!.sceneDuration,
          scenes: [],
        };

        operations.push(operation);
      });

      context.operations = operations;

      return { success: true, data: operations };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.operations || context.operations.length === 0) {
      return { success: false, error: new Error('No operations created') };
    }
    for (const op of context.operations) {
      if (!op.id || !op.componentId || !op.topology) {
        return { success: false, error: new Error(`Operation ${op.id} missing required fields`) };
      }
    }
    return { success: true };
  }
}