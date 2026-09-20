import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createBridgeExecutor,
  safeRequestSummary,
  validateToken,
} from './core.mjs';

class MemoryAudit {
  constructor() {
    this.entries = [];
  }

  async write(entry) {
    this.entries.push(entry);
  }
}

async function withProject(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-local-bridge-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, '.firefly'), { recursive: true });
    await writeFile(path.join(root, 'src', 'example.txt'), 'hello world\n', 'utf8');
    await writeFile(path.join(root, '.env'), 'SECRET=do-not-read\n', 'utf8');
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function createFireflyFixture(root, { firstStatus = 'RETRY_REQUIRED' } = {}) {
  const workspaceName = 'fixture_workspace';
  const workspace = path.join(root, '.firefly', workspaceName);
  const firstDir = path.join(workspace, 'jobs', '001__job_one');
  const secondDir = path.join(workspace, 'jobs', '002__job_two');

  await mkdir(path.join(firstDir, 'review', 'attempt-006'), { recursive: true });
  await mkdir(secondDir, { recursive: true });
  await mkdir(path.join(workspace, 'inputs', 'keyframes'), { recursive: true });
  await mkdir(path.join(workspace, 'outputs'), { recursive: true });

  await writeJson(path.join(workspace, 'queue.json'), {
    projectId: 'fixture-project',
    totalJobs: 2,
    jobs: [
      {
        sequence: 1,
        jobId: 'firefly:scene-1:segment-1',
        sceneId: 'scene-1',
        model: 'KLING',
        startStagePercentage: 0,
        targetStagePercentage: 50,
        durationSeconds: 15,
        jobDirectory: 'jobs/001__job_one',
        sourcePath: 'inputs/keyframes/entry.png',
        videoOutput: 'outputs/scene-1-segment-1.mp4',
        lastFrameOutput: 'outputs/scene-1-segment-1.last-frame.png',
      },
      {
        sequence: 2,
        jobId: 'firefly:scene-1:segment-2',
        sceneId: 'scene-1',
        model: 'KLING',
        startStagePercentage: 50,
        targetStagePercentage: 100,
        durationSeconds: 15,
        jobDirectory: 'jobs/002__job_two',
        sourcePath: 'outputs/scene-1-segment-1.last-frame.png',
        videoOutput: 'outputs/scene-1-segment-2.mp4',
        lastFrameOutput: 'outputs/scene-1-segment-2.last-frame.png',
      },
    ],
  });

  await writeJson(path.join(firstDir, 'job.json'), {
    id: 'firefly:scene-1:segment-1',
    sceneId: 'scene-1',
    startStagePercentage: 0,
    targetStagePercentage: 50,
    model: 'KLING',
    prompt: 'Build half of the visible base.',
  });
  await writeJson(path.join(firstDir, 'state.json'), {
    jobId: 'firefly:scene-1:segment-1',
    status: firstStatus,
    attempts: 6,
    lastReview: firstStatus === 'REVIEW_REQUIRED'
      ? {
          verdict: 'REOBSERVE',
          contactSheet: 'jobs/001__job_one/review/attempt-006/contact-sheet.png',
        }
      : { verdict: 'RETRY', observedStagePercentage: 88 },
  });
  await writeJson(path.join(firstDir, 'source.json'), {
    kind: 'KEYFRAME',
    resolvedPath: 'inputs/keyframes/entry.png',
  });
  await writeFile(path.join(firstDir, 'prompt.txt'), 'Build half of the visible base.\n', 'utf8');
  await writeFile(path.join(firstDir, 'retry-prompt.txt'), 'Retry and stop visibly at 50%.\n', 'utf8');
  await writeFile(path.join(firstDir, 'checklist.txt'), '- [ ] Stop around 50%.\n', 'utf8');
  await writeFile(path.join(firstDir, 'negative.txt'), 'no future elements\n', 'utf8');
  await writeFile(path.join(firstDir, 'review', 'attempt-006', 'contact-sheet.png'), 'fake-image', 'utf8');

  await writeJson(path.join(secondDir, 'job.json'), {
    id: 'firefly:scene-1:segment-2',
    sceneId: 'scene-1',
    startStagePercentage: 50,
    targetStagePercentage: 100,
    model: 'KLING',
    prompt: 'Finish the visible base.',
  });
  await writeJson(path.join(secondDir, 'state.json'), {
    jobId: 'firefly:scene-1:segment-2',
    status: 'PENDING',
    attempts: 0,
  });
  await writeJson(path.join(secondDir, 'source.json'), {
    kind: 'PREVIOUS_JOB_LAST_FRAME',
    resolvedPath: 'outputs/scene-1-segment-1.last-frame.png',
  });
  await writeFile(path.join(secondDir, 'prompt.txt'), 'Finish the visible base.\n', 'utf8');
  await writeFile(path.join(secondDir, 'checklist.txt'), '- [ ] Finish base.\n', 'utf8');
  await writeFile(path.join(secondDir, 'negative.txt'), 'no future elements\n', 'utf8');

  await writeFile(path.join(workspace, 'inputs', 'keyframes', 'entry.png'), 'fake-source', 'utf8');

  return { workspaceName };
}

