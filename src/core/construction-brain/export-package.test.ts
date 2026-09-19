import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import {
  buildConstructionBrainExportPackage,
  buildFireflyPlanJson,
} from './index';

describe('Construction Brain export package', () => {
  it('exports all canonical artifacts plus firefly_plan.json', () => {
    const project = createCabanaDoRiachoProject();
    const exported = buildConstructionBrainExportPackage(project, {
      targetDurationSeconds: 180,
      initialReferenceUri: 'file://initial.png',
      finalReferenceUri: 'file://final.png',
    });

    expect(Object.keys(exported.files).sort()).toEqual([
      'construction_map.json',
      'firefly_plan.json',
      'project.json',
      'scenes.json',
      'world_state.json',
    ]);

    expect(exported.projectId).toBe(project.id);
    expect(exported.summary.sceneCount).toBe(project.scenes.length);
    expect(exported.summary.fireflyJobCount).toBeGreaterThan(0);
    expect(
      exported.summary.klingJobCount + exported.summary.veoFastJobCount,
    ).toBe(exported.summary.fireflyJobCount);
    expect(exported.summary.targetDurationSeconds).toBe(180);

    const firefly = JSON.parse(exported.files['firefly_plan.json']) as {
      projectId: string;
      jobs: Array<{
        model: string;
        durationSeconds: number;
        targetStagePercentage: number;
        source: { kind: string };
        continuityLocks: { forbiddenFutureElements: string[] };
      }>;
    };

    expect(firefly.projectId).toBe(project.id);
    expect(firefly.jobs.length).toBe(exported.summary.fireflyJobCount);
    expect(
      firefly.jobs.every(job =>
        job.model === 'KLING'
          ? job.durationSeconds <= 15
          : job.model === 'VEO_FAST' && job.durationSeconds <= 8
      ),
    ).toBe(true);
    expect(firefly.jobs).toHaveLength(project.scenes.length * 2);
    for (let index = 0; index < firefly.jobs.length; index += 2) {
      expect(firefly.jobs[index].targetStagePercentage).toBe(50);
      expect(firefly.jobs[index + 1].targetStagePercentage).toBe(100);
    }
  });

  it('buildFireflyPlanJson returns the exact exported plan file', () => {
    const project = createCabanaDoRiachoProject();

    const packageResult = buildConstructionBrainExportPackage(project);
    const direct = buildFireflyPlanJson(project);

    expect(direct).toBe(packageResult.files['firefly_plan.json']);
  });

  it('defaults the production export to a four minute 50-to-100 plan', () => {
    const project = createCabanaDoRiachoProject();
    const exported = buildConstructionBrainExportPackage(project);
    const firefly = JSON.parse(exported.files['firefly_plan.json']) as {
      jobs: Array<{
        sceneId: string;
        targetStagePercentage: number;
        durationSeconds: number;
        continuityLocks: { forbiddenFutureElements: string[] };
      }>;
    };

    expect(exported.summary.targetDurationSeconds).toBe(240);
    expect(exported.summary.fireflyJobCount).toBe(project.scenes.length * 2);
    expect(
      firefly.jobs.reduce((sum, job) => sum + job.durationSeconds, 0),
    ).toBe(240);

    const doorJobs = firefly.jobs.filter(job => job.sceneId === 'scene_op_porta');
    expect(doorJobs).toHaveLength(2);
    expect(doorJobs.map(job => job.targetStagePercentage)).toEqual([50, 100]);
    expect(
      doorJobs[1].continuityLocks.forbiddenFutureElements,
    ).not.toContain('porta_principal');
  });

  it('blocks export when the Construction Brain state is invalid', () => {
    const project = createCabanaDoRiachoProject();

    const firstScene = project.scenes[0];
    firstScene.duration = -1;

    expect(() => buildConstructionBrainExportPackage(project))
      .toThrow(/Construction Brain export blocked/);
  });
});
