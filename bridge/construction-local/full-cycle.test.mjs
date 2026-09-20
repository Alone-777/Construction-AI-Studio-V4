import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { createBridgeExecutor } from './core.mjs';

const execFileAsync = promisify(execFile);

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

test('manual candidate -> external review -> PASS completes job without Firefly automation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-review-cycle-'));
  const workspaceName = 'cycle_workspace';
  const workspace = path.join(root, '.firefly', workspaceName);
  const jobDir = path.join(workspace, 'jobs', '001__cycle_job');
  const incoming = path.join(workspace, 'incoming');
  const outputs = path.join(workspace, 'outputs');

  try {
    await mkdir(jobDir, { recursive: true });
    await mkdir(incoming, { recursive: true });
    await mkdir(outputs, { recursive: true });

    await writeJson(path.join(workspace, 'queue.json'), {
      projectId: 'cycle-project',
      totalJobs: 1,
      jobs: [{
        sequence: 1,
        jobId: 'firefly:cycle:segment:1',
        sceneId: 'cycle',
        model: 'KLING',
        startStagePercentage: 0,
        targetStagePercentage: 50,
        durationSeconds: 1,
        jobDirectory: 'jobs/001__cycle_job',
        sourcePath: 'source.png',
        videoOutput: 'outputs/cycle.mp4',
        lastFrameOutput: 'outputs/cycle.last-frame.png',
      }],
    });

    await writeJson(path.join(jobDir, 'job.json'), {
      id: 'firefly:cycle:segment:1',
      sceneId: 'scene_op_base',
      startStagePercentage: 0,
      targetStagePercentage: 50,
      model: 'KLING',
      durationSeconds: 1,
      prompt: 'Build only half of the floor.',
      acceptanceChecklist: ['Stop at half completion.'],
      continuityLocks: {
        forbiddenFutureElements: ['wall'],
      },
    });
    await writeJson(path.join(jobDir, 'state.json'), {
      jobId: 'firefly:cycle:segment:1',
      status: 'RETRY_REQUIRED',
      attempts: 6,
      completedAt: null,
      notes: [],
      pendingLearning: {
        operationType: 'piso',
        provider: 'KLING',
        failures: [{
          code: 'PROGRESS_OVERSHOOT',
          correction: 'Stop clearly at 50% completion.',
        }],
      },
    });
    await writeJson(path.join(jobDir, 'source.json'), {
      kind: 'KEYFRAME',
      resolvedPath: 'source.png',
    });
    await writeFile(path.join(jobDir, 'prompt.txt'), 'Build only half of the floor.\n', 'utf8');
    await writeFile(path.join(jobDir, 'retry-prompt.txt'), 'Build only half of the floor. Stop at 50%.\n', 'utf8');
    await writeFile(path.join(jobDir, 'checklist.txt'), '- [ ] Stop at half completion.\n', 'utf8');
    await writeFile(path.join(jobDir, 'negative.txt'), 'no wall\n', 'utf8');
    await writeFile(path.join(workspace, 'source.png'), 'placeholder', 'utf8');

    const candidateFile = 'job-001-attempt-007.mp4';
    const candidatePath = path.join(incoming, candidateFile);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=320x180:rate=10',
      '-t', '1',
      '-pix_fmt', 'yuv420p',
      candidatePath,
    ]);

    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit: { write: async () => {} },
    });

    const ingest = await executor.execute({
      id: 'cycle-ingest',
      op: 'ingest_review_candidate',
      workspace: workspaceName,
      jobId: 'firefly:cycle:segment:1',
      candidateFile,
      expectedCurrentAttempts: 6,
      confirm: 'INGEST_CURRENT_JOB',
    });

    assert.equal(ingest.ok, true);
    assert.equal(ingest.result.verdict, 'PENDING_EXTERNAL_REVIEW');
    assert.equal(ingest.result.reviewedAttempt, 7);
    assert.match(ingest.result.contactSheetSha256, /^[a-f0-9]{64}$/);

    let state = JSON.parse(await readFile(path.join(jobDir, 'state.json'), 'utf8'));
    assert.equal(state.status, 'REVIEW_REQUIRED');
    assert.equal(state.attempts, 7);

    const pass = await executor.execute({
      id: 'cycle-pass',
      op: 'record_review_pass',
      workspace: workspaceName,
      jobId: 'firefly:cycle:segment:1',
      expectedAttempts: 7,
      expectedContactSheetSha256: ingest.result.contactSheetSha256,
      observedStagePercentage: 50,
      continuity: {
        worker: 'MATCH',
        environment: 'MATCH',
        geometry: 'MATCH',
        source: 'MATCH',
      },
      futureElementsAbsent: true,
      requiredEvidenceSatisfied: true,
      terminalFrameValid: true,
      confirm: 'PASS_CURRENT_JOB',
    });

    assert.equal(pass.ok, true);
    assert.equal(pass.result.verdict, 'PASS');

    state = JSON.parse(await readFile(path.join(jobDir, 'state.json'), 'utf8'));
    assert.equal(state.status, 'COMPLETE');
    assert.equal(state.attempts, 7);
    assert.equal(state.pendingLearning, null);

    const lastFrame = await stat(path.join(outputs, 'cycle.last-frame.png'));
    assert.equal(lastFrame.isFile(), true);

    const memory = JSON.parse(await readFile(path.join(workspace, 'learning-memory.json'), 'utf8'));
    assert.equal(memory.records[0].successfulRetry, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
