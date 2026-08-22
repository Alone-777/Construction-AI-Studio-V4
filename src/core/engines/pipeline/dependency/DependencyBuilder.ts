import type { DependencyGraph, ConstructionComponent } from '../../../types';
import {
  addComponent,
  addEdge,
  createDependencyGraph,
  updateComponentStatus,
} from '../../../engines/dependency-graph';
import type { PipelineContext, StageResult } from '../types';

/**
 * Stage 3: Dependency Graph Creation
 * Creates dependency graph from blueprint components
 */
export class DependencyBuilderStage {
  name = 'dependency';

  execute(context: PipelineContext): StageResult<DependencyGraph> {
    if (!context.blueprint) {
      return { success: false, error: new Error('Missing blueprint') };
    }

    try {
      const dependencyGraph: DependencyGraph = createDependencyGraph();

      // Add all components
      for (const definition of context.blueprint.components) {
        addComponent(dependencyGraph, {
          ...definition,
          dependencies: [...definition.dependencies],
          zones: [...definition.zones],
          status: definition.dependencies.length === 0 ? 'READY' : 'BLOCKED',
        });
      }

      // Add all edges
      for (const component of context.blueprint.components) {
        for (const dependency of component.dependencies) {
          addEdge(dependencyGraph, dependency, component.id, true);
        }
      }

      context.dependencyGraph = dependencyGraph;

      return { success: true, data: dependencyGraph };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.dependencyGraph) {
      return { success: false, error: new Error('Dependency graph not created') };
    }
    if (!context.dependencyGraph.nodes || context.dependencyGraph.nodes.length === 0) {
      return { success: false, error: new Error('Dependency graph has no components') };
    }
    return { success: true };
  }
}