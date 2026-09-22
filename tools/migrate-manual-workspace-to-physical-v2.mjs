#!/usr/bin/env node

import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  compileManualVideoProjectV2,
  executionRecipeFromV2Segment,
} from './manual-v2-bridge.mjs';

const WORKSPACE_RE = /^[A-Za-z0-9._-]{1,128}$/;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('Argumento inválido: ' + key);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('Valor ausente para ' + key);
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

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function backupFile(workspaceRoot, backupRoot, relativePath) {
  const source = path.join(workspaceRoot, relativePath);
  if (!(await exists(source))) return false;
  const destination = path.join(backupRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

function canonicalOperationTypeForV2(value) {
  const operationType = String(value || '').trim();
  // Backward compatibility: workspaces created before marking-first used
  // "preparacao" for the clearing operation. Preserve the legacy Job identity
  // while compiling its physical plan from the current "limpeza" operation.
  return operationType === 'preparacao' ? 'limpeza' : operationType;
}

function segmentKey(operationType, start, target) {
  return String(operationType) + ':' + String(start) + '-' + String(target);
}

function retryCorrectionsFromState(state) {
  const failures = Array.isArray(state?.lastReview?.failures)
    ? state.lastReview.failures
    : [];
  const structured = failures
    .map(item => ({
      code: String(item?.code || '').trim(),
      correction: String(item?.correction || '').trim(),
    }))
    .filter(item => item.code && item.correction)
    .slice(0, 10);
  if (structured.length) return structured;

  const legacy = String(state?.lastReview?.retryPrompt || '').trim();
  return legacy
    ? [{
        code: 'LEGACY_RETRY_CONTEXT',
        correction: legacy,
      }]
    : [];
}

function firstRecipeTool(job) {
  const tools = Array.isArray(job?.executionRecipe?.tools)
    ? job.executionRecipe.tools
    : [];
  return String(tools[0] || '').trim() || null;
}

function currentRecord(records) {
  return records.find(record => record.state.status !== 'COMPLETE') || null;
}

export async function migrateManualWorkspaceToPhysicalV2({
  projectRoot,
  workspace,
  migratedAt = new Date(),
} = {}) {
  if (!projectRoot) throw new Error('projectRoot é obrigatório.');
  if (!WORKSPACE_RE.test(String(workspace || ''))) throw new Error('workspace inválido.');

  const root = path.resolve(projectRoot);
  const fireflyRoot = path.resolve(root, '.firefly');
  const workspaceRoot = path.resolve(fireflyRoot, workspace);
  const relative = path.relative(fireflyRoot, workspaceRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('workspace escapa da raiz .firefly.');
  }

  const manifestPath = path.join(workspaceRoot, 'manifest.json');
  const queuePath = path.join(workspaceRoot, 'queue.json');
  if (!(await exists(manifestPath)) || !(await exists(queuePath))) {
    throw new Error('Workspace incompleto: manifest.json/queue.json ausente.');
  }

  const manifest = await readJson(manifestPath);
  const queue = await readJson(queuePath);
  if (!String(manifest.description || '').trim()) {
    throw new Error('Workspace não possui description suficiente para recompilar Physical Execution V2.');
  }

  const records = [];
  for (const queued of queue.jobs || []) {
    const jobDirectory = String(queued.jobDirectory || '');
    if (!jobDirectory) throw new Error('JOB sem jobDirectory.');

    const jobPath = path.join(workspaceRoot, jobDirectory, 'job.json');
    const statePath = path.join(workspaceRoot, jobDirectory, 'state.json');
    if (!(await exists(jobPath)) || !(await exists(statePath))) {
      throw new Error('Workspace incompleto em ' + jobDirectory + '.');
    }

    records.push({
      queued,
      jobDirectory,
      jobPath,
      statePath,
      job: await readJson(jobPath),
      state: await readJson(statePath),
    });
  }

  const reviewRequired = records.find(record => record.state.status === 'REVIEW_REQUIRED');
  if (reviewRequired) {
    throw new Error(
      'Physical Execution V2 migration refuses REVIEW_REQUIRED Job: ' +
      reviewRequired.job.id + '.',
    );
  }

  const beforeCurrent = currentRecord(records);
  const beforeIdentity = beforeCurrent
    ? {
        jobId: beforeCurrent.job.id,
        status: beforeCurrent.state.status,
        attempts: beforeCurrent.state.attempts,
      }
    : null;

  const toolOverrides = {};
  const retryCorrectionsBySegment = {};
  for (const record of records) {
    if (record.state.status === 'COMPLETE') continue;
    const operationType = String(record.job.operationType || '').trim();
    if (!operationType) throw new Error('JOB sem operationType: ' + record.job.id);
    const v2OperationType = canonicalOperationTypeForV2(operationType);

    // Preserve legacy tool choice only for the live RETRY_REQUIRED operation.
    // That tool is part of observed retry evidence/corrections. Future PENDING
    // operations must be re-planned by the native V2 blueprint instead of
    // inheriting recipe ordering such as ['level', 'hammer'] where the first
    // item is an inspection tool, not the causal installation tool.
    if (record.state.status === 'RETRY_REQUIRED') {
      const tool = firstRecipeTool(record.job);
      if (tool) toolOverrides[v2OperationType] = tool;

      retryCorrectionsBySegment[
        segmentKey(
          v2OperationType,
          record.job.startStagePercentage,
          record.job.targetStagePercentage,
        )
      ] = retryCorrectionsFromState(record.state);
    }
  }

  const v2Project = await compileManualVideoProjectV2({
    description: manifest.description,
    name: manifest.projectName,
    toolOverrides,
    retryCorrectionsBySegment,
  });
  const segments = new Map(
    v2Project.segments.map(segment => [
      segmentKey(
        segment.operationType,
        segment.startStagePercentage,
        segment.targetStagePercentage,
      ),
      segment,
    ]),
  );

  for (const record of records) {
    if (record.state.status === 'COMPLETE') continue;
    const key = segmentKey(
      canonicalOperationTypeForV2(record.job.operationType),
      record.job.startStagePercentage,
      record.job.targetStagePercentage,
    );
    if (!segments.has(key)) {
      throw new Error(
        'Physical Execution V2 has no compatible segment for unfinished Job ' +
        record.job.id + ' (' + key + ').',
      );
    }
  }

  const stamp = migratedAt.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(
    workspaceRoot,
    '.migration-backups',
    'physical-execution-v2-' + stamp,
  );
  await mkdir(backupRoot, { recursive: true });
  await backupFile(workspaceRoot, backupRoot, 'manifest.json');
  await backupFile(workspaceRoot, backupRoot, 'queue.json');

  const migratedJobs = [];
  for (const record of records) {
    if (record.state.status === 'COMPLETE') {
      migratedJobs.push({
        jobId: record.job.id,
        status: record.state.status,
        changed: false,
      });
      continue;
    }

    for (const file of [
      'job.json',
      'prompt.txt',
      'retry-prompt.txt',
      'state.json',
      'checklist.txt',
    ]) {
      await backupFile(
        workspaceRoot,
        backupRoot,
        path.posix.join(record.jobDirectory, file),
      );
    }

    const key = segmentKey(
      canonicalOperationTypeForV2(record.job.operationType),
      record.job.startStagePercentage,
      record.job.targetStagePercentage,
    );
    const segment = segments.get(key);
    const recipe = executionRecipeFromV2Segment(segment);

    record.job.platform = 'ADOBE_FIREFLY';
    record.job.model = 'KLING_3_0';
    record.job.promptSource = 'PHYSICAL_EXECUTION_V2';
    record.job.physicalAction = segment.physicalAction || record.job.physicalAction;
    record.job.executionRecipe = recipe;
    record.job.physicalExecutionV2 = {
      schema: 'construction-manual-physical-execution-v2/1',
      plan: segment.physicalExecutionPlanV2,
      simulation: segment.physicalSimulationV2,
      providerNeutralPrompt: segment.providerNeutralPromptV2,
      logisticsShadow: segment.logisticsShadow,
      ...(segment.retryProviderNeutralPromptV2
        ? { retryProviderNeutralPrompt: segment.retryProviderNeutralPromptV2 }
        : {}),
    };
    record.job.prompt = segment.prompt;

    record.queued.platform = 'ADOBE_FIREFLY';
    record.queued.model = 'KLING_3_0';
    record.queued.promptSource = 'PHYSICAL_EXECUTION_V2';

    await writeJson(record.jobPath, record.job);
    await writeFile(
      path.join(workspaceRoot, record.jobDirectory, 'prompt.txt'),
      segment.prompt + '\n',
      'utf8',
    );

    if (record.state.status === 'RETRY_REQUIRED') {
      if (!String(segment.retryPrompt || '').trim()) {
        throw new Error(
          'Physical Execution V2 migration could not compile a distinct retry prompt for ' +
          record.job.id + '.',
        );
      }
      if (segment.retryPrompt.trim() === segment.prompt.trim()) {
        throw new Error(
          'Physical Execution V2 retry prompt must differ from the base prompt for ' +
          record.job.id + '.',
        );
      }
      record.state.lastReview = {
        ...(record.state.lastReview || {}),
        retryPrompt: segment.retryPrompt,
      };
      await writeJson(record.statePath, record.state);
      await writeFile(
        path.join(workspaceRoot, record.jobDirectory, 'retry-prompt.txt'),
        segment.retryPrompt + '\n',
        'utf8',
      );
    }

    migratedJobs.push({
      jobId: record.job.id,
      status: record.state.status,
      changed: true,
      promptSource: 'PHYSICAL_EXECUTION_V2',
      planId: segment.physicalExecutionPlanV2.planId,
      promptCharacters: segment.promptCharacters,
      retryPromptCharacters: segment.retryPromptCharacters,
    });
  }

  manifest.schemaVersion = 'construction-ai-manual-video/1.3';
  manifest.executionPolicy = {
    ...(manifest.executionPolicy || {}),
    primarySchema: 'construction-physical-execution-plan/2',
    promptSource: 'PHYSICAL_EXECUTION_V2',
    compatibilityRecipeSchema: 'construction-manual-execution-recipe/1',
    compatibilityProjection: true,
    requireExplicitTools: true,
    requireActorAction: true,
    requireVisibleTransformation: true,
    requireTerminalEvidence: true,
    rejectPantomimeWithoutPhysicalChange: true,
  };
  manifest.migrations = [
    ...(Array.isArray(manifest.migrations) ? manifest.migrations : []),
    {
      id: 'manual-workspace-physical-execution-v2',
      migratedAt: migratedAt.toISOString(),
      completedJobsPreserved: true,
      jobIdentityPreserved: true,
      canonicalWorldAdvanced: false,
    },
  ];

  await writeJson(manifestPath, manifest);
  await writeJson(queuePath, queue);

  const afterRecords = [];
  for (const record of records) {
    afterRecords.push({
      job: await readJson(record.jobPath),
      state: await readJson(record.statePath),
    });
  }
  const afterCurrent = afterRecords.find(record => record.state.status !== 'COMPLETE') || null;
  const afterIdentity = afterCurrent
    ? {
        jobId: afterCurrent.job.id,
        status: afterCurrent.state.status,
        attempts: afterCurrent.state.attempts,
      }
    : null;

  if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) {
    throw new Error(
      'Physical Execution V2 migration changed current Job identity/status/attempts.',
    );
  }

  return {
    ok: true,
    workspace,
    schema: 'construction-manual-physical-execution-v2/1',
    promptSource: 'PHYSICAL_EXECUTION_V2',
    migratedJobs,
    currentJob: afterIdentity,
    backupPath: path.relative(root, backupRoot).split(path.sep).join('/'),
    canonicalWorldAdvanced: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await migrateManualWorkspaceToPhysicalV2({
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
    process.stderr.write(
      (error instanceof Error ? error.message : String(error)) + '\n',
    );
    process.exitCode = 1;
  });
}
