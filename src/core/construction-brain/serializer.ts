import type { ConstructionBrainBundle } from './types';

export interface ConstructionBrainSerializedArtifacts {
  'project.json': string;
  'construction_map.json': string;
  'world_state.json': string;
  'scenes.json': string;
}

export function serializeConstructionBrain(
  bundle: ConstructionBrainBundle,
  indentation = 2,
): ConstructionBrainSerializedArtifacts {
  return {
    'project.json': JSON.stringify(bundle.project, null, indentation),
    'construction_map.json': JSON.stringify(bundle.constructionMap, null, indentation),
    'world_state.json': JSON.stringify(bundle.worldState, null, indentation),
    'scenes.json': JSON.stringify(bundle.scenes, null, indentation),
  };
}
