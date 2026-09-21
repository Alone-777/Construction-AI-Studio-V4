import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrateWorkspaceToKling25 } from './migrate-video-provider-to-kling25.mjs';

describe('migrateWorkspaceToKling25', () => {
  it('backs up and migrates an existing Firefly workspace to Kling 2.5 5s without changing job ids or review state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'construction-ai-kling-migration-'));
    const workspace = 'cabana_20260921003631';
    const ws = path.join(root, '.firefly', workspace);
    const jobDir = path.join(ws, 'jobs', '001__legacy');
    await mkdir(jobDir, { recursive: true });

    await writeFile(path.join(ws, 'manifest.json'), JSON.stringify({
      schemaVersion: 'construction-ai-firefly-manual/1.0',
      videoPolicy: { provider: 'ADOBE_FIREFLY_MANUAL', durationSeconds: 8, oneActiveJobAtATime: true },
    }, null, 2));

    await writeFile(path.join(ws, 'queue.json'), JSON.stringify({
      projectId: workspace,
      durationSecondsPerJob: 8,
      jobs: [{
        sequence: 1,
        jobId: 'firefly:' + workspace + ':preparacao:0-25',
        model: 'FIREFLY',
        durationSeconds: 8,
        jobDirectory: 'jobs/001__legacy',
      }],
    }, null, 2));

    await writeFile(path.join(jobDir, 'job.json'), JSON.stringify({
      id: 'firefly:' + workspace + ':preparacao:0-25',
      model: 'FIREFLY',
      durationSeconds: 8,
      prompt: '[OFFICIAL FIREFLY VIDEO JOB] Create exactly 8 seconds of realistic 16:9 image-to-video construction timelapse. During this 8-second clip, stop at 25%.',
      acceptanceChecklist: ['The clip duration is exactly 8 seconds.'],
    }, null, 2));
    await writeFile(path.join(jobDir, 'prompt.txt'), '[OFFICIAL FIREFLY VIDEO JOB] Create exactly 8 seconds of realistic 16:9 image-to-video construction timelapse.\n');
    await writeFile(path.join(jobDir, 'checklist.txt'), '- [ ] The clip duration is exactly 8 seconds.\n');
    await writeFile(path.join(jobDir, 'state.json'), JSON.stringify({
      jobId: 'firefly:' + workspace + ':preparacao:0-25',
      status: 'RETRY_REQUIRED',
      attempts: 2,
      lastReview: {
        verdict: 'RETRY',
        retryPrompt: '[OFFICIAL FIREFLY VIDEO JOB] Create exactly 8 seconds of realistic 16:9 image-to-video construction timelapse.',
      },
    }, null, 2));

    const result = await migrateWorkspaceToKling25({
      projectRoot: root,
      workspace,
      migratedAt: new Date('2026-09-21T01:30:00.000Z'),
    });

    expect(result.durationSecondsPerJob).toBe(5);
    expect(result.stableJobIdsPreserved).toBe(true);

    const manifest = JSON.parse(await readFile(path.join(ws, 'manifest.json'), 'utf8'));
    const queue = JSON.parse(await readFile(path.join(ws, 'queue.json'), 'utf8'));
    const job = JSON.parse(await readFile(path.join(jobDir, 'job.json'), 'utf8'));
    const state = JSON.parse(await readFile(path.join(jobDir, 'state.json'), 'utf8'));

    expect(manifest.videoPolicy.provider).toBe('KLING_2_5_MANUAL');
    expect(manifest.videoPolicy.durationSeconds).toBe(5);
    expect(queue.durationSecondsPerJob).toBe(5);
    expect(queue.jobs[0].jobId).toBe('firefly:' + workspace + ':preparacao:0-25');
    expect(queue.jobs[0].model).toBe('KLING_2_5');
    expect(job.id).toBe('firefly:' + workspace + ':preparacao:0-25');
    expect(job.model).toBe('KLING_2_5');
    expect(job.durationSeconds).toBe(5);
    expect(job.prompt).toContain('KLING 2.5');
    expect(job.prompt).toContain('5 seconds');
    expect(state.status).toBe('RETRY_REQUIRED');
    expect(state.attempts).toBe(2);
    expect(state.lastReview.retryPrompt).toContain('KLING 2.5');
    expect(state.lastReview.retryPrompt).toContain('5 seconds');

    const backupManifest = path.join(ws, result.backupPath.replace('.firefly/' + workspace + '/', ''), 'manifest.json');
    expect((await stat(backupManifest)).isFile()).toBe(true);
  });
});
