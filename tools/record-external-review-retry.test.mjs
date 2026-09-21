import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { recordStructuredRetry } from './record-external-review-retry.mjs';

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-ai-structured-retry-'));
  const workspace = 'cabana_20260921190000';
  const jobId = 'firefly:' + workspace + ':preparacao:0-25';
  const ws = path.join(root, '.firefly', workspace);
  const jobDir = path.join(ws, 'jobs', '001__legacy');
  await mkdir(jobDir, { recursive: true });

  await writeFile(path.join(ws, 'queue.json'), JSON.stringify({
    projectId: workspace,
    jobs: [{
      sequence: 1,
      jobId,
      targetStagePercentage: 25,
      jobDirectory: 'jobs/001__legacy',
    }],
  }, null, 2));

  await writeFile(path.join(jobDir, 'job.json'), JSON.stringify({
    id: jobId,
    operationType: 'preparacao',
    model: 'KLING_3_0',
    durationSeconds: 15,
    targetStagePercentage: 25,
    prompt: '[ANIMATION JOB] 15s KLING_3_0. Advance only 0%→25%.',
  }, null, 2));

  await writeFile(path.join(jobDir, 'state.json'), JSON.stringify({
    jobId,
    status: 'REVIEW_REQUIRED',
    attempts: 3,
    completedAt: null,
    lastReview: {
      contract: 'construction-external-review-pending-v1',
      verdict: 'PENDING_EXTERNAL_REVIEW',
      reviewSource: 'chatgpt-relay',
      jobId,
      reviewedAttempt: 3,
      candidateVideoSha256: '1'.repeat(64),
      contactSheet: 'jobs/001__legacy/review/attempt-003/contact-sheet.png',
      contactSheetSha256: '2'.repeat(64),
    },
    notes: [],
  }, null, 2));

  await writeFile(path.join(jobDir, 'retry-prompt.txt'), 'legacy retry prompt\n');

  return { root, workspace, jobId, jobDir };
}

describe('recordStructuredRetry', () => {
  it('records qualitative visual failures without advancing canonical world state', async () => {
    const fixture = await makeFixture();

    const result = await recordStructuredRetry({
      projectRoot: fixture.root,
      workspace: fixture.workspace,
      jobId: fixture.jobId,
      expectedAttempts: 3,
      expectedContactSheetSha256: '2'.repeat(64),
      observedStagePercentage: 10,
      failures: [
        {
          code: 'MAGICAL_APPEARANCE',
          message: 'Vegetation appears without visible physical cause.',
          correction: 'Do not create vegetation or debris; only remove an already visible obstacle through continuous worker action.',
        },
        {
          code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
          message: 'The terminal state does not establish a clear 25% prepared area.',
          correction: 'Show one localized preparation action that leaves an obvious, persistent 25% partial result.',
        },
      ],
      reviewedAt: new Date('2026-09-21T19:50:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('RETRY_REQUIRED');
    expect(result.attempts).toBe(3);
    expect(result.canonicalWorldAdvanced).toBe(false);

    const state = JSON.parse(await readFile(path.join(fixture.jobDir, 'state.json'), 'utf8'));
    const retryPrompt = await readFile(path.join(fixture.jobDir, 'retry-prompt.txt'), 'utf8');

    expect(state.status).toBe('RETRY_REQUIRED');
    expect(state.attempts).toBe(3);
    expect(state.lastReview.verdict).toBe('RETRY');
    expect(state.lastReview.reviewedAttempt).toBe(3);
    expect(state.lastReview.candidateVideoSha256).toBe('1'.repeat(64));
    expect(state.lastReview.failures.map(item => item.code)).toEqual([
      'MAGICAL_APPEARANCE',
      'INSUFFICIENT_PHYSICAL_PROGRESS',
    ]);
    expect(state.pendingLearning.provider).toBe('KLING_3_0');
    expect(retryPrompt).toContain('Do not create vegetation or debris');
    expect(retryPrompt).toContain('obvious, persistent 25% partial result');

    expect((await stat(path.join(
      fixture.jobDir,
      '.review-backups',
      'attempt-003-20260921195000',
      'state.json',
    ))).isFile()).toBe(true);
    expect((await stat(path.join(
      fixture.jobDir,
      '.review-backups',
      'attempt-003-20260921195000',
      'retry-prompt.txt',
    ))).isFile()).toBe(true);
  });

  it('blocks stale contact-sheet evidence', async () => {
    const fixture = await makeFixture();

    await expect(recordStructuredRetry({
      projectRoot: fixture.root,
      workspace: fixture.workspace,
      jobId: fixture.jobId,
      expectedAttempts: 3,
      expectedContactSheetSha256: '3'.repeat(64),
      observedStagePercentage: 10,
      failures: [{
        code: 'MAGICAL_APPEARANCE',
        message: 'Visual discontinuity.',
        correction: 'Keep physical continuity.',
      }],
    })).rejects.toThrow(/Contact-sheet evidence changed/);

    const state = JSON.parse(await readFile(path.join(fixture.jobDir, 'state.json'), 'utf8'));
    expect(state.status).toBe('REVIEW_REQUIRED');
    expect(state.attempts).toBe(3);
  });

  it('blocks non-pending review state', async () => {
    const fixture = await makeFixture();
    const statePath = path.join(fixture.jobDir, 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.status = 'RETRY_REQUIRED';
    await writeFile(statePath, JSON.stringify(state, null, 2));

    await expect(recordStructuredRetry({
      projectRoot: fixture.root,
      workspace: fixture.workspace,
      jobId: fixture.jobId,
      expectedAttempts: 3,
      expectedContactSheetSha256: '2'.repeat(64),
      observedStagePercentage: 10,
      failures: [{
        code: 'MAGICAL_APPEARANCE',
        message: 'Visual discontinuity.',
        correction: 'Keep physical continuity.',
      }],
    })).rejects.toThrow(/requires REVIEW_REQUIRED/);
  });
});