test('validateToken accepts only strong URL-safe tokens', () => {
  assert.equal(validateToken('a'.repeat(24)), true);
  assert.equal(validateToken('abc'), false);
  assert.equal(validateToken('a'.repeat(23) + '!'), false);
});

test('safeRequestSummary never includes secrets or file contents', () => {
  const summary = safeRequestSummary({
    id: '1',
    op: 'write_file',
    path: 'src/example.txt',
    content: 'TOP-SECRET-CONTENT',
    token: 'TOP-SECRET-TOKEN',
    search: 'secret search',
    replace: 'secret replacement',
  });

  assert.equal(summary.id, '1');
  assert.equal(summary.op, 'write_file');
  assert.equal(summary.path, 'src/example.txt');
  assert.equal(summary.contentBytes, Buffer.byteLength('TOP-SECRET-CONTENT'));
  assert.equal(summary.searchLength, 'secret search'.length);
  assert.equal(summary.replaceLength, 'secret replacement'.length);
  assert.equal('content' in summary, false);
  assert.equal('token' in summary, false);
  assert.equal('search' in summary, false);
  assert.equal('replace' in summary, false);
});

test('read-only executor blocks secrets, arbitrary operations and writes', async () => {
  await withProject(async (root) => {
    const audit = new MemoryAudit();
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit,
    });

    const read = await executor.execute({ id: 'r1', op: 'read_file', path: 'src/example.txt' });
    assert.equal(read.ok, true);
    assert.equal(read.result.content, 'hello world\n');

    const secret = await executor.execute({ id: 'r2', op: 'read_file', path: '.env' });
    assert.equal(secret.ok, false);
    assert.match(secret.error, /blocked/i);

    const shell = await executor.execute({ id: 'r3', op: 'shell', command: 'rm -rf /' });
    assert.equal(shell.ok, false);
    assert.match(shell.error, /Unsupported operation/);

    const write = await executor.execute({
      id: 'r4',
      op: 'write_file',
      path: 'src/new.txt',
      content: 'new',
    });
    assert.equal(write.ok, false);
    assert.match(write.error, /read-only/i);

    const firefly = await executor.execute({
      id: 'r5',
      op: 'write_file',
      path: '.firefly/state.json',
      content: '{}',
    });
    assert.equal(firefly.ok, false);

    assert.equal(audit.entries.length, 5);
  });
});

test('write mode requires stale-write protection for existing files', async () => {
  await withProject(async (root) => {
    const audit = new MemoryAudit();
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit,
    });

    const read = await executor.execute({ id: 'w1', op: 'read_file', path: 'src/example.txt' });
    assert.equal(read.ok, true);

    const stale = await executor.execute({
      id: 'w2',
      op: 'write_file',
      path: 'src/example.txt',
      content: 'changed\n',
      expectedSha256: '0'.repeat(64),
    });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /changed since it was read/i);

    const write = await executor.execute({
      id: 'w3',
      op: 'write_file',
      path: 'src/example.txt',
      content: 'changed\n',
      expectedSha256: read.result.sha256,
    });
    assert.equal(write.ok, true);

    assert.equal(await readFile(path.join(root, 'src', 'example.txt'), 'utf8'), 'changed\n');
  });
});

test('supervisor snapshot bundles project state without enabling writes', async () => {
  await withProject(async (root) => {
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit: new MemoryAudit(),
    });

    const snapshot = await executor.execute({
      id: 's1',
      op: 'supervisor_snapshot',
    });

    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.result.policy.writeMode, 'readonly');
    assert.deepEqual(snapshot.result.fireflyWorkspaces, []);
    assert.equal(snapshot.result.selectedWorkspace, null);
    assert.equal(snapshot.result.fireflyStatus, null);

    const unknown = await executor.execute({
      id: 's2',
      op: 'supervisor_snapshot',
      workspace: 'missing-workspace',
    });

    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /Unknown Firefly workspace/i);
  });
});

test('supervisor bundle returns the current Firefly job and latest contact sheet', async () => {
  await withProject(async (root) => {
    const { workspaceName } = await createFireflyFixture(root);
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit: new MemoryAudit(),
    });

    const response = await executor.execute({
      id: 'b1',
      op: 'supervisor_bundle',
      workspace: workspaceName,
    });

    assert.equal(response.ok, true);
    assert.equal(response.result.selectedWorkspace, workspaceName);
    assert.equal(response.result.queueSummary.currentJobId, 'firefly:scene-1:segment-1');
    assert.equal(response.result.queueSummary.retryRequired, 1);
    assert.equal(response.result.nextAction, 'REGENERATE_CURRENT_JOB');
    assert.equal(response.result.currentJob.state.attempts, 6);
    assert.equal(response.result.currentJob.effectivePrompt.trim(), 'Retry and stop visibly at 50%.');
    assert.match(response.result.currentJob.paths.contactSheet, /attempt-006\/contact-sheet\.png$/);
    assert.equal(response.result.blockedDownstreamJobs.length, 1);
    assert.equal(response.result.blockedDownstreamJobs[0].jobId, 'firefly:scene-1:segment-2');
  });
});

