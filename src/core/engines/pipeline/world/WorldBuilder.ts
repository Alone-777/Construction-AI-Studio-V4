import type { WorldState, ToolInstance } from '../../../types';
import { createInitialWorldState } from '../../../engines/world-state';
import type { PipelineContext, StageResult } from '../types';

/**
 * Stage 4: World State Initialization
 * Creates initial world state from DNA and spatial map
 */
export class WorldBuilderStage {
  name = 'world';

  execute(context: PipelineContext): StageResult<WorldState> {
    if (!context.dna || !context.spatialMap || !context.blueprint) {
      return { success: false, error: new Error('Missing DNA, spatial map, or blueprint') };
    }

    try {
      let worldState = createInitialWorldState(context.dna, context.spatialMap);

      worldState.futureComponents = context.blueprint.components.map(component => component.id);
      worldState.materials = context.blueprint.materials.map(material => ({
        ...material,
        status: 'disponivel',
      }));
      worldState.tools = context.blueprint.tools.map(tool => ({
        ...tool,
        status: 'armazenada',
        inUse: false,
      }));
      worldState.vegetation = Object.fromEntries(
        context.spatialMap.zones.map(zone => [
          zone.id,
          context.blueprint!.protectedZoneIds.includes(zone.id) ? 'protegida' : 'intacta',
        ]),
      );

      context.worldState = worldState;

      return { success: true, data: worldState };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.worldState) {
      return { success: false, error: new Error('World state not created') };
    }
    if (!context.worldState.character || !context.worldState.construction) {
      return { success: false, error: new Error('World state missing required fields') };
    }
    return { success: true };
  }
}