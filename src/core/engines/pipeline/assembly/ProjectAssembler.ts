import type { Project, ProjectConfig } from '../../../types';
import type { ConstructionBlueprint } from '../../project-orchestrator';
import type { PipelineContext, StageResult } from '../types';

/**
 * Stage 9: Project Assembly
 * Assembles final Project object from all pipeline stages
 */
export class ProjectAssemblerStage {
  name = 'assembly';

  execute(context: PipelineContext): StageResult<Project> {
    if (!context.config || !context.blueprint || !context.dna || !context.worldState ||
        !context.spatialMap || !context.dependencyGraph || !context.operations ||
        !context.scenes || !context.storyboard || !context.createdAt) {
      return { success: false, error: new Error('Missing required context for project assembly') };
    }

    try {
      const project: Project = {
        id: `${context.blueprint.id}_${context.createdAt}`,
        name: context.config.name,
        dna: context.dna,
        worldState: context.worldState,
        spatialMap: context.spatialMap,
        dependencyGraph: context.dependencyGraph,
        operations: context.operations,
        scenes: context.scenes,
        storyboard: context.storyboard,
        createdAt: context.createdAt,
        updatedAt: context.createdAt,
        status: 'complete',
      };

      context.project = project;

      return { success: true, data: project };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.project) {
      return { success: false, error: new Error('Project not assembled') };
    }
    if (!context.project.id || !context.project.name || !context.project.dna) {
      return { success: false, error: new Error('Project missing required fields') };
    }
    return { success: true };
  }
}