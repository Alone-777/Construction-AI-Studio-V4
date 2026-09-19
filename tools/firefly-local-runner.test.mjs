import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  completeFireflyJob,
  inspectFireflyWorkspace,
  prepareFireflyWorkspace,
} from './firefly-local-runner.mjs';

function fixturePlan() {
  return {
    schemaVersion: '0.1.1',
    projectId: 'runner-test-project',
    jobs: [
      {
        id: 'firefly:scene-1:segment-1',
        projectId: 'runner-test-project',
        sceneId: 'scene-1',
        sceneNumber: 1,
        segmentId: 'scene-1:segment:1',
        segmentIndex: 1,
        targetStagePercentage: 50,
        model: 'KLING',
        durationSeconds: 15,
        aspectRatio: '16:9',
        resolution: { width: 1920, height: 1080 },
        source: { kind: 'KEYFRAME', keyframeId: 'scene-1:keyframe:entry' },
        terminalRequirement: 'INTERMEDIATE_CONTINUATION',
        entryKeyframeId: 'scene-1:keyframe:entry',
        exitKeyframeId: 'scene-1:keyframe:exit',
        prompt: 'Worker visibly installs the first structural frame.',
        negativeConstraints: ['no teleportation'],
        continuityLocks: {
          preserveWorkerIdentity: 'builder_01',
          preserveExistingComponents: [],
          preservePermanentObjects: ['terrain'],
          preserveZones: ['Z1'],
          preserveTerrain: true,
          forbiddenFutureElements: ['roof'],
        },
        acceptanceChecklist: ['Worker identity is preserved.'],
        output: {
          videoSlot: 'outputs/scene-1/segment-1.mp4',
          lastFrameSlot: 'outputs/scene-1/segment-1.last-frame.png',
        },
        status: 'READY',
      },
      {
        id: 'firefly:scene-1:segment-2',
        projectId: 'runner-test-project',
        sceneId: 'scene-1',
        sceneNumber: 1,
        segmentId: 'scene-1:segment:2',
        segmentIndex: 2,
        targetStagePercentage: 100,
        model: 'VEO_FAST',
        durationSeconds: 8,
        aspectRatio: '16:9',
        resolution: { width: 1920, height: 1080 },
        source: {
          kind: 'PREVIOUS_SEGMENT_LAST_FRAME',
          previousJobId: 'firefly:scene-1:segment-1',
        },
        terminalRequirement: 'SCENE_EXIT',
        entryKeyframeId: 'scene-1:keyframe:entry',
        exitKeyframeId: 'scene-1:keyframe:exit',
        prompt: 'Continue from the previous terminal frame and finish the structural frame.',
        negativeConstraints: ['no teleportation'],
        continuityLocks: {
          preserveWorkerIdentity: 'builder_01',
          preserveExistingComponents: [],
          preservePermanentObjects: ['terrain'],
          preserveZones: ['Z1'],
          preserveTerrain: true,
          forbiddenFutureElements: ['roof'],
        },
        acceptanceChecklist: ['Final visible result matches the expected exit state.'],
        output: {
          videoSlot: 'outputs/scene-1/segment-2.mp4',
          lastFrameSlot: 'outputs/scene-1/segment-2.last-frame.png',
        },
        status: 'READY',
      },
    ],
  };
}

describe('Firefly local runner', () => {
  it('materializes jobs, prompts, checklists and deterministic source paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'firefly-runner-'));
    const prepared = await prepareFireflyWorkspace(fixturePlan(), root);

    expect(prepared.queue).toHaveLength(2);

    const firstDir = path.join(prepared.workspace, prepared.queue[0].jobDirectory);
    const secondDir = path.join(prepared.workspace, prepared.queue[1].jobDirectory);

    expect((await readFile(path.join(firstDir, 'prompt.txt'), 'utf8')).trim())
      .toContain('installs the first structural frame');
    expect((await readFile(path.join(firstDir, 'checklist.txt'), 'utf8')))
      .toContain('- [ ] Worker identity is preserved.');

    const firstSource = JSON.parse(
      await readFile(path.join(firstDir, 'source.json'), 'utf8'),
    );
    const secondSource = JSON.parse(
      await readFile(path.join(secondDir, 'source.json'), 'utf8'),
    );

    expect(firstSource.resolvedPath)
      .toBe('inputs/keyframes/scene-1_keyframe_entry.png');
    expect(secondSource.resolvedPath)
      .toBe('outputs/scene-1/segment-1.last-frame.png');

    const inspection = await inspectFireflyWorkspace(prepared.workspace);
    expect(inspection.totalJobs).toBe(2);
    expect(inspection.runnable).toBe(0);

    await mkdir(path.dirname(path.join(prepared.workspace, firstSource.resolvedPath)), {
      recursive: true,
    });
    await writeFile(path.join(prepared.workspace, firstSource.resolvedPath), 'fake-image');

    const ready = await inspectFireflyWorkspace(prepared.workspace);
    expect(ready.runnable).toBe(1);
    expect(ready.jobs[0].runnable).toBe(true);
    expect(ready.jobs[1].runnable).toBe(false);
  });

  it('only completes a job after both video and terminal frame exist', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'firefly-runner-'));
    const prepared = await prepareFireflyWorkspace(fixturePlan(), root);
    const first = prepared.queue[0];

    await expect(
      completeFireflyJob(prepared.workspace, first.jobId),
    ).rejects.toThrow(/video output is missing/);

    const videoPath = path.join(prepared.workspace, first.videoOutput);
    const framePath = path.join(prepared.workspace, first.lastFrameOutput);
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, 'fake-video');
    await writeFile(framePath, 'fake-frame');

    const completed = await completeFireflyJob(prepared.workspace, first.jobId);

    expect(completed.completed).toBe(1);
    expect(completed.jobs[0].status).toBe('COMPLETE');
    expect(completed.jobs[1].runnable).toBe(true);
  });

  it('rejects stale pre-stage-aware plans', async () => {
    const plan = fixturePlan();
    plan.schemaVersion = '0.1.0';

    const root = await mkdtemp(path.join(os.tmpdir(), 'firefly-runner-'));

    await expect(
      prepareFireflyWorkspace(plan, root),
    ).rejects.toThrow(/expected '0.1.1'/);
  });

  it('rejects non-increasing target stages', async () => {
    const plan = fixturePlan();
    plan.jobs[1].targetStagePercentage = 50;

    const root = await mkdtemp(path.join(os.tmpdir(), 'firefly-runner-'));

    await expect(
      prepareFireflyWorkspace(plan, root),
    ).rejects.toThrow(/non-increasing target stages/);
  });

  it('rejects provider durations beyond the configured Firefly limits', async () => {
    const plan = fixturePlan();
    plan.jobs[1].durationSeconds = 9;

    const root = await mkdtemp(path.join(os.tmpdir(), 'firefly-runner-'));

    await expect(
      prepareFireflyWorkspace(plan, root),
    ).rejects.toThrow(/exceeds VEO_FAST limit 8s/);
  });
});
