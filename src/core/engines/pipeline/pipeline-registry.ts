import { PipelineStage } from './types';
import { SpatialBuilderStage } from './spatial/SpatialBuilder';
import { DNABuilderStage } from './dna/DNABuilder';
import { DependencyBuilderStage } from './dependency/DependencyBuilder';
import { WorldBuilderStage } from './world/WorldBuilder';
import { OperationsBuilderStage } from './operations/OperationsBuilder';
import { ScenesBuilderStage } from './scenes/ScenesBuilder';
import { StagesExecutorStage } from './stages/StagesExecutor';
import { EpisodePlannerStage } from './episode-planner/EpisodePlannerStage';
import { SceneDirectorStage } from './scene-director/SceneDirectorStage';
import { PromptsGeneratorStage } from './prompts/PromptsGenerator';
import { ProjectAssemblerStage } from './assembly/ProjectAssembler';

/**
 * Centralized Pipeline Stage Registry
 *
 * Single source of truth for all pipeline stages in execution order.
 * Mirrors the FiscalRegistry pattern for consistency.
 * Adding/removing/reordering stages only requires modifying this file.
 */
export class PipelineRegistry {
  private static _stages: PipelineStage[] | null = null;

  /**
   * Returns all registered pipeline stages in execution order.
   * Order is preserved from the original PipelineOrchestrator implementation.
   */
  static getStages(): PipelineStage[] {
    if (this._stages === null) {
      this._stages = [
        new SpatialBuilderStage(),         // 1. Spatial map must come first (needed for DNA cameras)
        new DNABuilderStage(),             // 2. DNA creation (uses spatial map for visible zones)
        new DependencyBuilderStage(),      // 3. Dependency graph
        new WorldBuilderStage(),           // 4. World state initialization
        new OperationsBuilderStage(),      // 5. Operations creation
        new ScenesBuilderStage(),          // 6. Scenes & storyboard
        new StagesExecutorStage(),         // 7. Stages execution with fiscal validation + temporal decision
        new EpisodePlannerStage(),         // 8. Episode planner - cinematic prioritization & shot planning
        new SceneDirectorStage(),          // 9. Scene director - cinematic TikTok scenes (uses plan)
        new PromptsGeneratorStage(),       // 10. Prompt generation
        new ProjectAssemblerStage(),       // 11. Final project assembly
      ];
    }
    return this._stages;
  }

  /**
   * Returns stage names in execution order for debugging/inspection.
   */
  static getStageNames(): string[] {
    return this.getStages().map(s => s.name);
  }

  /**
   * Returns a stage by name (for testing/debugging).
   */
  static getStage(name: string): PipelineStage | undefined {
    return this.getStages().find(s => s.name === name);
  }

  /**
   * Resets the registry (useful for testing).
   */
  static reset(): void {
    this._stages = null;
  }
}

/**
 * Pre-computed stage list for direct consumption.
 * Use PipelineRegistry.getStages() for lazy initialization.
 */
export const pipelineStages = PipelineRegistry.getStages();