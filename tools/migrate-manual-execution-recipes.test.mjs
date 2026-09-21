import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrateWorkspaceExecutionRecipes } from './migrate-manual-execution-recipes.mjs';

async function fixture({ reviewRequired = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-ai-execution-migration-'));
  const workspace = 'cabana_test_20260921200000';
  const ws = path.join(root, '.firefly', workspace);
  const job1Dir = path.join(ws, 'jobs', '001__job1');
  const job2Dir = path.join(ws, 'jobs', '002__job2');
  await mkdir(job1Dir, { recursive: true });
  await mkdir(job2Dir, { recursive: true });

  const manifest = {
    projectId: workspace,
    projectName: 'Cabana',
    environment: 'floresta',
  };
  const queue = {
    projectId: workspace,
    jobs: [
      {
        sequence: 1,
        jobId: 'firefly:' + workspace + ':preparacao:0-25',
        jobDirectory: 'jobs/001__job1',
      },
      {
        sequence: 2,
        jobId: 'firefly:' + workspace + ':preparacao:25-50',
        jobDirectory: 'jobs/002__job2',
      },
    ],
  };
  await writeFile(path.join(ws, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(ws, 'queue.json'), JSON.stringify(queue, null, 2));

  const common = {
    projectId: workspace,
    projectName: 'Cabana',
    sceneId: 'scene:preparacao',
    sceneNumber: 1,
    operationType: 'preparacao',
    operationName: 'Preparação seletiva do local',
    physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
    model: 'KLING_3_0',
    durationSeconds: 15,
    aspectRatio: '16:9',
    continuityLocks: {
      preserveEnvironment: 'floresta',
      preserveCompletedOperations: [],
      forbiddenFutureElements: ['Execução das fundações'],
    },
  };

  await writeFile(path.join(job1Dir, 'job.json'), JSON.stringify({
    ...common,
    id: queue.jobs[0].jobId,
    startStagePercentage: 0,
    targetStagePercentage: 25,
    prompt: 'legacy generic prompt 1',
  }, null, 2));
  await writeFile(path.join(job1Dir, 'state.json'), JSON.stringify({
    jobId: queue.jobs[0].jobId,
    status: 'COMPLETE',
    attempts: 1,
    lastReview: { verdict: 'PASS' },
  }, null, 2));
  await writeFile(path.join(job1Dir, 'prompt.txt'), 'legacy generic prompt 1\n');

  await writeFile(path.join(job2Dir, 'job.json'), JSON.stringify({
    ...common,
    id: queue.jobs[1].jobId,
    startStagePercentage: 25,
    targetStagePercentage: 50,
    prompt: 'legacy generic prompt 2',
  }, null, 2));
  await writeFile(path.join(job2Dir, 'state.json'), JSON.stringify({
    jobId: queue.jobs[1].jobId,
    status: reviewRequired ? 'REVIEW_REQUIRED' : 'RETRY_REQUIRED',
    attempts: 2,
    lastReview: reviewRequired ? {
      verdict: 'PENDING_EXTERNAL_REVIEW',
    } : {
      verdict: 'RETRY',
      failures: [{
        code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
        correction: 'Leave a persistent prepared patch.',
      }],
    },
  }, null, 2));
  await writeFile(path.join(job2Dir, 'prompt.txt'), 'legacy generic prompt 2\n');
  await writeFile(path.join(job2Dir, 'retry-prompt.txt'), 'legacy retry prompt\n');

  return { root, workspace, ws, job1Dir, job2Dir };
}

describe('migrateWorkspaceExecutionRecipes', () => {
  it('backs up and upgrades only unfinished Jobs with explicit shovel execution', async () => {
    const f = await fixture();

    const result = await migrateWorkspaceExecutionRecipes({
      projectRoot: f.root,
      workspace: f.workspace,
      migratedAt: new Date('2026-09-21T20:30:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.updatedJobs).toBe(1);
    expect(result.skippedCompleteJobs).toBe(1);
    expect(result.recipeSchema).toBe('construction-manual-execution-recipe/1');

    const completeJob = JSON.parse(await readFile(path.join(f.job1Dir, 'job.json'), 'utf8'));
    expect(completeJob.executionRecipe).toBeUndefined();
    expect(completeJob.prompt).toBe('legacy generic prompt 1');

    const retryJob = JSON.parse(await readFile(path.join(f.job2Dir, 'job.json'), 'utf8'));
    const prompt = await readFile(path.join(f.job2Dir, 'prompt.txt'), 'utf8');
    const retryPrompt = await readFile(path.join(f.job2Dir, 'retry-prompt.txt'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(f.ws, 'manifest.json'), 'utf8'));

    expect(retryJob.executionRecipe.tools).toContain('shovel');
    expect(retryJob.executionRecipe.visibleTransformation).toMatch(/exposed, disturbed brown soil/i);
    expect(retryJob.prompt).toMatch(/using shovel/i);
    expect(retryJob.prompt).toMatch(/shovel blade/i);
    expect(retryJob.prompt).toMatch(/No pantomime/i);
    expect(prompt).toMatch(/using shovel/i);
    expect(retryPrompt).toMatch(/using shovel/i);
    expect(retryPrompt).toMatch(/Leave a persistent prepared patch/i);
    expect(manifest.executionPolicy.requireExplicitTools).toBe(true);
    expect(manifest.executionPolicy.rejectPantomimeWithoutPhysicalChange).toBe(true);

    expect((await stat(path.join(
      f.root,
      result.backupPath,
      'jobs',
      '002__job2',
      'job.json',
    ))).isFile()).toBe(true);
    expect((await stat(path.join(
      f.root,
      result.backupPath,
      'jobs',
      '002__job2',
      'retry-prompt.txt',
    ))).isFile()).toBe(true);
  });

  it('refuses to mutate a workspace while any Job is awaiting external review', async () => {
    const f = await fixture({ reviewRequired: true });

    await expect(migrateWorkspaceExecutionRecipes({
      projectRoot: f.root,
      workspace: f.workspace,
    })).rejects.toThrow(/Finish the current visual review first/);

    const job = JSON.parse(await readFile(path.join(f.job2Dir, 'job.json'), 'utf8'));
    expect(job.executionRecipe).toBeUndefined();
    expect(job.prompt).toBe('legacy generic prompt 2');
  });
});
