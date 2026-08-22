import type { ProjectConfig, ProjectDNA, AdaptiveZoneDefinition, ConstructionRule } from '../../../types';
import { createProjectDNA } from '../../../engines/project-dna';
import type { PipelineContext, StageResult } from '../types';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Stage 1: DNA Creation
 * Creates ProjectDNA from config and enriches it with blueprint data
 */
export class DNABuilderStage {
  name = 'dna';

  execute(context: PipelineContext): StageResult<ProjectDNA> {
    if (!context.config || !context.blueprint) {
      return { success: false, error: new Error('Missing config or blueprint') };
    }

    try {
      const dna = createProjectDNA(context.config);

      // Enrich DNA with blueprint data
      const visibleZones = context.spatialMap
        ? context.spatialMap.zones.filter(zone => !zone.occluded).map(zone => zone.id)
        : [];

      dna.cameras = {
        a: {
          ...dna.cameras.a,
          visibleZones: dna.cameras.a.visibleZones.length > 0 ? dna.cameras.a.visibleZones : visibleZones,
        },
        b: {
          ...dna.cameras.b,
          visibleZones: dna.cameras.b.visibleZones.length > 0 ? dna.cameras.b.visibleZones : visibleZones,
        },
      };

      dna.restrictions = unique([...dna.restrictions, ...context.blueprint.restrictions]);
      dna.permanentObjects = unique([...dna.permanentObjects, ...context.blueprint.permanentObjects]);
      dna.forbiddenElements = unique([...dna.forbiddenElements, ...context.blueprint.forbiddenElements]);
      dna.rules = [...dna.rules, ...context.blueprint.rules];

      context.dna = dna;

      return {
        success: true,
        data: dna,
        warnings: visibleZones.length === 0 ? ['No visible zones found for camera configuration'] : [],
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.dna) {
      return { success: false, error: new Error('DNA not created') };
    }
    if (!context.dna.character || !context.dna.cameras) {
      return { success: false, error: new Error('DNA missing required fields') };
    }
    return { success: true };
  }
}