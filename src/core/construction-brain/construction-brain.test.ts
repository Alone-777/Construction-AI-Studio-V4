import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import {
  compileConstructionBrain,
  serializeConstructionBrain,
  validateConstructionBrain,
} from './index';

describe('Construction Brain MVP v0.1', () => {
  it('compiles the existing cabin project into the four canonical artifacts', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project, { targetDurationSeconds: 180 });

    expect(bundle.project.master.aspectRatio).toBe('16:9');
    expect(bundle.project.master.targetDurationSeconds).toBe(180);
    expect(bundle.project.providers.KLING.maxGenerationSeconds).toBe(15);
    expect(bundle.project.providers.VEO_FAST.maxGenerationSeconds).toBe(8);

    expect(bundle.constructionMap.components.length).toBeGreaterThan(0);
    expect(bundle.constructionMap.orderedComponentIds.length)
      .toBe(bundle.constructionMap.components.length);
    expect(bundle.worldState.initial).toBe(project.worldState);
    expect(bundle.scenes.scenes.length).toBe(project.scenes.length);

    for (const scene of bundle.scenes.scenes) {
      expect(scene.generationSegments.length).toBeGreaterThan(0);
      expect(
        scene.generationSegments.every(segment =>
          segment.durationSeconds <= segment.maxProviderSeconds
        ),
      ).toBe(true);
    }

    const serialized = serializeConstructionBrain(bundle);
    expect(Object.keys(serialized).sort()).toEqual([
      'construction_map.json',
      'project.json',
      'scenes.json',
      'world_state.json',
    ]);

    const validation = validateConstructionBrain(bundle);
    expect(validation.issues.filter(issue => issue.severity === 'ERROR')).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('uses Veo Fast only when a generation segment fits its 8 second limit', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project);

    for (const scene of bundle.scenes.scenes) {
      for (const segment of scene.generationSegments) {
        if (segment.provider === 'VEO_FAST') {
          expect(segment.durationSeconds).toBeLessThanOrEqual(8);
        }
        if (segment.provider === 'KLING') {
          expect(segment.durationSeconds).toBeLessThanOrEqual(15);
        }
      }
    }
  });
});
