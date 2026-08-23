export * from './types';
export { DNABuilderStage } from './dna/DNABuilder';
export { SpatialBuilderStage } from './spatial/SpatialBuilder';
export { DependencyBuilderStage } from './dependency/DependencyBuilder';
export { WorldBuilderStage } from './world/WorldBuilder';
export { OperationsBuilderStage } from './operations/OperationsBuilder';
export { ScenesBuilderStage } from './scenes/ScenesBuilder';
export { StagesExecutorStage } from './stages/StagesExecutor';
export { DecisionStage } from './decision/DecisionStage';
export { SceneDirectorStage } from './scene-director/SceneDirectorStage';
export { PromptsGeneratorStage } from './prompts/PromptsGenerator';
export { ProjectAssemblerStage } from './assembly/ProjectAssembler';
export { PipelineRegistry } from './pipeline-registry';

// Re-export blueprint types from project-orchestrator for backward compatibility
export type { BlueprintOperation, ConstructionBlueprint, BlueprintMaterialStock, BlueprintToolStock } from '../project-orchestrator';

import type {
  PipelineContext,
  PipelineStage,
  PipelineResult,
  StageResult,
} from './types';
import type { ProjectConfig, Project } from '../../types';
import type { ConstructionBlueprint } from '../project-orchestrator';
import { PipelineRegistry } from './pipeline-registry';

/**
 * Pipeline Orchestrator
 * Executes all pipeline stages in sequence, passing context through each stage
 * Stage registration is centralized in PipelineRegistry
 */
export class PipelineOrchestrator {
  private stages: PipelineStage[];

  constructor() {
    this.stages = PipelineRegistry.getStages();
  }

  /**
   * Execute the full pipeline from blueprint to complete Project
   */
  execute(config: ProjectConfig, blueprint: ConstructionBlueprint): PipelineResult {
    const context: PipelineContext = {
      config,
      blueprint,
      createdAt: Date.now(),
    };

    const stageResults: Record<string, StageResult> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const stage of this.stages) {
      // Execute stage first
      const result = stage.execute(context);
      stageResults[stage.name] = result;

      if (!result.success) {
        errors.push(`${stage.name}: ${result.error?.message}`);
        break;
      }

      if (result.warnings) {
        warnings.push(...result.warnings);
      }

      // Validate postconditions if validator exists
      if (stage.validate) {
        const validation = stage.validate(context);
        if (!validation.success) {
          errors.push(`${stage.name}: ${validation.error?.message}`);
          break;
        }
      }
    }

    const success = errors.length === 0 && context.project !== undefined;

    return {
      success,
      project: context.project,
      errors,
      warnings,
      stageResults,
    };
  }

  /**
   * Execute a single stage by name (for testing/debugging)
   */
  executeStage(stageName: string, context: PipelineContext): StageResult {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      return { success: false, error: new Error(`Stage not found: ${stageName}`) };
    }

    // Execute first, then validate (matches main execute loop behavior)
    const result = stage.execute(context);
    if (!result.success) return result;

    if (stage.validate) {
      const validation = stage.validate(context);
      if (!validation.success) return validation;
    }

    return result;
  }

  /**
   * Get all stage names in execution order
   */
  getStageNames(): string[] {
    return this.stages.map(s => s.name);
  }
}

/**
 * Convenience function for backward compatibility
 * Creates a project from blueprint using the modular pipeline
 */
export function createProjectFromBlueprint(
  config: ProjectConfig,
  blueprint: ConstructionBlueprint,
): Project {
  const orchestrator = new PipelineOrchestrator();
  const result = orchestrator.execute(config, blueprint);

  if (!result.success || !result.project) {
    throw new Error(`Pipeline failed: ${result.errors.join(', ')}`);
  }

  return result.project;
}