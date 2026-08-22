import type { Scene, ProjectDNA, SpatialMap, WorldState } from '../../../types';
import { generateNanoBananaPrompt } from '../../../prompts/nano-banana';
import { generateKlingPrompt } from '../../../prompts/kling';
import type { PipelineContext, StageResult } from '../types';

/**
 * Stage 8: Prompts Generation
 * Generates NanoBanana and Kling prompts for each stage
 */
export class PromptsGeneratorStage {
  name = 'prompts';

  execute(context: PipelineContext): StageResult {
    if (!context.scenes || !context.dna || !context.spatialMap) {
      return { success: false, error: new Error('Missing required context for prompt generation') };
    }

    try {
      for (const scene of context.scenes) {
        for (const stage of scene.stages) {
          const promptState = stage.worldStateBefore ?? context.worldState;
          if (!promptState) continue;

          stage.prompts = {
            nanoBanana: generateNanoBananaPrompt(
              scene, stage, promptState, context.dna!, context.spatialMap!, context.previousScene,
            ).fullText,
            kling: generateKlingPrompt(scene, stage, promptState, context.dna!).fullText,
          };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.scenes) {
      return { success: false, error: new Error('No scenes to validate') };
    }
    for (const scene of context.scenes) {
      for (const stage of scene.stages) {
        if (!stage.prompts?.nanoBanana || !stage.prompts?.kling) {
          return { success: false, error: new Error(`Stage ${stage.percentage}% of scene ${scene.id} missing prompts`) };
        }
      }
    }
    return { success: true };
  }
}