import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
  assertReadablePath,
  assertWritablePath,
  buildNamedAction,
  fileMeta,
  normalizeRelativePath,
  resolveExistingPath,
  resolveWritePath,
  runProcess,
  sha256,
} from '../../mcp/construction-studio/lib.mjs';
import { applyExternalRetryDecision } from '../../tools/firefly-review.mjs';

const READ_OPS = new Set([
  'overview',
  'supervisor_snapshot',
  'supervisor_bundle',
  'review_bundle',
  'list_directory',
  'read_file',
  'read_files',
  'read_image',
  'search_code',
  'run_action',
]);

const WRITE_OPS = new Set([
  'record_review_retry',
  'write_file',
  'replace_text',
  'git_stage',
  'git_commit',
]);

const READ_ONLY_ACTIONS = new Set([
  'test',
  'build',
  'git_status',
  'git_diff_check',
  'git_diff',
  'git_log',
  'firefly_status',
  'firefly_prompt',
]);

const MUTATING_ACTIONS = new Set([
  'git_pull',
  'git_push',
  'firefly_complete',
]);

export function validateToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{24,128}$/.test(token);
}

export function safeRequestSummary(message) {
  if (!message || typeof message !== 'object') return {};
  const { op, id } = message;
  const summary = { id: typeof id === 'string' ? id : null, op: typeof op === 'string' ? op : null };

  if (typeof message.path === 'string') summary.path = message.path;
  if (Array.isArray(message.paths)) summary.paths = message.paths.slice(0, 20);
  if (typeof message.action === 'string') summary.action = message.action;
  if (typeof message.workspace === 'string') summary.workspace = message.workspace;
  if (typeof message.jobId === 'string') summary.jobId = message.jobId;
  if (typeof message.expectedAttempts === 'number') summary.expectedAttempts = message.expectedAttempts;
  if (typeof message.observedStagePercentage === 'number') summary.observedStagePercentage = message.observedStagePercentage;
  if (typeof message.message === 'string') summary.commitMessageLength = message.message.length;
  if (typeof message.content === 'string') summary.contentBytes = Buffer.byteLength(message.content, 'utf8');
  if (typeof message.search === 'string') summary.searchLength = message.search.length;
  if (typeof message.replace === 'string') summary.replaceLength = message.replace.length;

  return summary;
}

export class AuditLog {
  constructor(filePath = path.join(os.homedir(), '.local', 'state', 'construction-ai-bridge', 'audit.log')) {
    this.filePath = filePath;
  }

