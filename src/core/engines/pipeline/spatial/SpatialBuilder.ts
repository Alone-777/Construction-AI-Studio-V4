import type { SpatialMap, AdaptiveZoneDefinition } from '../../../types';
import { createAdaptiveZones, createSpatialMap } from '../../../engines/spatial-map';
import type { PipelineContext, StageResult } from '../types';

/**
 * Stage 2: Spatial Map Creation
 * Creates the spatial map with adaptive zones from blueprint
 */
export class SpatialBuilderStage {
  name = 'spatial';

  execute(context: PipelineContext): StageResult<SpatialMap> {
    if (!context.blueprint) {
      return { success: false, error: new Error('Missing blueprint') };
    }

    try {
      const baseMap = createSpatialMap(
        context.blueprint.map.id,
        context.blueprint.map.width,
        context.blueprint.map.height,
      );
      const spatialMap = createAdaptiveZones(baseMap, context.blueprint.map.zones);

      const visibleZones = spatialMap.zones.filter(zone => !zone.occluded).map(zone => zone.id);

      context.spatialMap = spatialMap;
      context.visibleZones = visibleZones;

      return {
        success: true,
        data: spatialMap,
        warnings: visibleZones.length === 0 ? ['No visible zones in spatial map'] : [],
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.spatialMap) {
      return { success: false, error: new Error('Spatial map not created') };
    }
    if (!context.spatialMap.zones || context.spatialMap.zones.length === 0) {
      return { success: false, error: new Error('Spatial map has no zones') };
    }
    return { success: true };
  }
}