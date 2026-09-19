#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  effectivePromptForFireflyJob,
  ingestAndReviewFireflyJob,
  reviewFireflyJob,
} from './firefly-review.mjs';

const EXPECTED_SCHEMA_VERSION = '0.1.3';
const ALLOWED_STAGE_PERCENTAGES = new Set([25, 50, 75, 100]);

const MODEL_LIMITS = Object.freeze({
  KLING: 15,
  VEO_FAST: 8,
});

function sanitize(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Firefly plan must be a JSON object.');
  }
  if (plan.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Firefly plan schema '${plan.schemaVersion ?? 'missing'}' is not supported; expected '${EXPECTED_SCHEMA_VERSION}'. Export a new plan from the current Studio.`,
    );
  }
  if (typeof plan.projectId !== 'string' || !plan.projectId.trim()) {
    throw new Error('Firefly plan requires a non-empty projectId.');
  }
  if (!Array.isArray(plan.jobs) || plan.jobs.length === 0) {
    throw new Error('Firefly plan requires at least one job.');
  }

  const ids = new Set();
  for (const job of plan.jobs) {
    if (!job || typeof job !== 'object') throw new Error('Every Firefly job must be an object.');
    if (typeof job.id !== 'string' || !job.id.trim()) throw new Error('Every Firefly job requires an id.');
    if (ids.has(job.id)) throw new Error(`Duplicate Firefly job id '${job.id}'.`);
    ids.add(job.id);

    if (![0, 25, 50, 75].includes(job.startStagePercentage)) {
      throw new Error(
        `Job '${job.id}' requires startStagePercentage 0, 25, 50 or 75.`,
      );
    }
    if (!ALLOWED_STAGE_PERCENTAGES.has(job.targetStagePercentage)) {
      throw new Error(
        `Job '${job.id}' requires targetStagePercentage 25, 50, 75 or 100.`,
      );
    }
    if (job.targetStagePercentage <= job.startStagePercentage) {
      throw new Error(
        `Job '${job.id}' targetStagePercentage must be greater than startStagePercentage.`,
      );
    }
    if (!(job.model in MODEL_LIMITS)) {
      throw new Error(`Unknown Firefly model '${job.model}' in job '${job.id}'.`);
    }
    if (!Number.isFinite(job.durationSeconds) || job.durationSeconds <= 0 ||
        job.durationSeconds > MODEL_LIMITS[job.model]) {
      throw new Error(
        `Job '${job.id}' duration ${job.durationSeconds} exceeds ${job.model} limit ${MODEL_LIMITS[job.model]}s.`,
      );
    }
    if (job.aspectRatio !== '16:9') {
      throw new Error(`Job '${job.id}' must use 16:9 aspect ratio.`);
    }
    if (!job.resolution || job.resolution.width !== 1920 || job.resolution.height !== 1080) {
      throw new Error(`Job '${job.id}' must use 1920x1080 resolution.`);
    }
    if (typeof job.prompt !== 'string' || !job.prompt.trim()) {
      throw new Error(`Job '${job.id}' requires a non-empty prompt.`);
    }
    if (!job.source || !['KEYFRAME', 'PREVIOUS_JOB_LAST_FRAME'].includes(job.source.kind)) {
      throw new Error(`Job '${job.id}' has an invalid source.`);
    }
  }

  for (const job of plan.jobs) {
    if (job.source.kind === 'PREVIOUS_JOB_LAST_FRAME' &&
        !ids.has(job.source.previousJobId)) {
      throw new Error(
        `Job '${job.id}' references missing previous job '${job.source.previousJobId}'.`,
      );
    }
  }

  const byScene = new Map();
  for (const job of plan.jobs) {
    const list = byScene.get(job.sceneId) ?? [];
    list.push(job);
    byScene.set(job.sceneId, list);
  }

  for (let index = 1; index < plan.jobs.length; index += 1) {
    const current = plan.jobs[index];
    const previous = plan.jobs[index - 1];
    if (current.source.kind !== 'PREVIOUS_JOB_LAST_FRAME' ||
        current.source.previousJobId !== previous.id) {
      throw new Error(
        `Job '${current.id}' must use the terminal frame from '${previous.id}'.`,
      );
    }
  }
  for (const [sceneId, jobs] of byScene) {
    jobs.sort((a, b) => a.segmentIndex - b.segmentIndex);
    for (let index = 1; index < jobs.length; index += 1) {
      if (jobs[index].startStagePercentage !== jobs[index - 1].targetStagePercentage ||
          jobs[index].targetStagePercentage <= jobs[index - 1].targetStagePercentage) {
        throw new Error(
          `Scene '${sceneId}' has a broken stage chain between '${jobs[index - 1].id}' and '${jobs[index].id}'.`,
        );
      }
    }
    if (jobs[jobs.length - 1].targetStagePercentage !== 100) {
      throw new Error(`Scene '${sceneId}' must finish at targetStagePercentage 100.`);
    }
  }
}

function resolveJobSource(job, plan, workspace) {
  if (job.source.kind === 'KEYFRAME') {
    return path.join(
      workspace,
      'inputs',
      'keyframes',
      `${sanitize(job.source.keyframeId)}.png`,
    );
  }

  const previous = plan.jobs.find(candidate => candidate.id === job.source.previousJobId);
  if (!previous) {
    throw new Error(
      `Previous job '${job.source.previousJobId}' was not found for '${job.id}'.`,
    );
  }
  return path.join(workspace, previous.output.lastFrameSlot);
}

function jobDirectoryName(index, jobId) {
  return `${String(index + 1).padStart(3, '0')}__${sanitize(jobId)}`;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function loadFireflyPlan(planPath) {
  const resolved = path.resolve(planPath);
  const raw = await readFile(resolved, 'utf8');
  const plan = JSON.parse(raw);
  assertPlan(plan);
  return plan;
}

export async function prepareFireflyWorkspace(plan, workspaceRoot = '.firefly') {
  assertPlan(plan);

  const root = path.resolve(workspaceRoot);
  const workspace = path.join(root, sanitize(plan.projectId));
  const jobsRoot = path.join(workspace, 'jobs');
  const keyframesRoot = path.join(workspace, 'inputs', 'keyframes');

  await mkdir(jobsRoot, { recursive: true });
  await mkdir(keyframesRoot, { recursive: true });
  await mkdir(path.join(workspace, 'outputs'), { recursive: true });

  await writeJson(path.join(workspace, 'manifest.json'), plan);

  const queue = [];

  for (const [index, job] of plan.jobs.entries()) {
    const jobDir = path.join(jobsRoot, jobDirectoryName(index, job.id));
    const sourcePath = resolveJobSource(job, plan, workspace);
    const videoOutput = path.join(workspace, job.output.videoSlot);
    const lastFrameOutput = path.join(workspace, job.output.lastFrameSlot);

    await mkdir(jobDir, { recursive: true });
    await mkdir(path.dirname(videoOutput), { recursive: true });
    await mkdir(path.dirname(lastFrameOutput), { recursive: true });

    const sourceDescriptor = {
      ...job.source,
      resolvedPath: path.relative(workspace, sourcePath),
      absolutePath: sourcePath,
    };

    const statePath = path.join(jobDir, 'state.json');
    if (!(await exists(statePath))) {
      await writeJson(statePath, {
        jobId: job.id,
        status: 'PENDING',
        completedAt: null,
        notes: [],
      });
    }

    await writeJson(path.join(jobDir, 'job.json'), job);
    await writeFile(path.join(jobDir, 'prompt.txt'), `${job.prompt.trim()}\n`, 'utf8');
    await writeFile(
      path.join(jobDir, 'negative.txt'),
      `${(job.negativeConstraints ?? []).join('\n')}\n`,
      'utf8',
    );
    await writeFile(
      path.join(jobDir, 'checklist.txt'),
      `${(job.acceptanceChecklist ?? []).map(item => `- [ ] ${item}`).join('\n')}\n`,
      'utf8',
    );
    await writeJson(path.join(jobDir, 'source.json'), sourceDescriptor);

    queue.push({
      sequence: index + 1,
      jobId: job.id,
      sceneId: job.sceneId,
      model: job.model,
      startStagePercentage: job.startStagePercentage,
      targetStagePercentage: job.targetStagePercentage,
      durationSeconds: job.durationSeconds,
      jobDirectory: path.relative(workspace, jobDir),
      sourcePath: path.relative(workspace, sourcePath),
      videoOutput: path.relative(workspace, videoOutput),
      lastFrameOutput: path.relative(workspace, lastFrameOutput),
    });
  }

  await writeJson(path.join(workspace, 'queue.json'), {
    projectId: plan.projectId,
    totalJobs: queue.length,
    jobs: queue,
  });

  await writeFile(
    path.join(keyframesRoot, 'README.txt'),
    [
      'Place approved ENTRY keyframes in this directory.',
      'The exact filename expected by each job is recorded in jobs/*/source.json.',
      'Do not replace a keyframe after downstream jobs have been accepted without invalidating those jobs.',
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    workspace,
    queue,
  };
}

async function readJobState(workspace, queueItem) {
  const statePath = path.join(workspace, queueItem.jobDirectory, 'state.json');
  const raw = await readFile(statePath, 'utf8');
  return JSON.parse(raw);
}

export async function inspectFireflyWorkspace(workspacePath) {
  const workspace = path.resolve(workspacePath);
  const queue = JSON.parse(await readFile(path.join(workspace, 'queue.json'), 'utf8'));
  const rows = [];

  for (const item of queue.jobs) {
    const state = await readJobState(workspace, item);
    const sourceReady = await exists(path.join(workspace, item.sourcePath));
    const videoReady = await exists(path.join(workspace, item.videoOutput));
    const lastFrameReady = await exists(path.join(workspace, item.lastFrameOutput));

    rows.push({
      ...item,
      status: state.status,
      sourceReady,
      videoReady,
      lastFrameReady,
      runnable: ['PENDING', 'RETRY_REQUIRED'].includes(state.status) && sourceReady,
    });
  }

  return {
    projectId: queue.projectId,
    workspace,
    totalJobs: rows.length,
    pending: rows.filter(row => row.status !== 'COMPLETE').length,
    completed: rows.filter(row => row.status === 'COMPLETE').length,
    reviewRequired: rows.filter(row => row.status === 'REVIEW_REQUIRED').length,
    retryRequired: rows.filter(row => row.status === 'RETRY_REQUIRED').length,
    runnable: rows.filter(row => row.runnable).length,
    jobs: rows,
  };
}

export async function completeFireflyJob(workspacePath, jobId) {
  const inspection = await inspectFireflyWorkspace(workspacePath);
  const item = inspection.jobs.find(job => job.jobId === jobId);
  if (!item) throw new Error(`Unknown Firefly job '${jobId}'.`);
  if (!item.videoReady) {
    throw new Error(`Cannot complete '${jobId}': video output is missing at ${item.videoOutput}.`);
  }
  if (!item.lastFrameReady) {
    throw new Error(
      `Cannot complete '${jobId}': terminal frame is missing at ${item.lastFrameOutput}.`,
    );
  }

  const statePath = path.join(inspection.workspace, item.jobDirectory, 'state.json');
  await writeJson(statePath, {
    jobId,
    status: 'COMPLETE',
    completedAt: new Date().toISOString(),
    notes: [],
  });

  return inspectFireflyWorkspace(inspection.workspace);
}

function printStatus(inspection) {
  process.stdout.write(
    [
      `Project: ${inspection.projectId}`,
      `Workspace: ${inspection.workspace}`,
      `Jobs: ${inspection.totalJobs}`,
      `Pending: ${inspection.pending}`,
      `Runnable now: ${inspection.runnable}`,
      `Complete: ${inspection.completed}`,
      `Review required: ${inspection.reviewRequired}`,
      `Retry required: ${inspection.retryRequired}`,
      '',
      ...inspection.jobs.map(job => {
        const readiness = job.status === 'COMPLETE'
          ? 'COMPLETE'
          : job.status === 'RETRY_REQUIRED'
            ? 'RETRY'
            : job.status === 'REVIEW_REQUIRED'
              ? 'REVIEW'
              : job.runnable ? 'READY' : job.status;
        return `${String(job.sequence).padStart(3, '0')}  ${readiness.padEnd(8)}  ${job.model.padEnd(8)}  ${String(job.startStagePercentage).padStart(3, ' ')}->${String(job.targetStagePercentage).padStart(3, ' ')}%  ${job.durationSeconds}s  ${job.jobId}`;
      }),
      '',
    ].join('\n'),
  );
}

function usage() {
  return [
    'Construction AI Studio - Firefly Local Runner',
    '',
    'Commands:',
    '  prepare <firefly_plan.json> [workspace-root]',
    '  status <project-workspace>',
    '  complete <project-workspace> <job-id>  # manual compatibility path',
    '  review <project-workspace> <job-id> [provider-id]',
    '  ingest <project-workspace> <job-id> <video-path> [provider-id]',
    '  prompt <project-workspace> <job-id>'
    '',
    'Examples:',
    '  npm run firefly:prepare -- ./firefly_plan.json',
    '  npm run firefly:status -- ./.firefly/my-project',
    '  npm run firefly:complete -- ./.firefly/my-project firefly:scene-1:segment-1',
    '  npm run firefly:review -- ./.firefly/my-project firefly:scene-1:segment-1 gemini',
    '  npm run firefly:ingest -- ./.firefly/my-project firefly:scene-1:segment-1 ./download.mp4 gemini',
    '  npm run firefly:prompt -- ./.firefly/my-project firefly:scene-1:segment-1'
    '',
  ].join('\n');
}

async function main(argv) {
  const [command, ...args] = argv;

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }

  if (command === 'prepare') {
    const [planPath, workspaceRoot = '.firefly'] = args;
    if (!planPath) throw new Error('prepare requires <firefly_plan.json>.');
    const plan = await loadFireflyPlan(planPath);
    const prepared = await prepareFireflyWorkspace(plan, workspaceRoot);
    const inspection = await inspectFireflyWorkspace(prepared.workspace);
    printStatus(inspection);
    return;
  }

  if (command === 'status') {
    const [workspace] = args;
    if (!workspace) throw new Error('status requires <project-workspace>.');
    printStatus(await inspectFireflyWorkspace(workspace));
    return;
  }


  if (command === 'review') {
    const [workspace, jobId, providerId] = args;
    if (!workspace || !jobId) {
      throw new Error('review requires <project-workspace> <job-id> [provider-id].');
    }
    const result = await reviewFireflyJob(workspace, jobId, providerId);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    printStatus(await inspectFireflyWorkspace(workspace));
    return;
  }

  if (command === 'ingest') {
    const [workspace, jobId, videoPath, providerId] = args;
    if (!workspace || !jobId || !videoPath) {
      throw new Error('ingest requires <project-workspace> <job-id> <video-path> [provider-id].');
    }
    const result = await ingestAndReviewFireflyJob(workspace, jobId, videoPath, providerId);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    printStatus(await inspectFireflyWorkspace(workspace));
    return;
  }

  if (command === 'prompt') {
    const [workspace, jobId] = args;
    if (!workspace || !jobId) {
      throw new Error('prompt requires <project-workspace> <job-id>.');
    }
    process.stdout.write(await effectivePromptForFireflyJob(workspace, jobId));
    return;
  }

  if (command === 'complete') {
    const [workspace, jobId] = args;
    if (!workspace || !jobId) {
      throw new Error('complete requires <project-workspace> <job-id>.');
    }
    printStatus(await completeFireflyJob(workspace, jobId));
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