test('review bundle returns current-job review context and image payloads', async () => {
  await withProject(async (root) => {
    const { workspaceName } = await createFireflyFixture(root);
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit: new MemoryAudit(),
    });

    const response = await executor.execute({
      id: 'rb1',
      op: 'review_bundle',
      workspace: workspaceName,
      includeImages: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.result.reviewReady, true);
    assert.equal(response.result.reviewTarget.jobId, 'firefly:scene-1:segment-1');
    assert.equal(response.result.reviewTarget.status, 'RETRY_REQUIRED');
    assert.equal(response.result.reviewTarget.attempts, 6);
    assert.equal(response.result.continuityFromJobId, null);
    assert.equal(response.result.contactSheetLayout.bottomRight, 'terminal/end');
    assert.ok(response.result.images.sourceFrame.dataBase64);
    assert.ok(response.result.images.contactSheet.dataBase64);
  });
});

test('record_review_retry requires write mode, exact review evidence and explicit confirmation', async () => {
  await withProject(async (root) => {
    const { workspaceName } = await createFireflyFixture(root, { firstStatus: 'REVIEW_REQUIRED' });
    const contactBytes = await readFile(path.join(
      root,
      '.firefly',
      workspaceName,
      'jobs',
      '001__job_one',
      'review',
      'attempt-006',
      'contact-sheet.png',
    ));
    const contactHash = createHash('sha256').update(contactBytes).digest('hex');

    const readonly = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit: new MemoryAudit(),
    });

    const blocked = await readonly.execute({
      id: 'rr0',
      op: 'record_review_retry',
      workspace: workspaceName,
      jobId: 'firefly:scene-1:segment-1',
      expectedAttempts: 6,
      expectedContactSheetSha256: contactHash,
      observedStagePercentage: 85,
      confirm: 'RETRY_CURRENT_JOB',
    });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /read-only/i);

    const writable = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit: new MemoryAudit(),
    });

    const stale = await writable.execute({
      id: 'rr1',
      op: 'record_review_retry',
      workspace: workspaceName,
      jobId: 'firefly:scene-1:segment-1',
      expectedAttempts: 6,
      expectedContactSheetSha256: '0'.repeat(64),
      observedStagePercentage: 85,
      confirm: 'RETRY_CURRENT_JOB',
    });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /SHA-256 no longer matches/i);

    const response = await writable.execute({
      id: 'rr2',
      op: 'record_review_retry',
      workspace: workspaceName,
      jobId: 'firefly:scene-1:segment-1',
      expectedAttempts: 6,
      expectedContactSheetSha256: contactHash,
      observedStagePercentage: 85,
      confirm: 'RETRY_CURRENT_JOB',
    });

    assert.equal(response.ok, true);
    assert.equal(response.result.verdict, 'RETRY');
    assert.equal(response.result.reviewSource, 'chatgpt-relay');
    assert.equal(response.result.observedStagePercentage, 85);

    const state = JSON.parse(await readFile(path.join(
      root,
      '.firefly',
      workspaceName,
      'jobs',
      '001__job_one',
      'state.json',
    ), 'utf8'));
    assert.equal(state.status, 'RETRY_REQUIRED');
    assert.equal(state.attempts, 6);
    assert.equal(state.lastReview.contract, 'construction-external-review-v1');

    const retryPrompt = await readFile(path.join(
      root,
      '.firefly',
      workspaceName,
      'jobs',
      '001__job_one',
      'retry-prompt.txt',
    ), 'utf8');
    assert.match(retryPrompt, /Stop clearly at 50% completion/);

    const replay = await writable.execute({
      id: 'rr3',
      op: 'record_review_retry',
      workspace: workspaceName,
      jobId: 'firefly:scene-1:segment-1',
      expectedAttempts: 6,
      expectedContactSheetSha256: contactHash,
      observedStagePercentage: 85,
      confirm: 'RETRY_CURRENT_JOB',
    });
    assert.equal(replay.ok, false);
    assert.match(replay.error, /requires REVIEW_REQUIRED state/i);
  });
});

test('git push remains separately disabled even in write mode', async () => {
  await withProject(async (root) => {
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit: new MemoryAudit(),
    });

    const response = await executor.execute({
      id: 'p1',
      op: 'run_action',
      action: 'git_push',
    });

    assert.equal(response.ok, false);
    assert.match(response.error, /git push is disabled/i);
  });
});
