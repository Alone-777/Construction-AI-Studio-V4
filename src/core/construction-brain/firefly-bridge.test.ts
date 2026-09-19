import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import {
  buildFireflyExecutionPlan,
  compileConstructionBrain,
  serializeFireflyExecutionPlan,
  validateFireflyExecutionPlan,
} from './index';

describe('Construction Brain Firefly bridge', () => {
  it('builds one deterministic Firefly job per canonical generation segment', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project);
    const plan = buildFireflyExecutionPlan(bundle);

    const expectedJobs = bundle.scenes.scenes.reduce(
      (sum, scene) => sum + scene.generationSegments.length,
      0,
    );

    expect(plan.projectId).toBe(bundle.project.projectId);
    expect(plan.jobs).toHaveLength(expectedJobs);
    expect(plan.jobs.every(job => job.status === 'READY')).toBe(true);
    expect(plan.jobs.every(job => job.aspectRatio === '16:9')).toBe(true);
    expect(plan.jobs.every(job => job.resolution.width === 1920)).toBe(true);
    expect(plan.jobs.every(job => job.resolution.height === 1080)).toBe(true);
    expect(plan.jobs.every(job => job.prompt.trim().length > 0)).toBe(true);

    const validation = validateFireflyExecutionPlan(bundle, plan);
    expect(validation.issues.filter(issue => issue.severity === 'ERROR')).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('chains a 23 second scene as Kling 15s then Veo Fast 8s using the previous last frame', () => {
    const project = createCabanaDoRiachoProject();
    project.scenes[0].duration = 23;

    const bundle = compileConstructionBrain(project);
    const firstScene = bundle.scenes.scenes[0];

    expect(firstScene.generationSegments).toHaveLength(2);
    expect(firstScene.generationSegments[0]).toMatchObject({
      provider: 'KLING',
      durationSeconds: 15,
      targetStagePercentage: 50,
    });
    expect(firstScene.generationSegments[1]).toMatchObject({
      provider: 'VEO_FAST',
      durationSeconds: 8,
      targetStagePercentage: 100,
    });

    const plan = buildFireflyExecutionPlan(bundle);
    const jobs = plan.jobs
      .filter(job => job.sceneId === firstScene.id)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    expect(jobs).toHaveLength(2);
    expect(jobs[0].model).toBe('KLING');
    expect(jobs[0].durationSeconds).toBe(15);
    expect(jobs[0].source).toEqual({
      kind: 'KEYFRAME',
      keyframeId: firstScene.keyframes.entry.id,
    });
    expect(jobs[0].terminalRequirement).toBe('INTERMEDIATE_CONTINUATION');
    expect(jobs[0].targetStagePercentage).toBe(50);
    expect(jobs[0].prompt).toContain('marco 50%');

    expect(jobs[1].model).toBe('VEO_FAST');
    expect(jobs[1].durationSeconds).toBe(8);
    expect(jobs[1].source).toEqual({
      kind: 'PREVIOUS_SEGMENT_LAST_FRAME',
      previousJobId: jobs[0].id,
    });
    expect(jobs[1].terminalRequirement).toBe('SCENE_EXIT');
    expect(jobs[1].targetStagePercentage).toBe(100);
    expect(jobs[1].prompt).toContain('canonical 100% stage');
    expect(jobs[1].exitKeyframeId).toBe(firstScene.keyframes.exit.id);
    expect(jobs[1].acceptanceChecklist).toContain(
      'The terminal frame matches the scene EXIT state.',
    );

    const validation = validateFireflyExecutionPlan(bundle, plan);
    expect(validation.valid).toBe(true);
  });

  it('rejects a broken Firefly segment chain', () => {
    const project = createCabanaDoRiachoProject();
    project.scenes[0].duration = 23;

    const bundle = compileConstructionBrain(project);
    const plan = buildFireflyExecutionPlan(bundle);
    const jobs = plan.jobs.filter(job => job.sceneId === bundle.scenes.scenes[0].id);

    expect(jobs).toHaveLength(2);

    const second = jobs[1];
    if (second.source.kind !== 'PREVIOUS_SEGMENT_LAST_FRAME') {
      throw new Error('Expected chained Firefly job.');
    }

    second.source.previousJobId = 'firefly:missing-job';

    const validation = validateFireflyExecutionPlan(bundle, plan);
    expect(validation.valid).toBe(false);
    expect(
      validation.issues.some(issue =>
        issue.code === 'FIREFLY_BROKEN_SEGMENT_CHAIN' ||
        issue.code === 'FIREFLY_UNKNOWN_PREVIOUS_JOB'
      ),
    ).toBe(true);
  });

  it('serializes a portable Firefly execution manifest', () => {
    const project = createCabanaDoRiachoProject();
    const bundle = compileConstructionBrain(project);
    const plan = buildFireflyExecutionPlan(bundle);
    const serialized = serializeFireflyExecutionPlan(plan);

    const parsed = JSON.parse(serialized) as {
      projectId: string;
      jobs: Array<{
        model: string;
        output: { videoSlot: string; lastFrameSlot: string };
      }>;
    };

    expect(parsed.projectId).toBe(bundle.project.projectId);
    expect(parsed.jobs.length).toBeGreaterThan(0);
    expect(parsed.jobs.every(job => ['KLING', 'VEO_FAST'].includes(job.model))).toBe(true);
    expect(parsed.jobs.every(job => job.output.videoSlot.endsWith('.mp4'))).toBe(true);
    expect(parsed.jobs.every(job => job.output.lastFrameSlot.endsWith('.last-frame.png'))).toBe(true);
  });
});
