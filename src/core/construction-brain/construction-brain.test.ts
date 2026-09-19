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
    const bundle = compileConstructionBrain(project, {
      targetDurationSeconds: 180,
      initialReferenceUri: 'memory://cabana/initial',
      finalReferenceUri: 'memory://cabana/final',
    });

    expect(bundle.project.master.aspectRatio).toBe('16:9');
    expect(bundle.project.master.targetDurationSeconds).toBe(180);
    expect(bundle.project.providers.KLING.maxGenerationSeconds).toBe(15);
    expect(bundle.project.providers.VEO_FAST.maxGenerationSeconds).toBe(8);

    expect(bundle.constructionMap.components.length).toBeGreaterThan(0);
    expect(bundle.constructionMap.orderedComponentIds.length)
      .toBe(bundle.constructionMap.components.length);
    expect(bundle.worldState.initial).toBe(project.worldState);
    expect(bundle.scenes.scenes.length).toBe(project.scenes.length);

    for (const [index, scene] of bundle.scenes.scenes.entries()) {
      expect(scene.generationSegments.length).toBeGreaterThan(0);
      expect(
        scene.generationSegments.every(segment =>
          segment.durationSeconds <= segment.maxProviderSeconds
        ),
      ).toBe(true);
      expect(
        scene.generationSegments[scene.generationSegments.length - 1]
          .targetStagePercentage,
      ).toBe(100);

      expect(scene.keyframes.entry.kind).toBe('ENTRY');
      expect(scene.keyframes.exit.kind).toBe('EXIT');
      expect(scene.keyframes.entry.sceneId).toBe(scene.id);
      expect(scene.keyframes.exit.sceneId).toBe(scene.id);
      expect(scene.keyframes.entry.approvalChecklist.length).toBeGreaterThan(0);
      expect(scene.keyframes.exit.approvalChecklist.length).toBeGreaterThan(0);

      const entryRoles = scene.keyframes.entry.referencePlan.map(reference => reference.role);
      expect(entryRoles).toContain('INITIAL');
      expect(entryRoles).toContain('FINAL');

      if (index === 0) {
        expect(entryRoles).not.toContain('PREVIOUS_ACCEPTED');
      } else {
        expect(entryRoles).toContain('PREVIOUS_ACCEPTED');
        expect(
          scene.keyframes.entry.referencePlan.find(
            reference => reference.role === 'PREVIOUS_ACCEPTED',
          )?.sourceSceneId,
        ).toBe(bundle.scenes.scenes[index - 1].id);
      }

      expect(
        scene.keyframes.exit.expectedState.constructionProgress,
      ).toBeGreaterThanOrEqual(
        scene.keyframes.entry.expectedState.constructionProgress,
      );

      for (const completedAtEntry of scene.keyframes.entry.expectedState.existingComponents) {
        expect(
          scene.keyframes.exit.continuityLocks.preserveExistingComponents,
        ).toContain(completedAtEntry);
      }
    }

    const serialized = serializeConstructionBrain(bundle);
    expect(Object.keys(serialized).sort()).toEqual([
      'construction_map.json',
      'project.json',
      'scenes.json',
      'world_state.json',
    ]);

    const scenesArtifact = JSON.parse(serialized['scenes.json']) as {
      scenes: Array<{ keyframes?: unknown }>;
    };
    expect(scenesArtifact.scenes.every(scene => !!scene.keyframes)).toBe(true);

    const validation = validateConstructionBrain(bundle);
    expect(validation.issues.filter(issue => issue.severity === 'ERROR')).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('compiles a two-segment scene as 50% then 100% with stage-specific prompts', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project, { targetDurationSeconds: 240 });
    const first = bundle.scenes.scenes[0];

    expect(first.generationSegments).toHaveLength(2);
    expect(first.generationSegments.map(segment => [
      segment.startStagePercentage,
      segment.targetStagePercentage,
    ])).toEqual([[0, 50], [50, 100]]);
    expect(first.generationSegments[0].startState.constructionProgress).toBe(0);
    expect(first.generationSegments[0].executionEvidence.join(' ')).toContain('25%');
    expect(first.generationSegments[0].executionEvidence.join(' ')).toContain('50%');
    expect(first.generationSegments[1].executionEvidence.join(' ')).toContain('75%');
    expect(first.generationSegments[1].executionEvidence.join(' ')).toContain('100%');
  });

  it('keeps current-operation results out of EXIT forbidden elements', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project, { targetDurationSeconds: 240 });
    const door = bundle.scenes.scenes.find(scene => scene.id === 'scene_op_porta');

    expect(door).toBeTruthy();
    expect(door!.keyframes.entry.continuityLocks.forbiddenFutureElements)
      .toContain('porta_principal');
    expect(door!.keyframes.exit.continuityLocks.forbiddenFutureElements)
      .not.toContain('porta_principal');
    expect(
      door!.generationSegments[door!.generationSegments.length - 1]
        .forbiddenFutureElements,
    ).not.toContain('porta_principal');
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

  it('detects cross-scene disappearance instead of accepting visual magic', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project);

    expect(bundle.scenes.scenes.length).toBeGreaterThan(1);

    const previous = bundle.scenes.scenes[0].keyframes.exit.expectedState;
    const current = bundle.scenes.scenes[1].keyframes.entry.expectedState;
    const componentToRemove = previous.existingComponents[0];

    expect(componentToRemove).toBeTruthy();
    current.existingComponents = current.existingComponents.filter(
      component => component !== componentToRemove,
    );

    const validation = validateConstructionBrain(bundle);
    expect(validation.valid).toBe(false);
    expect(
      validation.issues.some(
        issue => issue.code === 'CROSS_SCENE_COMPONENT_DISAPPEARANCE',
      ),
    ).toBe(true);
  });

  it('carries initial, final and previous accepted references without binding to one provider', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project, {
      initialReferenceUri: 'file://initial.png',
      finalReferenceUri: 'file://final.png',
    });

    const first = bundle.scenes.scenes[0];
    const second = bundle.scenes.scenes[1];

    expect(
      first.keyframes.entry.referencePlan.find(reference => reference.role === 'INITIAL')?.uri,
    ).toBe('file://initial.png');
    expect(
      first.keyframes.entry.referencePlan.find(reference => reference.role === 'FINAL')?.uri,
    ).toBe('file://final.png');

    expect(
      second.keyframes.entry.referencePlan.find(
        reference => reference.role === 'PREVIOUS_ACCEPTED',
      )?.sourceSceneId,
    ).toBe(first.id);

    expect(second.keyframes.entry.referencePlan).toHaveLength(3);
  });
});
