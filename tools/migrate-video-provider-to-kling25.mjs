#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_RE = /^[A-Za-z0-9._-]{1,128}$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('Argumento inválido: ' + key);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error('Valor ausente para ' + key);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function transformPrompt(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('[OFFICIAL FIREFLY VIDEO JOB]', '[OFFICIAL KLING 2.5 VIDEO JOB]')
    .replaceAll('Create exactly 8 seconds of realistic 16:9 image-to-video construction timelapse.', 'Create exactly 5 seconds of realistic 16:9 image-to-video construction timelapse with Kling 2.5.')
    .replaceAll('During this 8-second clip,', 'During this 5-second clip,')
    .replaceAll('The clip duration is exactly 8 seconds.', 'The clip duration is exactly 5 seconds.');
}

async function backupFile(workspaceRoot, backupRoot, relativePath) {
  const src = path.join(workspaceRoot, relativePath);
  if (!(await exists(src))) return false;
  const dst = path.join(backupRoot, relativePath);
  await mkdir(path.dirname(dst), { recursive: true });
  await copyFile(src, dst);
  return true;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function migrateWorkspaceToKling25({
  projectRoot,
  workspace,
  migratedAt = new Date(),
}) {
  if (!projectRoot) throw new Error('projectRoot é obrigatório.');
  if (!WORKSPACE_RE.test(String(workspace || ''))) throw new Error('workspace inválido.');

  const root = path.resolve(projectRoot);
  const workspaceRoot = path.resolve(root, '.firefly', workspace);
  const relativeCheck = path.relative(path.join(root, '.firefly'), workspaceRoot);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    throw new Error('workspace escapa da raiz .firefly.');
  }

  const manifestPath = path.join(workspaceRoot, 'manifest.json');
  const queuePath = path.join(workspaceRoot, 'queue.json');
  if (!(await exists(manifestPath)) || !(await exists(queuePath))) {
    throw new Error('Workspace incompleto: manifest.json/queue.json ausente.');
  }

  const stamp = migratedAt.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(workspaceRoot, '.migration-backups', `kling-2.5-${stamp}`);
  await mkdir(backupRoot, { recursive: true });

  const manifest = await readJson(manifestPath);
  const queue = await readJson(queuePath);
  await backupFile(workspaceRoot, backupRoot, 'manifest.json');
  await backupFile(workspaceRoot, backupRoot, 'queue.json');

  const migratedJobs = [];
  for (const queueJob of queue.jobs || []) {
    const jobDirectory = String(queueJob.jobDirectory || '');
    if (!jobDirectory) throw new Error('JOB sem jobDirectory.');

    for (const file of ['job.json', 'prompt.txt', 'checklist.txt', 'state.json']) {
      await backupFile(workspaceRoot, backupRoot, path.posix.join(jobDirectory, file));
    }

    const jobPath = path.join(workspaceRoot, jobDirectory, 'job.json');
    const job = await readJson(jobPath);
    job.model = 'KLING_2_5';
    job.durationSeconds = 5;
    job.prompt = transformPrompt(job.prompt);
    if (Array.isArray(job.acceptanceChecklist)) {
      job.acceptanceChecklist = job.acceptanceChecklist.map(transformPrompt);
    }
    await writeJson(jobPath, job);

    const promptPath = path.join(workspaceRoot, jobDirectory, 'prompt.txt');
    if (await exists(promptPath)) {
      await writeFile(promptPath, transformPrompt(await readFile(promptPath, 'utf8')), 'utf8');
    }

    const checklistPath = path.join(workspaceRoot, jobDirectory, 'checklist.txt');
    if (await exists(checklistPath)) {
      await writeFile(checklistPath, transformPrompt(await readFile(checklistPath, 'utf8')), 'utf8');
    }

    const statePath = path.join(workspaceRoot, jobDirectory, 'state.json');
    if (await exists(statePath)) {
      const state = await readJson(statePath);
      if (state.lastReview?.retryPrompt) {
        state.lastReview.retryPrompt = transformPrompt(state.lastReview.retryPrompt);
      }
      await writeJson(statePath, state);
    }

    queueJob.model = 'KLING_2_5';
    queueJob.durationSeconds = 5;
    migratedJobs.push({
      sequence: queueJob.sequence,
      jobId: queueJob.jobId,
      statusPreserved: true,
    });
  }

  manifest.schemaVersion = 'construction-ai-manual-video/1.1';
  manifest.videoPolicy = {
    ...(manifest.videoPolicy || {}),
    provider: 'KLING_2_5_MANUAL',
    model: 'Kling 2.5',
    durationSeconds: 5,
    oneActiveJobAtATime: true,
  };
  manifest.migrations = [
    ...(Array.isArray(manifest.migrations) ? manifest.migrations : []),
    {
      id: 'manual-video-kling-2.5-5s',
      migratedAt: migratedAt.toISOString(),
      stableJobIdsPreserved: true,
    },
  ];

  queue.durationSecondsPerJob = 5;
  await writeJson(manifestPath, manifest);
  await writeJson(queuePath, queue);

  return {
    ok: true,
    workspace,
    provider: 'KLING_2_5_MANUAL',
    model: 'KLING_2_5',
    durationSecondsPerJob: 5,
    totalJobs: migratedJobs.length,
    totalDurationSeconds: migratedJobs.length * 5,
    backupPath: path.relative(root, backupRoot).split(path.sep).join('/'),
    stableJobIdsPreserved: true,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await migrateWorkspaceToKling25({
    projectRoot: args['project-root'],
    workspace: args.workspace,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