  async write(entry) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readTextIfExists(filePath, maxBytes = MAX_TEXT_BYTES) {
  if (!(await exists(filePath))) return null;
  const meta = await fileMeta(filePath);
  if (!meta.isFile) return null;
  if (meta.size > maxBytes) throw new Error(`File is too large: ${filePath}`);
  return readFile(filePath, 'utf8');
}

async function latestContactSheet(jobDir) {
  const reviewRoot = path.join(jobDir, 'review');
  if (!(await exists(reviewRoot))) return null;

  const attempts = (await readdir(reviewRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^attempt-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const attempt of attempts) {
    for (const name of ['contact-sheet.png', 'contact-sheet-compact.png', 'terminal-verification.png']) {
      const candidate = path.join(reviewRoot, attempt, name);
      if (await exists(candidate)) return candidate;
    }
  }

  return null;
}

async function buildSupervisorBundle(projectRoot, workspaceName) {
  const workspaces = await listWorkspaces(projectRoot);
  const requestedWorkspace = typeof workspaceName === 'string' && workspaceName
    ? normalizeRelativePath(workspaceName)
    : null;

  if (!requestedWorkspace) {
    return {
      selectedWorkspace: null,
      fireflyWorkspaces: workspaces,
      currentJob: null,
      queueSummary: null,
      nextAction: workspaces.length === 1 ? 'SELECT_ONLY_WORKSPACE' : 'SELECT_WORKSPACE',
    };
  }

  if (!workspaces.includes(requestedWorkspace)) {
    throw new Error(`Unknown Firefly workspace: ${requestedWorkspace}`);
  }

  const workspaceRoot = path.join(projectRoot, '.firefly', requestedWorkspace);
  const queuePath = path.join(workspaceRoot, 'queue.json');
  if (!(await exists(queuePath))) {
    throw new Error(`Workspace queue.json is missing: ${requestedWorkspace}`);
  }

  const queue = await readJsonFile(queuePath);
  if (!Array.isArray(queue.jobs)) throw new Error('Workspace queue.json has no jobs array.');

  const jobs = [];
  for (const item of queue.jobs) {
    const jobDir = path.join(workspaceRoot, item.jobDirectory);
    const statePath = path.join(jobDir, 'state.json');
    const state = await readJsonFile(statePath);
    const sourceReady = await exists(path.join(workspaceRoot, item.sourcePath));
    const videoReady = await exists(path.join(workspaceRoot, item.videoOutput));
    const lastFrameReady = await exists(path.join(workspaceRoot, item.lastFrameOutput));

    jobs.push({
      ...item,
      status: state.status,
      attempts: state.attempts ?? 0,
      sourceReady,
      videoReady,
      lastFrameReady,
      runnable: ['PENDING', 'RETRY_REQUIRED'].includes(state.status) && sourceReady,
    });
  }

  const currentIndex = jobs.findIndex((job) => job.status !== 'COMPLETE');
  const current = currentIndex >= 0 ? jobs[currentIndex] : null;

  let currentJob = null;
  if (current) {
    const jobDir = path.join(workspaceRoot, current.jobDirectory);
    const [job, state, source, basePrompt, retryPrompt, checklist, negative, contactSheetAbs] = await Promise.all([
      readJsonFile(path.join(jobDir, 'job.json')),
      readJsonFile(path.join(jobDir, 'state.json')),
      readJsonFile(path.join(jobDir, 'source.json')),
      readTextIfExists(path.join(jobDir, 'prompt.txt')),
      readTextIfExists(path.join(jobDir, 'retry-prompt.txt')),
      readTextIfExists(path.join(jobDir, 'checklist.txt')),
      readTextIfExists(path.join(jobDir, 'negative.txt')),
      latestContactSheet(jobDir),
    ]);

    const effectivePrompt = state.status === 'RETRY_REQUIRED' && retryPrompt
      ? retryPrompt
      : basePrompt;

    currentJob = {
      queue: current,
      job,
      state,
      source,
      effectivePrompt,
      basePrompt,
      retryPrompt: retryPrompt ?? null,
      checklist: checklist ?? null,
      negativeConstraints: negative ?? null,
      paths: {
        jobDirectory: path.relative(projectRoot, jobDir).split(path.sep).join('/'),
        source: path.relative(projectRoot, path.join(workspaceRoot, current.sourcePath)).split(path.sep).join('/'),
        videoOutput: path.relative(projectRoot, path.join(workspaceRoot, current.videoOutput)).split(path.sep).join('/'),
        lastFrameOutput: path.relative(projectRoot, path.join(workspaceRoot, current.lastFrameOutput)).split(path.sep).join('/'),
        contactSheet: contactSheetAbs
          ? path.relative(projectRoot, contactSheetAbs).split(path.sep).join('/')
          : null,
      },
    };
  }

  const completed = jobs.filter((job) => job.status === 'COMPLETE').length;
  const reviewRequired = jobs.filter((job) => job.status === 'REVIEW_REQUIRED').length;
  const retryRequired = jobs.filter((job) => job.status === 'RETRY_REQUIRED').length;
  const runnable = jobs.filter((job) => job.runnable).length;

  let nextAction = 'PROJECT_QUEUE_COMPLETE';
  if (current) {
    if (current.status === 'REVIEW_REQUIRED') nextAction = 'REVIEW_CURRENT_JOB';
    else if (current.status === 'RETRY_REQUIRED' && current.sourceReady) nextAction = 'REGENERATE_CURRENT_JOB';
    else if (current.status === 'PENDING' && current.sourceReady) nextAction = 'GENERATE_CURRENT_JOB';
    else if (!current.sourceReady) nextAction = 'WAIT_FOR_SOURCE_FRAME';
    else nextAction = 'INSPECT_CURRENT_JOB';
  }

  return {
    selectedWorkspace: requestedWorkspace,
    workspacePath: path.relative(projectRoot, workspaceRoot).split(path.sep).join('/'),
    queueSummary: {
      projectId: queue.projectId ?? requestedWorkspace,
      totalJobs: jobs.length,
      completed,
      pending: jobs.length - completed,
      reviewRequired,
      retryRequired,
      runnable,
      currentSequence: current?.sequence ?? null,
      currentJobId: current?.jobId ?? null,
    },
    currentJob,
    blockedDownstreamJobs: currentIndex >= 0
      ? jobs.slice(currentIndex + 1).filter((job) => job.status !== 'COMPLETE').map((job) => ({
          sequence: job.sequence,
          jobId: job.jobId,
          status: job.status,
          sourceReady: job.sourceReady,
        }))
      : [],
    nextAction,
  };
}

function imageMimeType(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

async function readReviewImage(projectRoot, relativePath, includeData) {
  if (!relativePath) return null;
  const { rel, absolute } = await resolveExistingPath(projectRoot, relativePath);
  const mimeType = imageMimeType(rel);
  if (!mimeType) throw new Error(`Unsupported review image type: ${rel}`);
  const meta = await fileMeta(absolute);
  if (!meta.isFile) throw new Error(`Review image is not a file: ${rel}`);
  if (meta.size > MAX_IMAGE_BYTES) throw new Error(`Review image is too large (${meta.size} bytes): ${rel}`);

  const buffer = await readFile(absolute);
  return {
    path: rel,
    mimeType,
    size: meta.size,
    sha256: sha256(buffer),
    ...(includeData ? { dataBase64: buffer.toString('base64') } : {}),
  };
}

async function buildReviewBundle(projectRoot, workspaceName, { includeImages = true } = {}) {
  const supervisor = await buildSupervisorBundle(projectRoot, workspaceName);
  const blockers = [];

  if (!supervisor.selectedWorkspace) {
    blockers.push('WORKSPACE_REQUIRED');
    return {
      ...supervisor,
      reviewReady: false,
      reviewBlockers: blockers,
      reviewTarget: null,
      lastReview: null,
      continuityFromJobId: null,
      images: { sourceFrame: null, contactSheet: null },
    };
  }

  if (!supervisor.currentJob) {
    blockers.push('NO_CURRENT_JOB');
    return {
      ...supervisor,
      reviewReady: false,
      reviewBlockers: blockers,
      reviewTarget: null,
      lastReview: null,
      continuityFromJobId: null,
      images: { sourceFrame: null, contactSheet: null },
    };
  }

  const sourcePath = supervisor.currentJob.paths.source;
  const contactSheetPath = supervisor.currentJob.paths.contactSheet;

  if (!sourcePath || !(await exists(path.join(projectRoot, sourcePath)))) {
    blockers.push('SOURCE_FRAME_MISSING');
  }
  if (!contactSheetPath || !(await exists(path.join(projectRoot, contactSheetPath)))) {
    blockers.push('CONTACT_SHEET_MISSING');
  }

  const [sourceFrame, contactSheet] = await Promise.all([
    blockers.includes('SOURCE_FRAME_MISSING')
      ? null
      : readReviewImage(projectRoot, sourcePath, includeImages),
    blockers.includes('CONTACT_SHEET_MISSING')
      ? null
      : readReviewImage(projectRoot, contactSheetPath, includeImages),
  ]);

  const job = supervisor.currentJob.job;
  const state = supervisor.currentJob.state;
  const source = supervisor.currentJob.source;

  return {
    ...supervisor,
    reviewReady: blockers.length === 0,
    reviewBlockers: blockers,
    reviewTarget: {
      jobId: supervisor.currentJob.queue.jobId,
      sequence: supervisor.currentJob.queue.sequence,
      sceneId: supervisor.currentJob.queue.sceneId,
      model: supervisor.currentJob.queue.model,
      durationSeconds: supervisor.currentJob.queue.durationSeconds,
      startStagePercentage: supervisor.currentJob.queue.startStagePercentage,
      targetStagePercentage: supervisor.currentJob.queue.targetStagePercentage,
      status: state.status,
      attempts: state.attempts ?? 0,
      acceptanceChecklist: job.acceptanceChecklist ?? [],
      continuityLocks: job.continuityLocks ?? null,
    },
    lastReview: state.lastReview ?? null,
    continuityFromJobId: source?.kind === 'PREVIOUS_JOB_LAST_FRAME'
      ? source.previousJobId ?? null
      : null,
    contactSheetLayout: contactSheet
      ? {
          kind: 'chronological_2x2',
          topLeft: 'start',
          topRight: 'one-third',
          bottomLeft: 'two-thirds',
          bottomRight: 'terminal/end',
        }
      : null,
    images: {
      sourceFrame,
      contactSheet,
    },
  };
}

async function listWorkspaces(projectRoot) {
  const firefly = path.join(projectRoot, '.firefly');
  try {
    const entries = await readdir(firefly, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function requireWriteMode(policy) {
  if (policy.writeMode !== 'allow') {
    throw new Error('Bridge is read-only. Restart with CONSTRUCTION_BRIDGE_WRITE_MODE=allow to permit safe writes.');
  }
}

function requirePushMode(policy) {
  requireWriteMode(policy);
  if (!policy.allowPush) {
    throw new Error('git push is disabled. Restart with CONSTRUCTION_BRIDGE_ALLOW_PUSH=true to permit it.');
  }
}

function normalizedPaths(paths = []) {
  return paths.map((item) => assertReadablePath(item));
}

export function createBridgeExecutor({
  projectRoot,
  policy = { writeMode: 'readonly', allowPush: false },
  audit = new AuditLog(),
} = {}) {
  if (!projectRoot) throw new Error('projectRoot is required.');

  async function execute(message) {
    const started = Date.now();
    const summary = safeRequestSummary(message);

    try {
      if (!message || typeof message !== 'object') throw new Error('Request must be an object.');
      if (typeof message.id !== 'string' || !message.id) throw new Error('Request id is required.');
      if (typeof message.op !== 'string' || !message.op) throw new Error('Request op is required.');

      if (!READ_OPS.has(message.op) && !WRITE_OPS.has(message.op)) {
        throw new Error(`Unsupported operation: ${message.op}`);
      }

      let result;
      switch (message.op) {
        case 'overview': {
          const [gitStatus, latestCommit, workspaces] = await Promise.all([
            runProcess(projectRoot, 'git', ['status', '--short', '--branch'], { timeoutMs: 30_000 }),
            runProcess(projectRoot, 'git', ['log', '-1', '--oneline'], { timeoutMs: 30_000 }),
            listWorkspaces(projectRoot),
          ]);
          result = { projectRoot, policy, gitStatus, latestCommit, fireflyWorkspaces: workspaces };
          break;
        }

        case 'supervisor_snapshot': {
          const workspaces = await listWorkspaces(projectRoot);
          const requestedWorkspace = typeof message.workspace === 'string' && message.workspace
            ? normalizeRelativePath(message.workspace)
            : null;

          if (requestedWorkspace && !workspaces.includes(requestedWorkspace)) {
            throw new Error(`Unknown Firefly workspace: ${requestedWorkspace}`);
          }

          const [gitStatus, diffCheck, gitLog] = await Promise.all([
            runProcess(projectRoot, 'git', ['status', '--short', '--branch'], { timeoutMs: 30_000 }),
            runProcess(projectRoot, 'git', ['diff', '--check'], { timeoutMs: 30_000 }),
            runProcess(projectRoot, 'git', ['log', '--oneline', '-n', '5'], { timeoutMs: 30_000 }),
          ]);

          let fireflyStatus = null;
          if (requestedWorkspace) {
            const spec = buildNamedAction('firefly_status', { workspace: requestedWorkspace });
            fireflyStatus = await runProcess(projectRoot, spec.command, spec.argv, { timeoutMs: spec.timeoutMs });
          }

          result = {
            projectRoot,
            policy,
            gitStatus,
            diffCheck,
            gitLog,
            fireflyWorkspaces: workspaces,
            selectedWorkspace: requestedWorkspace,
            fireflyStatus,
          };
          break;
        }

        case 'supervisor_bundle': {
          const [gitStatus, diffCheck, gitLog, bundle] = await Promise.all([
            runProcess(projectRoot, 'git', ['status', '--short', '--branch'], { timeoutMs: 30_000 }),
            runProcess(projectRoot, 'git', ['diff', '--check'], { timeoutMs: 30_000 }),
            runProcess(projectRoot, 'git', ['log', '--oneline', '-n', '5'], { timeoutMs: 30_000 }),
            buildSupervisorBundle(projectRoot, message.workspace),
          ]);

          result = {
            projectRoot,
            policy,
            gitStatus,
            diffCheck,
            gitLog,
            ...bundle,
          };
          break;
        }

        case 'review_bundle': {
          result = await buildReviewBundle(projectRoot, message.workspace, {
            includeImages: message.includeImages !== false,
          });
          break;
        }

        case 'record_review_retry': {
          requireWriteMode(policy);

          const workspace = normalizeRelativePath(message.workspace);
          const workspaces = await listWorkspaces(projectRoot);
          if (!workspaces.includes(workspace)) {
            throw new Error(`Unknown Firefly workspace: ${workspace}`);
          }

          if (typeof message.jobId !== 'string' || !message.jobId) {
            throw new Error('jobId is required.');
          }
          if (message.confirm !== 'RETRY_CURRENT_JOB') {
            throw new Error('record_review_retry requires confirm=RETRY_CURRENT_JOB.');
          }

          result = await applyExternalRetryDecision(
            path.join(projectRoot, '.firefly', workspace),
            message.jobId,
            {
              expectedAttempts: message.expectedAttempts,
              expectedContactSheetSha256: message.expectedContactSheetSha256,
              observedStagePercentage: message.observedStagePercentage,
            },
          );
          break;
        }

        case 'list_directory': {
          const { rel, absolute } = await resolveExistingPath(projectRoot, message.path ?? '.');
          const info = await stat(absolute);
          if (!info.isDirectory()) throw new Error('Requested path is not a directory.');
          const entries = (await readdir(absolute, { withFileTypes: true }))
            .slice(0, 500)
            .map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
            }));
          result = { path: rel, entries };
          break;
        }

        case 'read_file': {
          const { rel, absolute } = await resolveExistingPath(projectRoot, message.path);
          const meta = await fileMeta(absolute);
          if (!meta.isFile) throw new Error('Requested path is not a file.');
          if (meta.size > MAX_TEXT_BYTES) throw new Error(`Text file is too large (${meta.size} bytes).`);
          const buffer = await readFile(absolute);
          result = {
            path: rel,
            sha256: sha256(buffer),
            size: meta.size,
            modifiedAt: meta.modifiedAt,
            content: buffer.toString('utf8'),
          };
          break;
        }

        case 'read_files': {
          if (!Array.isArray(message.paths) || message.paths.length < 1 || message.paths.length > 20) {
            throw new Error('paths must contain 1-20 entries.');
          }
          const files = [];
          let totalBytes = 0;
          for (const requestedPath of message.paths) {
            const { rel, absolute } = await resolveExistingPath(projectRoot, requestedPath);
            const meta = await fileMeta(absolute);
            if (!meta.isFile) throw new Error(`Requested path is not a file: ${rel}`);
            if (meta.size > MAX_TEXT_BYTES) throw new Error(`Text file is too large: ${rel}`);
            totalBytes += meta.size;
            if (totalBytes > MAX_TEXT_BYTES * 2) throw new Error('Combined file payload is too large.');
            const buffer = await readFile(absolute);
            files.push({
              path: rel,
              sha256: sha256(buffer),
              size: meta.size,
              modifiedAt: meta.modifiedAt,
              content: buffer.toString('utf8'),
            });
          }
          result = { files };
          break;
        }

        case 'read_image': {
          const { rel, absolute } = await resolveExistingPath(projectRoot, message.path);
          const ext = path.extname(rel).toLowerCase();
          const mimeType = ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.webp'
                ? 'image/webp'
                : null;
          if (!mimeType) throw new Error('Only PNG, JPEG and WebP images are allowed.');
          const meta = await fileMeta(absolute);
          if (!meta.isFile) throw new Error('Requested path is not a file.');
          if (meta.size > MAX_IMAGE_BYTES) throw new Error(`Image is too large (${meta.size} bytes).`);
          const buffer = await readFile(absolute);
          result = {
            path: rel,
            mimeType,
            size: meta.size,
            sha256: sha256(buffer),
            dataBase64: buffer.toString('base64'),
          };
          break;
        }

        case 'search_code': {
          if (typeof message.query !== 'string' || !message.query || message.query.length > 200) {
            throw new Error('query must be a non-empty string up to 200 characters.');
          }
          const safePaths = normalizedPaths(message.paths ?? []);
          const argv = ['grep', '-n', '-I', '-F', '-e', message.query];
          if (safePaths.length) argv.push('--', ...safePaths);
          const search = await runProcess(projectRoot, 'git', argv, { timeoutMs: 30_000 });
          if (search.exitCode === 1 && !search.stderr) {
            result = { query: message.query, matchesFound: false, output: '' };
          } else {
            result = { query: message.query, matchesFound: search.exitCode === 0, search };
          }
          break;
        }

        case 'write_file': {
          requireWriteMode(policy);
          if (typeof message.content !== 'string') throw new Error('content must be a string.');
          if (Buffer.byteLength(message.content, 'utf8') > MAX_TEXT_BYTES) throw new Error('Content exceeds maximum size.');
          const { rel, absolute } = await resolveWritePath(projectRoot, message.path);
          let existed = false;
          try {
            const current = await readFile(absolute);
            existed = true;
            if (!message.expectedSha256) throw new Error('expectedSha256 is required when overwriting an existing file.');
            if (sha256(current) !== message.expectedSha256) throw new Error('File changed since it was read.');
          } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
          }
          await writeFile(absolute, message.content, 'utf8');
          const written = await readFile(absolute);
          result = { path: rel, created: !existed, sha256: sha256(written), bytes: written.length };
          break;
        }

        case 'replace_text': {
          requireWriteMode(policy);
          const { rel, absolute } = await resolveWritePath(projectRoot, message.path);
          const current = await readFile(absolute);
          if (current.length > MAX_TEXT_BYTES) throw new Error('File exceeds maximum edit size.');
          if (message.expectedSha256 && sha256(current) !== message.expectedSha256) {
            throw new Error('File changed since it was read.');
          }
          if (typeof message.search !== 'string' || !message.search) throw new Error('search must be a non-empty string.');
          if (typeof message.replace !== 'string') throw new Error('replace must be a string.');
          const expectedOccurrences = Number.isInteger(message.expectedOccurrences) ? message.expectedOccurrences : 1;
          const text = current.toString('utf8');
          const occurrences = text.split(message.search).length - 1;
          if (occurrences !== expectedOccurrences) {
            throw new Error(`Expected ${expectedOccurrences} occurrence(s), found ${occurrences}.`);
          }
          const updated = text.split(message.search).join(message.replace);
          await writeFile(absolute, updated, 'utf8');
          const written = Buffer.from(updated, 'utf8');
          result = { path: rel, replacedOccurrences: occurrences, sha256: sha256(written), bytes: written.length };
          break;
        }

        case 'git_stage': {
          requireWriteMode(policy);
          if (!Array.isArray(message.paths) || message.paths.length < 1 || message.paths.length > 100) {
            throw new Error('paths must contain 1-100 entries.');
          }
          const safePaths = message.paths.map((item) => assertWritablePath(item));
          result = await runProcess(projectRoot, 'git', ['add', '--', ...safePaths], { timeoutMs: 60_000 });
          break;
        }

        case 'git_commit': {
          requireWriteMode(policy);
          if (typeof message.message !== 'string' || !message.message || message.message.length > 200) {
            throw new Error('commit message must be 1-200 characters.');
          }
          result = await runProcess(projectRoot, 'git', ['commit', '-m', message.message], { timeoutMs: 60_000 });
          break;
        }

        case 'run_action': {
          const action = message.action;
          if (typeof action !== 'string') throw new Error('action is required.');
          if (!READ_ONLY_ACTIONS.has(action) && !MUTATING_ACTIONS.has(action)) {
            throw new Error(`Unsupported action: ${action}`);
          }
          if (MUTATING_ACTIONS.has(action)) requireWriteMode(policy);
          if (action === 'git_push') requirePushMode(policy);

          const args = {
            workspace: message.workspace,
            jobId: message.jobId,
            paths: normalizedPaths(message.paths ?? []),
            count: message.count,
            remote: message.remote,
          };
          const spec = buildNamedAction(action, args);
          result = {
            action,
            command: [spec.command, ...spec.argv],
            result: await runProcess(projectRoot, spec.command, spec.argv, { timeoutMs: spec.timeoutMs }),
          };
          break;
        }

        default:
          throw new Error(`Unsupported operation: ${message.op}`);
      }

      await audit.write({
        event: 'request',
        ok: true,
        durationMs: Date.now() - started,
        ...summary,
      });

      return { id: message.id, ok: true, result };
    } catch (error) {
      await audit.write({
        event: 'request',
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
        ...summary,
      });

      return {
        id: message?.id ?? null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { execute };
}
