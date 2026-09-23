import type { Scene, StoryboardEntry, Operation } from '../../../types';
import { generateProgression } from '../../../engines/progression';
import { generateMicroTimeline } from '../../../engines/timeline';
import { planWorkRoute } from '../../../engines/work-route';
import type { PipelineContext, StageResult } from '../types';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Stage 6: Scenes & Storyboard Creation
 * Creates scenes and storyboard entries from operations
 */
export class ScenesBuilderStage {
  name = 'scenes';

  execute(context: PipelineContext): StageResult<{ scenes: Scene[]; storyboard: StoryboardEntry[] }> {
    if (!context.operations || !context.config || !context.dna || !context.spatialMap || !context.worldState) {
      return { success: false, error: new Error('Missing required context for scenes') };
    }

    try {
      const scenes: Scene[] = [];
      const storyboard: StoryboardEntry[] = [];

      context.operations.forEach((operation, operationIndex) => {
        const stages = generateProgression(
          operation.id,
          operation.type,
          operation.elements ?? [],
          operation.zones ?? [],
          { component: operation.componentId, status: 'ACTIVE' as const },
        );

        const plannedRoute = planWorkRoute(
          context.spatialMap!,
          context.worldState!.character.currentZone,
          unique(stages.map(stage => stage.activeZone)),
          operation.name,
        );

        const sceneId = `scene_${operation.id}`;
        operation.scenes = [sceneId];

        const scene: Scene = {
          id: sceneId,
          number: operationIndex + 1,
          timecodeStart: operationIndex * context.config!.sceneDuration,
          timecodeEnd: (operationIndex + 1) * context.config!.sceneDuration,
          duration: context.config!.sceneDuration,
          operationId: operation.id,
          stages,
          camera: 'A/B',
          activeZones: unique(stages.map(stage => stage.activeZone)),
          characterId: context.dna!.character.id,
          status: 'draft',
          riskLevel: 'LOW',
          microTimeline: generateMicroTimeline(operation),
        };

        scenes.push(scene);
        storyboard.push({
          sceneId,
          description: `${operation.name}: ${operation.topology}, zonas ${scene.activeZones.join(' → ')}, progressão 0/25/50/75/100`,
          locked: false,
          imageAttached: false,
        });
      });

      context.scenes = scenes;
      context.storyboard = storyboard;

      return { success: true, data: { scenes, storyboard } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.scenes || context.scenes.length === 0) {
      return { success: false, error: new Error('No scenes created') };
    }
    if (!context.storyboard || context.storyboard.length !== context.scenes.length) {
      return { success: false, error: new Error('Storyboard length mismatch') };
    }
    return { success: true };
  }
}