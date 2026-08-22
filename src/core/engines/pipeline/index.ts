export * from './types';
export { DNABuilderStage } from './dna/DNABuilder';
export { SpatialBuilderStage } from './spatial/SpatialBuilder';
export { DependencyBuilderStage } from './dependency/DependencyBuilder';
export { WorldBuilderStage } from './world/WorldBuilder';
export { OperationsBuilderStage } from './operations/OperationsBuilder';
export { ScenesBuilderStage } from './scenes/ScenesBuilder';
export { StagesExecutorStage } from './stages/StagesExecutor';
export { PromptsGeneratorStage } from './prompts/PromptsGenerator';
export { ProjectAssemblerStage } from './assembly/ProjectAssembler';

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
import {
  DNABuilderStage,
  SpatialBuilderStage,
  DependencyBuilderStage,
  WorldBuilderStage,
  OperationsBuilderStage,
  ScenesBuilderStage,
  StagesExecutorStage,
  PromptsGeneratorStage,
  ProjectAssemblerStage,
} from './index';

/**
 * Pipeline Orchestrator
 * Executes all pipeline stages in sequence, passing context through each stage
 */
export class PipelineOrchestrator {
  private stages: PipelineStage[];

  constructor() {
    this.stages = [
      new SpatialBuilderStage(),      // 1. Spatial map must come first (needed for DNA cameras)
      new DNABuilderStage(),          // 2. DNA creation (uses spatial map for visible zones)
      new DependencyBuilderStage(),   // 3. Dependency graph
      new WorldBuilderStage(),        // 4. World state initialization
      new OperationsBuilderStage(),   // 5. Operations creation
      new ScenesBuilderStage(),       // 6. Scenes & storyboard
      new StagesExecutorStage(),      // 7. Stages execution with fiscal validation
      new PromptsGeneratorStage(),    // 8. Prompt generation
      new ProjectAssemblerStage(),    // 9. Final project assembly
    ];
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

    if (stage.validate) {
      const validation = stage.validate(context);
      if (!validation.success) return validation;
    }

    return stage.execute(context);
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