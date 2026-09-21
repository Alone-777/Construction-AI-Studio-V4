import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrateManualWorkspaceToPhysicalV2 } from './migrate-manual-workspace-to-physical-v2.mjs';

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function createWorkspace({ reviewRequired = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-ai-v2-migration-'));
  const workspace = 'cabana_v2_test';
  const ws = path.join(root, '.firefly', workspace);
  const job1Dir = path.join(ws, 'jobs', '001__preparacao_0_25');
  const job2Dir = path.join(ws, 'jobs', '002__preparacao_25_50');
  await mkdir(job1Dir, { recursive: true });
  await mkdir(job2Dir, { recursive: true });

  await writeJson(path.join(ws, 'manifest.json'), {
    schemaVersion: 'construction-ai-manual-video/1.2',
    projectId: workspace,
    projectName: 'Cabana V2 Test',
    description: 'Cabana rústica de madeira em uma floresta',
    videoPolicy: {
      platform: 'ADOBE_FIREFLY',
      modelId: 'KLING_3_0',
      promptMaxChars: 1800,
      durationSeconds: 15,
    },
    executionPolicy: {
      schema: 'construction-manual-execution-recipe/1',
    },
  });
  await writeJson(path.join(ws, 'queue.json'), {
    projectId: workspace,
    totalJobs: 2,
    jobs: [
      {
        sequence: 1,
        jobId: 'firefly:' + workspace + ':preparacao:0-25',
        jobDirectory: 'jobs/001__preparacao_0_25',
        startStagePercentage: 0,
        targetStagePercentage: 25,
      },
      {
        sequence: 2,
        jobId: 'firefly:' + workspace + ':preparacao:25-50',
        jobDirectory: 'jobs/002__preparacao_25_50',
        startStagePercentage: 25,
        targetStagePercentage: 50,
      },
    ],
  });

  const baseJob = {
    projectId: workspace,
    projectName: 'Cabana V2 Test',
    sceneId: 'scene:preparacao',
    operationType: 'preparacao',
    operationName: 'Preparação seletiva do local',
    physicalAction: 'delimitar a implantação e remover obstáculos',
    platform: 'ADOBE_FIREFLY',
    model: 'KLING_3_0',
    durationSeconds: 15,
    executionRecipe: {
      schema: 'construction-manual-execution-recipe/1',
      operationType: 'preparacao',
      tools: ['shovel'],
      actorAction: 'Worker uses shovel.',
      actionSequence: ['Push shovel into soil.', 'Scrape vegetation.'],
      visibleTransformation: 'Exposed soil grows.',
      terminalEvidence: 'Visible partial clearing.',
    },
  };

  await writeJson(path.join(job1Dir, 'job.json'), {
    ...baseJob,
    id: 'firefly:' + workspace + ':preparacao:0-25',
    startStagePercentage: 0,
    targetStagePercentage: 25,
    prompt: 'legacy prompt',
  });
  await writeFile(path.join(job1Dir, 'prompt.txt'), 'legacy prompt\n', 'utf8');
  await writeFile(path.join(job1Dir, 'retry-prompt.txt'), 'legacy retry\n', 'utf8');
  await writeJson(path.join(job1Dir, 'state.json'), {
    jobId: 'firefly:' + workspace + ':preparacao:0-25',
    status: reviewRequired ? 'REVIEW_REQUIRED' : 'RETRY_REQUIRED',
    attempts: 5,
    lastReview: reviewRequired ? null : {
      verdict: 'RETRY',
      failures: [
        {
          code: 'TOOL_ACTION_NOT_EXECUTED',
          correction: 'Show repeated shovel-to-ground contact and visible scraping.',
        },
        {
          code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
          correction: 'Each shovel stroke must enlarge one contiguous cleared patch.',
        },
      ],
      retryPrompt: 'legacy retry',
    },
  });

  await writeJson(path.join(job2Dir, 'job.json'), {
    ...baseJob,
    id: 'firefly:' + workspace + ':preparacao:25-50',
    startStagePercentage: 25,
    targetStagePercentage: 50,
    prompt: 'legacy prompt 2',
  });
  await writeFile(path.join(job2Dir, 'prompt.txt'), 'legacy prompt 2\n', 'utf8');
  await writeJson(path.join(job2Dir, 'state.json'), {
    jobId: 'firefly:' + workspace + ':preparacao:25-50',
    status: 'PENDING',
    attempts: 0,
    lastReview: null,
  });

  return { root, workspace, ws, job1Dir, job2Dir };
}

describe('migrateManualWorkspaceToPhysicalV2', () => {
  it('upgrades unfinished Jobs to native V2 while preserving retry identity and attempts', async () => {
    const fixture = await createWorkspace();
    const result = await migrateManualWorkspaceToPhysicalV2({
      projectRoot: fixture.root,
      workspace: fixture.workspace,
      migratedAt: new Date('2026-09-21T23:40:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.promptSource).toBe('PHYSICAL_EXECUTION_V2');
    expect(result.currentJob).toEqual({
      jobId: 'firefly:' + fixture.workspace + ':preparacao:0-25',
      status: 'RETRY_REQUIRED',
      attempts: 5,
    });
    expect(result.canonicalWorldAdvanced).toBe(false);

    const manifest = JSON.parse(await readFile(path.join(fixture.ws, 'manifest.json'), 'utf8'));
    const job1 = JSON.parse(await readFile(path.join(fixture.job1Dir, 'job.json'), 'utf8'));
    const state1 = JSON.parse(await readFile(path.join(fixture.job1Dir, 'state.json'), 'utf8'));
    const retryPrompt = await readFile(path.join(fixture.job1Dir, 'retry-prompt.txt'), 'utf8');
    const job2 = JSON.parse(await readFile(path.join(fixture.job2Dir, 'job.json'), 'utf8'));

    expect(manifest.schemaVersion).toBe('construction-ai-manual-video/1.3');
    expect(manifest.executionPolicy.primarySchema).toBe('construction-physical-execution-plan/2');
    expect(job1.promptSource).toBe('PHYSICAL_EXECUTION_V2');
    expect(job1.physicalExecutionV2.plan.schemaVersion).toBe('construction-physical-execution-plan/2');
    expect(job1.physicalExecutionV2.simulation.validation.ok).toBe(true);
    expect(job1.physicalExecutionV2.simulation.commitAvailable).toBe(false);
    expect(job1.executionRecipe.tools).toContain('shovel');
    expect(job1.prompt).toContain('[ADOBE FIREFLY VIDEO JOB]');
    expect(job1.prompt).toContain('shovel');
    expect(job1.prompt).toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(job1.prompt).toContain('INSUFFICIENT_PHYSICAL_PROGRESS');
    expect(Array.from(job1.prompt).length).toBeLessThanOrEqual(1800);
    expect(state1.status).toBe('RETRY_REQUIRED');
    expect(state1.attempts).toBe(5);
    expect(state1.lastReview.failures).toHaveLength(2);
    expect(state1.lastReview.retryPrompt).toBe(job1.prompt);
    expect(retryPrompt.trim()).toBe(job1.prompt);
    expect(job2.promptSource).toBe('PHYSICAL_EXECUTION_V2');

    const backupRel = result.backupPath.replace(
      '.firefly/' + fixture.workspace + '/',
      '',
    );
    expect((await stat(path.join(fixture.ws, backupRel, 'manifest.json'))).isFile()).toBe(true);
    expect((await stat(path.join(
      fixture.ws,
      backupRel,
      'jobs/001__preparacao_0_25/job.json',
    ))).isFile()).toBe(true);
  }, 30000);

  it('refuses migration while a Job is REVIEW_REQUIRED', async () => {
    const fixture = await createWorkspace({ reviewRequired: true });
    await expect(migrateManualWorkspaceToPhysicalV2({
      projectRoot: fixture.root,
      workspace: fixture.workspace,
    })).rejects.toThrow(/REVIEW_REQUIRED/);
  });
});
