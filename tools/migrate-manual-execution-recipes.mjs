#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MANUAL_EXECUTION_RECIPE_SCHEMA,
  buildManualExecutionRecipe,
  compileManualKlingPrompt,
} from './manual-video-execution.mjs';

const WORKSPACE_RE = /^[A-Za-z0-9._-]{1,128}$/;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('Invalid argument: ' + key);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('Missing value for ' + key);
    }
    out[key.slice(2)] = value;
    index += 1;
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

async function atomicWriteJson(filePath, value) {
  await atomicWrite(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function backupFile(source, destination) {
  if (!(await exists(source))) return false;
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

function retryPromptFor(basePrompt, state) {
  const failures = Array.isArray(state?.lastReview?.failures)
    ? state.lastReview.failures
    : [];
  if (!failures.length) return basePrompt;

  const corrections = failures
    .map((failure, index) => {
      const correction = String(failure?.correction || '').trim();
      return correction ? String(index + 1) + '. ' + correction : null;
    })
    .filter(Boolean);

  if (!corrections.length) return basePrompt;
  return [
    basePrompt.trimEnd(),
    '',
    'CORRECTIVE RETRY REQUIREMENTS:',
    ...corrections,
    'The retry must preserve source-frame continuity, execute the physical recipe visibly, and leave the required terminal evidence on screen.',
    '',
  ].join('\n');
}

export async function migrateWorkspaceExecutionRecipes({
  projectRoot,
  workspace,
  migratedAt = new Date(),
}) {
  if (!projectRoot) throw new Error('projectRoot is required.');
  if (!WORKSPACE_RE.test(String(workspace || ''))) throw new Error('Invalid workspace.');

  const root = path.resolve(projectRoot);
  const workspaceRoot = path.join(root, '.firefly', workspace);
  const manifestPath = path.join(workspaceRoot, 'manifest.json');
  const queuePath = path.join(workspaceRoot, 'queue.json');
  const [manifest, queue] = await Promise.all([
    readJson(manifestPath),
    readJson(queuePath),
  ]);

  const jobRows = [];
  for (const queued of Array.isArray(queue.jobs) ? queue.jobs : []) {
    const jobRoot = path.join(workspaceRoot, queued.jobDirectory);
    const statePath = path.join(jobRoot, 'state.json');
    const jobPath = path.join(jobRoot, 'job.json');
    const [state, job] = await Promise.all([
      readJson(statePath),
      readJson(jobPath),
    ]);
    jobRows.push({ queued, jobRoot, statePath, jobPath, state, job });
  }

  const reviewing = jobRows.filter(row => row.state?.status === 'REVIEW_REQUIRED');
  if (reviewing.length) {
    throw new Error(
      'Execution-recipe migration refuses REVIEW_REQUIRED state. Finish the current visual review first.',
    );
  }

  const stamp = migratedAt.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(
    workspaceRoot,
    '.migration-backups',
    'manual-execution-recipes-' + stamp,
  );
  await mkdir(backupRoot, { recursive: true });
  await backupFile(manifestPath, path.join(backupRoot, 'manifest.json'));

  let updatedJobs = 0;
  let skippedCompleteJobs = 0;
  const updated = [];

  for (const row of jobRows) {
    if (row.state?.status === 'COMPLETE') {
      skippedCompleteJobs += 1;
      continue;
    }

    const relativeJobRoot = path.relative(workspaceRoot, row.jobRoot);
    await backupFile(
      row.jobPath,
      path.join(backupRoot, relativeJobRoot, 'job.json'),
    );
    await backupFile(
      path.join(row.jobRoot, 'prompt.txt'),
      path.join(backupRoot, relativeJobRoot, 'prompt.txt'),
    );
    await backupFile(
      path.join(row.jobRoot, 'retry-prompt.txt'),
      path.join(backupRoot, relativeJobRoot, 'retry-prompt.txt'),
    );

    const recipe = buildManualExecutionRecipe({
      operationType: row.job.operationType,
      operationName: row.job.operationName,
      physicalAction: row.job.physicalAction,
      startStagePercentage: row.job.startStagePercentage,
      targetStagePercentage: row.job.targetStagePercentage,
    });
    const compiled = compileManualKlingPrompt({
      operationName: row.job.operationName,
      physicalAction: row.job.physicalAction,
      executionRecipe: recipe,
      startStagePercentage: row.job.startStagePercentage,
      targetStagePercentage: row.job.targetStagePercentage,
      durationSeconds: row.job.durationSeconds ?? 15,
      aspectRatio: row.job.aspectRatio ?? '16:9',
      model: row.job.model ?? 'KLING_3_0',
      environment: row.job.continuityLocks?.preserveEnvironment ?? null,
      completedOperations: row.job.continuityLocks?.preserveCompletedOperations ?? [],
      forbiddenFutureElements: row.job.continuityLocks?.forbiddenFutureElements ?? [],
    });

    const nextJob = {
      ...row.job,
      executionRecipe: recipe,
      prompt: compiled.prompt,
    };
    await atomicWriteJson(row.jobPath, nextJob);
    await atomicWrite(path.join(row.jobRoot, 'prompt.txt'), compiled.prompt + '\n');

    if (row.state?.status === 'RETRY_REQUIRED') {
      await atomicWrite(
        path.join(row.jobRoot, 'retry-prompt.txt'),
        retryPromptFor(compiled.prompt, row.state),
      );
    }

    updatedJobs += 1;
    updated.push({
      jobId: row.job.id,
      status: row.state?.status ?? null,
      operationType: row.job.operationType ?? null,
      recipeSchema: recipe.schema,
      tools: recipe.tools,
      promptCharacters: compiled.characterCount,
    });
  }

  const nextManifest = {
    ...manifest,
    executionPolicy: {
      schema: MANUAL_EXECUTION_RECIPE_SCHEMA,
      requireExplicitTools: true,
      requireActorAction: true,
      requireVisibleTransformation: true,
      requireTerminalEvidence: true,
      rejectPantomimeWithoutPhysicalChange: true,
    },
  };
  await atomicWriteJson(manifestPath, nextManifest);

  return {
    ok: true,
    workspace,
    recipeSchema: MANUAL_EXECUTION_RECIPE_SCHEMA,
    updatedJobs,
    skippedCompleteJobs,
    backupPath: path.relative(root, backupRoot).split(path.sep).join('/'),
    updated,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await migrateWorkspaceExecutionRecipes({
    projectRoot: args['project-root'],
    workspace: args.workspace,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main().catch(error => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
