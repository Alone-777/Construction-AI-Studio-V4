#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_RE = /^[A-Za-z0-9._-]{1,128}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const FAILURE_CODE_RE = /^[A-Z0-9_]{2,64}$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('Invalid argument: ' + key);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('Missing value for ' + key);
    }
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function atomicWriteText(filePath, value) {
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
  await writeFile(tmp, value, 'utf8');
  await rename(tmp, filePath);
}

async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, JSON.stringify(value, null, 2) + '\n');
}

function normalizeFailures(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new Error('failures must contain 1-10 structured items.');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('failure #' + (index + 1) + ' must be an object.');
    }
    const code = String(item.code || '').trim().toUpperCase();
    const message = String(item.message || '').trim();
    const correction = String(item.correction || '').trim();

    if (!FAILURE_CODE_RE.test(code)) {
      throw new Error('failure #' + (index + 1) + ' has invalid code.');
    }
    if (!message || message.length > 1200) {
      throw new Error('failure #' + (index + 1) + ' has invalid message.');
    }
    if (!correction || correction.length > 1600) {
      throw new Error('failure #' + (index + 1) + ' has invalid correction.');
    }

    return { code, message, correction };
  });
}

function ensureInside(parent, candidate, label) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const rel = path.relative(resolvedParent, resolvedCandidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(label + ' escapes its allowed root.');
  }
  return resolvedCandidate;
}

function buildRetryPrompt(basePrompt, failures) {
  const corrections = failures
    .map((failure, index) => (index + 1) + '. ' + failure.correction)
    .join('\n');
  return String(basePrompt || '').trimEnd() +
    '\n\nCORRECTIVE RETRY REQUIREMENTS:\n' +
    corrections +
    '\nThe retry must preserve the exact source-frame continuity, correct only the failures above, and keep the final state physically causal and reusable.\n';
}

async function backupFile(source, backupRoot, name) {
  if (!(await exists(source))) return false;
  const destination = path.join(backupRoot, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

export async function recordStructuredRetry({
  projectRoot,
  workspace,
  jobId,
  expectedAttempts,
  expectedContactSheetSha256,
  observedStagePercentage,
  failures,
  reviewedAt = new Date(),
}) {
  if (!projectRoot) throw new Error('projectRoot is required.');
  if (!WORKSPACE_RE.test(String(workspace || ''))) throw new Error('Invalid workspace.');
  if (!jobId || String(jobId).length > 256) throw new Error('Invalid jobId.');

  const attempts = Number(expectedAttempts);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 999) {
    throw new Error('Invalid expectedAttempts.');
  }

  const contactSha = String(expectedContactSheetSha256 || '').toLowerCase();
  if (!SHA256_RE.test(contactSha)) {
    throw new Error('Invalid expectedContactSheetSha256.');
  }

  const observed = Number(observedStagePercentage);
  if (!Number.isFinite(observed) || observed < 0 || observed > 100) {
    throw new Error('Invalid observedStagePercentage.');
  }

  const normalizedFailures = normalizeFailures(failures);
  const root = path.resolve(projectRoot);
  const fireflyRoot = path.resolve(root, '.firefly');
  const workspaceRoot = ensureInside(fireflyRoot, path.join(fireflyRoot, workspace), 'workspace');

  const queuePath = path.join(workspaceRoot, 'queue.json');
  const queue = await readJson(queuePath);
  const queued = (queue.jobs || []).find((item) => item?.jobId === jobId);
  if (!queued) throw new Error('Job is not present in the workspace queue.');

  const jobDirectory = String(queued.jobDirectory || '');
  if (!jobDirectory) throw new Error('Current Job has no jobDirectory.');
  const jobRoot = ensureInside(workspaceRoot, path.join(workspaceRoot, jobDirectory), 'jobDirectory');

  const jobPath = path.join(jobRoot, 'job.json');
  const statePath = path.join(jobRoot, 'state.json');
  const retryPromptPath = path.join(jobRoot, 'retry-prompt.txt');

  const [job, state] = await Promise.all([
    readJson(jobPath),
    readJson(statePath),
  ]);

  if (job.id !== jobId || state.jobId !== jobId) {
    throw new Error('Job identity mismatch.');
  }
  if (state.status !== 'REVIEW_REQUIRED') {
    throw new Error('Structured RETRY requires REVIEW_REQUIRED.');
  }
  if (Number(state.attempts) !== attempts) {
    throw new Error('Attempt count changed; structured RETRY is stale.');
  }

  const pending = state.lastReview || {};
  if (pending.verdict !== 'PENDING_EXTERNAL_REVIEW') {
    throw new Error('Current review is not pending external review.');
  }
  if (Number(pending.reviewedAttempt) !== attempts) {
    throw new Error('Pending review attempt does not match expectedAttempts.');
  }
  if (String(pending.contactSheetSha256 || '').toLowerCase() !== contactSha) {
    throw new Error('Contact-sheet evidence changed; structured RETRY is stale.');
  }

  const target = Number(job.targetStagePercentage ?? queued.targetStagePercentage);
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    throw new Error('Job targetStagePercentage is invalid.');
  }

  const retryPrompt = buildRetryPrompt(job.prompt, normalizedFailures);
  const review = {
    contract: 'construction-external-review-v1',
    verdict: 'RETRY',
    reviewSource: 'chatgpt-relay',
    jobId,
    operationType: job.operationType ?? null,
    observedStagePercentage: observed,
    targetStagePercentage: target,
    failures: normalizedFailures,
    warnings: [],
    blockers: [],
    ...(pending.candidateVideoSha256 ? { candidateVideoSha256: pending.candidateVideoSha256 } : {}),
    contactSheet: pending.contactSheet,
    contactSheetSha256: contactSha,
    reviewedAttempt: attempts,
    retryPrompt,
  };

  const stamp = reviewedAt.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(jobRoot, '.review-backups', 'attempt-' + String(attempts).padStart(3, '0') + '-' + stamp);
  await mkdir(backupRoot, { recursive: true });
  await backupFile(statePath, backupRoot, 'state.json');
  await backupFile(retryPromptPath, backupRoot, 'retry-prompt.txt');

  const nextState = {
    ...state,
    status: 'RETRY_REQUIRED',
    completedAt: null,
    lastReview: review,
    pendingLearning: {
      operationType: job.operationType ?? null,
      provider: job.model ?? 'UNKNOWN',
      failures: normalizedFailures,
    },
  };

  await atomicWriteJson(statePath, nextState);
  await atomicWriteText(retryPromptPath, retryPrompt);

  return {
    ok: true,
    workspace,
    jobId,
    status: 'RETRY_REQUIRED',
    attempts,
    model: job.model ?? null,
    durationSeconds: job.durationSeconds ?? null,
    observedStagePercentage: observed,
    targetStagePercentage: target,
    review,
    backupPath: path.relative(root, backupRoot).split(path.sep).join('/'),
    canonicalWorldAdvanced: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let failures;
  try {
    failures = JSON.parse(args['failures-json']);
  } catch {
    throw new Error('failures-json must be valid JSON.');
  }

  const result = await recordStructuredRetry({
    projectRoot: args['project-root'],
    workspace: args.workspace,
    jobId: args['job-id'],
    expectedAttempts: args['expected-attempts'],
    expectedContactSheetSha256: args['expected-contact-sheet-sha256'],
    observedStagePercentage: args['observed-stage-percentage'],
    failures,
  });

  process.stdout.write(JSON.stringify(result) + '\n');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
