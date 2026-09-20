import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  VisualProviderRouter,
  createVisualProviders,
  describeVisualProviders,
  isTransientProviderCode,
} from '../server/providers/provider-router.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_PROGRESS_TOLERANCE = 12;
const MIN_PROGRESS_CONFIDENCE = 0.55;
const MIN_AUTOPASS_CONFIDENCE = 0.85;
const TRANSIENT_PROVIDER_RETRY_DELAYS_MS = [0, 3000, 8000];

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveOperationType(job) {
  if (typeof job.operationType === 'string' && job.operationType.trim()) return job.operationType.trim();
  const scene = String(job.sceneId || '').toLowerCase();
  const mapping = [
    ['limpeza', 'limpeza'],
    ['sapata', 'sapata'],
    ['base', 'piso'],
    ['piso', 'piso'],
    ['pilares', 'pilar'],
    ['pilar', 'pilar'],
    ['paredes', 'parede'],
    ['parede', 'parede'],
    ['vigas', 'viga'],
    ['viga', 'viga'],
    ['cobertura', 'cobertura'],
    ['porta', 'porta'],
  ];
  return mapping.find(([needle]) => scene.includes(needle))?.[1] ?? 'unknown';
}

export function buildFireflyReviewContext(job, operationType = resolveOperationType(job)) {
  const forbidden = job.continuityLocks?.forbiddenFutureElements ?? [];
  return [
    'CONSTRUCTION FISCAL MODE.',
    'The supplied image is a chronological 2x2 contact sheet from ONE generated video clip: TOP LEFT = start, TOP RIGHT = one-third, BOTTOM LEFT = two-thirds, BOTTOM RIGHT = terminal/end.',
    'Judge progress only for the CURRENT OPERATION, never for the whole building.',
    'Current operation type: ' + operationType + '.',
    'Stage starts at ' + job.startStagePercentage + '% and must end at ' + job.targetStagePercentage + '%.',
    'For apparentCompletion, estimate the BOTTOM RIGHT terminal panel completion percentage of this current operation only.',
    'Use the other three panels only as evidence of progression and continuity.',
    'Estimate how much of the FINAL VISIBLE RESULT of this operation is already complete, not how much worker activity occurred.',
    'At a 50% target, approximately half of the visible operation result must still remain clearly unfinished. If nearly the whole floor, wall, roof or other current element is visibly finished, report a high completion percentage even if the worker is still moving.',
    'If exact progress is not visually supportable, classify apparentCompletion as UNKNOWN instead of guessing.',
    'If any canonical forbidden element is visible, include its exact canonical ID in visibleCanonicalFutureElements: ' +
      (forbidden.length ? forbidden.join(', ') : 'none') + '.',
    'Required visible evidence/checklist: ' + ((job.acceptanceChecklist ?? []).join(' | ') || 'none') + '.',
    'Preserve worker identity: ' + (job.continuityLocks?.preserveWorkerIdentity ?? 'unknown') + '.',
    'Preserve existing components: ' + ((job.continuityLocks?.preserveExistingComponents ?? []).join(', ') || 'none') + '.',
    'Preserve permanent objects: ' + ((job.continuityLocks?.preservePermanentObjects ?? []).join(', ') || 'none') + '.',
    'Do not infer hidden work. Evaluate worker, environment, geometry and source continuity across the three panels.',
  ].join(' ');
}

function matchesCanonicalElement(observed, canonical) {
  const left = normalizeToken(observed);
  const right = normalizeToken(canonical);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

export function assessNormalizedVisualAnalysis(job, analysis, options = {}) {
  const tolerance = options.progressTolerance ?? DEFAULT_PROGRESS_TOLERANCE;
  const operationType = options.operationType ?? resolveOperationType(job);
  const isFiscal = analysis?.contract === 'construction-fiscal-v1';
  const completion = isFiscal
    ? analysis?.apparentCompletion
    : analysis?.claims?.apparentCompletion;
  const blockers = [];

  if (!completion || completion.classification === 'UNKNOWN' ||
      typeof completion.value !== 'number' || !Number.isFinite(completion.value) ||
      Number(completion.confidence) < MIN_PROGRESS_CONFIDENCE) {
    blockers.push('APPARENT_COMPLETION_UNCERTAIN');
  }

  const failures = [];
  const warnings = [];
  const observed = typeof completion?.value === 'number' ? completion.value : undefined;
  const target = job.targetStagePercentage;

  if (typeof observed === 'number') {
    if (observed > target + tolerance) {
      failures.push({
        code: 'PROGRESS_OVERSHOOT',
        message: 'Observed progress ' + observed + '% exceeds target ' + target + '%.',
        correction: 'Stop clearly at ' + target + '% completion. Leave a visibly unfinished portion for the next segment; do not complete the current operation.',
      });
    }
    if (observed < target - tolerance) {
      failures.push({
        code: 'PROGRESS_UNDERSHOOT',
        message: 'Observed progress ' + observed + '% is below target ' + target + '%.',
        correction: 'Advance the operation visibly to approximately ' + target + '% before the clip ends. Show the missing physical work on screen.',
      });
    }
  }

  let leaked = [];
  if (isFiscal) {
    const claim = analysis?.visibleCanonicalFutureElements;
    leaked = claim?.classification === 'UNKNOWN' || !Array.isArray(claim?.value)
      ? [] : claim.value.map(String);
  } else {
    const visibleClaim = analysis?.claims?.visibleComponents;
    const visible = visibleClaim?.classification === 'UNKNOWN' || !Array.isArray(visibleClaim?.value)
      ? [] : visibleClaim.value.map(String);
    const forbidden = job.continuityLocks?.forbiddenFutureElements ?? [];
    leaked = forbidden.filter(canonical => visible.some(item => matchesCanonicalElement(item, canonical)));
  }

  const forbiddenSet = new Set(job.continuityLocks?.forbiddenFutureElements ?? []);
  leaked = unique(leaked.filter(element => forbiddenSet.has(element)));
  if (leaked.length) {
    failures.push({
      code: 'FUTURE_ELEMENT_LEAK',
      message: 'Forbidden future elements were observed: ' + leaked.join(', ') + '.',
      correction: 'Do not show these future elements: ' + leaked.join(', ') + '. Keep them absent until their authorized operation.',
    });
  }

  if (isFiscal) {
    const missingClaim = analysis?.missingVisibleEvidence;
    const missing = missingClaim?.classification === 'UNKNOWN' || !Array.isArray(missingClaim?.value)
      ? [] : unique(missingClaim.value.map(String));
    if (missing.length) {
      failures.push({
        code: 'MISSING_EVIDENCE',
        message: 'Required visible evidence is missing: ' + missing.join('; ') + '.',
        correction: 'Make these results visibly undeniable before the clip ends: ' + missing.join('; ') + '.',
      });
    }

    const continuityChecks = [
      ['workerContinuity', 'CHARACTER_DRIFT', 'Worker identity or clothing continuity'],
      ['environmentContinuity', 'ENVIRONMENT_DRIFT', 'Environment continuity'],
      ['geometryContinuity', 'GEOMETRY_DRIFT', 'Geometry continuity'],
      ['sourceContinuity', 'SOURCE_CONTINUITY_DRIFT', 'Source-frame continuity'],
    ];

    for (const [field, code, label] of continuityChecks) {
      const claim = analysis?.[field];
      if (!claim || claim.classification === 'UNKNOWN' || claim.value == null ||
          Number(claim.confidence) < MIN_PROGRESS_CONFIDENCE) {
        blockers.push(String(field).toUpperCase() + '_UNCERTAIN');
        continue;
      }
      if (claim.value === 'MAJOR_DIVERGENCE') {
        failures.push({
          code,
          message: label + ' has a major divergence.',
          correction: code === 'CHARACTER_DRIFT'
            ? 'Preserve the exact same worker identity, clothing, body proportions and protective equipment from the source frame.'
            : code === 'ENVIRONMENT_DRIFT'
              ? 'Preserve the exact terrain, vegetation, creek/background, weather and lighting from the source frame.'
              : code === 'GEOMETRY_DRIFT'
                ? 'Preserve all existing geometry exactly; alter only the current operation area through visible physical work.'
                : 'Start from the supplied source frame exactly. Do not reset, redesign or reinterpret the scene.',
        });
      } else if (claim.value === 'MINOR_DIVERGENCE') {
        warnings.push({ code: String(code).replace('_DRIFT', '_MINOR'), message: label + ' has a minor divergence.' });
      }
    }
  } else if (failures.length === 0) {
    blockers.push('FISCAL_CONTINUITY_UNAVAILABLE');
  }

  if (failures.length) {
    return {
      verdict: 'RETRY',
      jobId: job.id,
      operationType,
      observedStagePercentage: observed,
      targetStagePercentage: target,
      confidence: completion?.confidence ?? 0,
      failures,
      warnings,
      blockers,
    };
  }

  if (
    failures.length === 0 &&
    typeof completion?.confidence === 'number' &&
    completion.confidence < MIN_AUTOPASS_CONFIDENCE
  ) {
    blockers.push('AUTOPASS_CONFIDENCE_TOO_LOW');
  }

  if (blockers.length) {
    return {
      verdict: 'REOBSERVE',
      jobId: job.id,
      operationType,
      observedStagePercentage: observed,
      targetStagePercentage: target,
      blockers: unique(blockers),
      failures: [],
      warnings,
    };
  }

  return {
    verdict: 'PASS',
    jobId: job.id,
    operationType,
    observedStagePercentage: observed,
    targetStagePercentage: target,
    confidence: completion.confidence,
    failures: [],
    warnings,
  };
}

export function visualProviderStatuses(env = process.env) {
  return describeVisualProviders(env);
}

async function runFfmpeg(args) {
  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const details = error?.stderr ? String(error.stderr).slice(-2000) : String(error);
    throw new Error('FFmpeg failed while preparing visual review: ' + details);
  }
}

export async function buildVideoContactSheet(videoPath, reviewDir, durationSeconds) {
  if (!(await exists(videoPath))) throw new Error('Video not found: ' + videoPath);
  await mkdir(reviewDir, { recursive: true });
  const duration = Math.max(0.5, Number(durationSeconds) || 1);
  const timestamps = [
    0.05,
    Math.max(0.1, duration / 3),
    Math.max(0.1, (duration * 2) / 3),
    Math.max(0.1, duration - 0.12),
  ];
  const frames = ['start.png', 'third.png', 'two-thirds.png', 'end.png']
    .map(name => path.join(reviewDir, name));

  for (let index = 0; index < frames.length; index += 1) {
    await runFfmpeg([
      '-y', '-ss', timestamps[index].toFixed(3), '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2',
      frames[index],
    ]);
  }

  const contactSheet = path.join(reviewDir, 'contact-sheet.png');
  await runFfmpeg([
    '-y',
    '-i', frames[0], '-i', frames[1], '-i', frames[2], '-i', frames[3],
    '-filter_complex',
    '[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[v]',
    '-map', '[v]', '-frames:v', '1', contactSheet,
  ]);
  return { frames, contactSheet };
}

async function buildTerminalComparisonSheet(videoPath, reviewDir, durationSeconds) {
  const duration = Math.max(0.5, Number(durationSeconds) || 1);
  const start = path.join(reviewDir, 'verify-start.png');
  const end = path.join(reviewDir, 'verify-end.png');

  for (const [timestamp, output] of [
    [0.05, start],
    [Math.max(0.1, duration - 0.12), end],
  ]) {
    await runFfmpeg([
      '-y', '-ss', Number(timestamp).toFixed(3), '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      output,
    ]);
  }

  const comparison = path.join(reviewDir, 'terminal-verification.png');
  await runFfmpeg([
    '-y', '-i', start, '-i', end,
    '-filter_complex', '[0:v][1:v]hstack=inputs=2[v]',
    '-map', '[v]', '-frames:v', '1', comparison,
  ]);
  return comparison;
}

export function isRetryableProviderError(error) {
  return isTransientProviderCode(error?.code);
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeFiscalImageWithFallback(
  router,
  imagePath,
  userContext,
  options = {},
) {
  const compactPath = options.compactPath ??
    imagePath.replace(/\.png$/i, '-compact.png');
  let compactReady = false;
  let lastError;

  for (let attempt = 0; attempt < TRANSIENT_PROVIDER_RETRY_DELAYS_MS.length; attempt += 1) {
    const useCompact = attempt > 0;
    const candidatePath = useCompact ? compactPath : imagePath;

    if (useCompact && !compactReady) {
      await runFfmpeg([
        '-y', '-i', imagePath,
        '-vf', 'scale=1280:-2:flags=lanczos',
        '-frames:v', '1',
        compactPath,
      ]);
      compactReady = true;
    }

    if (attempt > 0) {
      await sleep(TRANSIENT_PROVIDER_RETRY_DELAYS_MS[attempt]);
    }

    try {
      const bytes = await readFile(candidatePath);
      const routed = await router.analyze({
        imageData: 'data:image/png;base64,' + bytes.toString('base64'),
        mimeType: 'image/png',
        userContext,
        contract: 'construction-fiscal-v1',
      }, {
        preferredProviderId: options.preferredProviderId,
        deprioritizeProviderIds: options.deprioritizeProviderIds ?? [],
        useCache: options.useCache !== false,
        minimumTimeoutMs: useCompact ? 150_000 : undefined,
      });
      return {
        ...routed,
        imagePath: candidatePath,
        usedCompactRetry: useCompact,
        providerAttempts: routed.routeTrace.filter(entry =>
          ['FAILED', 'SUCCESS', 'CACHE_HIT'].includes(entry.status)
        ).length,
        providerRetryRound: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ALL_VISUAL_PROVIDERS_FAILED' || !error?.retryable) {
        throw error;
      }
      if (attempt === TRANSIENT_PROVIDER_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

function providerReviewBlocker(error) {
  const code = String(error?.code || '');
  if (code === 'ALL_VISUAL_PROVIDERS_FAILED') return 'VISUAL_PROVIDER_ROUTER_EXHAUSTED';
  if (code === 'PROVIDER_TIMEOUT') return 'PROVIDER_TIMEOUT';
  if (code === 'RATE_OR_QUOTA_LIMIT') return 'PROVIDER_RATE_OR_QUOTA_LIMIT';
  if (code === 'QUOTA_EXCEEDED') return 'PROVIDER_QUOTA_EXCEEDED';
  if (code === 'PROVIDER_UNAVAILABLE') return 'PROVIDER_UNAVAILABLE';
  if (code === 'MODEL_NOT_AVAILABLE') return 'MODEL_NOT_AVAILABLE';
  if (code === 'INVALID_API_KEY') return 'INVALID_API_KEY';
  if (code === 'INVALID_PROVIDER_RESPONSE') return 'INVALID_PROVIDER_RESPONSE';
  return null;
}

function providerRouteBlockers(error) {
  const blockers = [];
  const primary = providerReviewBlocker(error);
  if (primary) blockers.push(primary);
  for (const entry of error?.routeTrace ?? []) {
    if (entry.status !== 'FAILED' || !entry.errorCode) continue;
    const mapped = providerReviewBlocker({ code: entry.errorCode });
    if (mapped) blockers.push(mapped);
  }
  return unique(blockers);
}

function createReviewRouter(workspace) {
  return new VisualProviderRouter({
    providers: createVisualProviders(),
    stateDir: path.join(workspace, '.provider-router'),
    allowPaidFallback: false,
  });
}

async function extractLastFrame(videoPath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    '-y', '-sseof', '-0.10', '-i', videoPath,
    '-vf', 'scale=1920:1080:flags=lanczos', '-frames:v', '1', outputPath,
  ]);
}

async function loadWorkspaceJob(workspacePath, jobId) {
  const workspace = path.resolve(workspacePath);
  const queue = await readJson(path.join(workspace, 'queue.json'));
  const item = queue.jobs.find(candidate => candidate.jobId === jobId);
  if (!item) throw new Error("Unknown Firefly job '" + jobId + "'.");
  const jobDir = path.join(workspace, item.jobDirectory);
  const job = await readJson(path.join(jobDir, 'job.json'));
  const statePath = path.join(jobDir, 'state.json');
  const state = await readJson(statePath);
  return { workspace, item, jobDir, job, statePath, state };
}

async function invalidateDownstream(workspace, queue, jobId) {
  const index = queue.jobs.findIndex(item => item.jobId === jobId);
  if (index < 0) return;

  for (let cursor = index; cursor < queue.jobs.length; cursor += 1) {
    const item = queue.jobs[cursor];
    const jobDir = path.join(workspace, item.jobDirectory);
    const statePath = path.join(jobDir, 'state.json');

    if (cursor === index) {
      await rm(path.join(workspace, item.lastFrameOutput), { force: true });
      continue;
    }

    await rm(path.join(workspace, item.videoOutput), { force: true });
    await rm(path.join(workspace, item.lastFrameOutput), { force: true });

    const state = await readJson(statePath);
    await writeJson(statePath, {
      ...state,
      status: 'PENDING',
      completedAt: null,
      lastReview: null,
      pendingLearning: null,
      notes: unique([...(state.notes ?? []), 'Invalidated because an upstream job requires another review or retry.']),
    });
  }
}

async function loadLearningMemory(workspace) {
  const memoryPath = path.join(workspace, 'learning-memory.json');
  if (!(await exists(memoryPath))) return { records: [] };
  return readJson(memoryPath);
}

function learnedCorrections(memory, operationType, model) {
  return unique((memory.records ?? [])
    .filter(record => record.operationType === operationType &&
      record.provider === model && record.successfulRetry === true)
    .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
    .map(record => record.correction));
}

async function persistSuccessfulLearning(workspace, pendingLearning) {
  if (!pendingLearning?.failures?.length) return;
  const memory = await loadLearningMemory(workspace);
  const records = [...(memory.records ?? [])];
  for (const failure of pendingLearning.failures) {
    const existing = records.find(record =>
      record.operationType === pendingLearning.operationType &&
      record.provider === pendingLearning.provider &&
      record.failureCode === failure.code &&
      record.correction === failure.correction
    );
    if (existing) {
      existing.uses = (existing.uses ?? 0) + 1;
      existing.successfulRetry = true;
    } else {
      records.push({
        operationType: pendingLearning.operationType,
        provider: pendingLearning.provider,
        failureCode: failure.code,
        correction: failure.correction,
        successfulRetry: true,
        uses: 1,
      });
    }
  }
  await writeJson(path.join(workspace, 'learning-memory.json'), { records });
}

function composeRetryPrompt(job, assessment, memory) {
  const learned = learnedCorrections(memory, assessment.operationType, job.model);
  const corrections = unique([
    ...assessment.failures.map(failure => failure.correction),
    ...learned,
  ]);
  return [
    String(job.prompt || '').trim(),
    '',
    'CORRECTIVE RETRY REQUIREMENTS:',
    ...corrections.map((correction, index) => (index + 1) + '. ' + correction),
    'The retry must preserve the exact source-frame continuity and correct only the failures above.',
  ].join('\n');
}

export async function effectivePromptForFireflyJob(workspacePath, jobId) {
  const loaded = await loadWorkspaceJob(workspacePath, jobId);
  const retryPath = path.join(loaded.jobDir, 'retry-prompt.txt');
  if (loaded.state.status === 'RETRY_REQUIRED' && await exists(retryPath)) {
    return readFile(retryPath, 'utf8');
  }
  const memory = await loadLearningMemory(loaded.workspace);
  const operationType = resolveOperationType(loaded.job);
  const corrections = learnedCorrections(memory, operationType, loaded.job.model);
  if (!corrections.length) return String(loaded.job.prompt || '').trim() + '\n';
  return [
    String(loaded.job.prompt || '').trim(),
    '',
    'LEARNED PRODUCTION RULES:',
    ...corrections.map((correction, index) => (index + 1) + '. ' + correction),
    '',
  ].join('\n');
}

export async function applyExternalRetryDecision(workspacePath, jobId, decision = {}) {
  const loaded = await loadWorkspaceJob(workspacePath, jobId);

  if (loaded.state.status !== 'REVIEW_REQUIRED') {
    throw new Error(
      `External retry decision requires REVIEW_REQUIRED state; current state is ${loaded.state.status}.`,
    );
  }

  const expectedAttempts = Number(decision.expectedAttempts);
  if (!Number.isInteger(expectedAttempts) || expectedAttempts < 1) {
    throw new Error('expectedAttempts must be a positive integer.');
  }
  if (Number(loaded.state.attempts ?? 0) !== expectedAttempts) {
    throw new Error(
      `Stale review decision: expected attempt ${expectedAttempts}, current attempt is ${loaded.state.attempts ?? 0}.`,
    );
  }

  const expectedHash = String(decision.expectedContactSheetSha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error('expectedContactSheetSha256 must be a SHA-256 hex digest.');
  }

  const contactSheetRel = loaded.state.lastReview?.contactSheet;
  if (typeof contactSheetRel !== 'string' || !contactSheetRel) {
    throw new Error('Current review state has no contact sheet to bind the decision to.');
  }

  const contactSheetAbs = path.join(loaded.workspace, contactSheetRel);
  if (!(await exists(contactSheetAbs))) {
    throw new Error('Current review contact sheet is missing: ' + contactSheetRel);
  }

  const contactBytes = await readFile(contactSheetAbs);
  const actualHash = createHash('sha256').update(contactBytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error('Stale review decision: contact sheet SHA-256 no longer matches.');
  }

  const observed = Number(decision.observedStagePercentage);
  if (!Number.isFinite(observed) || observed < 0 || observed > 100) {
    throw new Error('observedStagePercentage must be between 0 and 100.');
  }

  const target = Number(loaded.job.targetStagePercentage);
  if (!(observed > target + DEFAULT_PROGRESS_TOLERANCE)) {
    throw new Error(
      `External retry path currently accepts only clear progress overshoot (> ${target + DEFAULT_PROGRESS_TOLERANCE}%).`,
    );
  }

  const operationType = resolveOperationType(loaded.job);
  const failure = {
    code: 'PROGRESS_OVERSHOOT',
    message: `Observed progress ${observed}% exceeds target ${target}%.`,
    correction: `Stop clearly at ${target}% completion. Leave a visibly unfinished portion for the next segment; do not complete the current operation.`,
  };
  const assessment = {
    contract: 'construction-external-review-v1',
    verdict: 'RETRY',
    reviewSource: 'chatgpt-relay',
    jobId,
    operationType,
    observedStagePercentage: observed,
    targetStagePercentage: target,
    failures: [failure],
    warnings: [],
    blockers: [],
    contactSheet: contactSheetRel,
    contactSheetSha256: actualHash,
    reviewedAttempt: expectedAttempts,
  };

  const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
  await invalidateDownstream(loaded.workspace, queue, jobId);

  const memory = await loadLearningMemory(loaded.workspace);
  const retryPrompt = composeRetryPrompt(loaded.job, assessment, memory);
  await writeFile(path.join(loaded.jobDir, 'retry-prompt.txt'), retryPrompt + '\n', 'utf8');

  const reviewDir = path.join(
    loaded.jobDir,
    'review',
    'attempt-' + String(expectedAttempts).padStart(3, '0'),
  );
  await mkdir(reviewDir, { recursive: true });
  await writeJson(path.join(reviewDir, 'chatgpt-assessment.json'), assessment);

  await writeJson(loaded.statePath, {
    ...loaded.state,
    status: 'RETRY_REQUIRED',
    completedAt: null,
    lastReview: assessment,
    pendingLearning: {
      operationType,
      provider: loaded.job.model,
      failures: [failure],
    },
  });

  return {
    ...assessment,
    retryPrompt,
  };
}

export async function reviewFireflyJob(workspacePath, jobId, providerId) {
  const loaded = await loadWorkspaceJob(workspacePath, jobId);
  const videoPath = path.join(loaded.workspace, loaded.item.videoOutput);
  if (!(await exists(videoPath))) {
    throw new Error('Cannot review job: video output is missing at ' + loaded.item.videoOutput);
  }

  const attempt = Math.max(1, Number(loaded.state.attempts ?? 0) || 1);
  const reviewDir = path.join(
    loaded.jobDir,
    'review',
    'attempt-' + String(attempt).padStart(3, '0'),
  );
  const contact = await buildVideoContactSheet(
    videoPath,
    reviewDir,
    loaded.item.durationSeconds,
  );
  const router = createReviewRouter(loaded.workspace);

  let firstReview;
  try {
    firstReview = await analyzeFiscalImageWithFallback(
      router,
      contact.contactSheet,
      buildFireflyReviewContext(loaded.job),
      {
        compactPath: path.join(reviewDir, 'contact-sheet-compact.png'),
        preferredProviderId: providerId,
      },
    );
  } catch (error) {
    const blockers = providerRouteBlockers(error);
    if (!blockers.length) throw error;

    const result = {
      verdict: 'REOBSERVE',
      jobId,
      providerId: providerId || null,
      blockers,
      providerRoute: error?.routeTrace ?? [],
      contactSheet: path.relative(loaded.workspace, contact.contactSheet),
    };
    await writeJson(path.join(reviewDir, 'assessment.json'), result);
    const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
    await invalidateDownstream(loaded.workspace, queue, jobId);
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      completedAt: null,
      lastReview: result,
    });
    return result;
  }

  const analysis = firstReview.analysis;
  await writeJson(path.join(reviewDir, 'analysis.json'), analysis);

  const assessment = assessNormalizedVisualAnalysis(loaded.job, analysis);
  const assessmentWithProvider = {
    ...assessment,
    providerId: firstReview.providerId,
    providerModel: firstReview.model,
    providerBillingClass: firstReview.billingClass,
    providerTrustedByDefault: firstReview.trustedByDefault,
    providerHealthScore: firstReview.healthScore,
    providerRoute: firstReview.routeTrace,
    providerCacheHit: firstReview.cacheHit,
    contactSheet: path.relative(loaded.workspace, firstReview.imagePath),
    compactRetryUsed: firstReview.usedCompactRetry,
    providerAttempts: firstReview.providerAttempts,
    providerRetryRound: firstReview.providerRetryRound,
  };
  await writeJson(path.join(reviewDir, 'assessment.json'), assessmentWithProvider);

  if (assessment.verdict === 'REOBSERVE') {
    const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
    await invalidateDownstream(loaded.workspace, queue, jobId);
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      completedAt: null,
      lastReview: assessmentWithProvider,
    });
    return assessmentWithProvider;
  }

  if (assessment.verdict === 'RETRY') {
    const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
    await invalidateDownstream(loaded.workspace, queue, jobId);
    const memory = await loadLearningMemory(loaded.workspace);
    const retryPrompt = composeRetryPrompt(loaded.job, assessment, memory);
    await writeFile(path.join(loaded.jobDir, 'retry-prompt.txt'), retryPrompt + '\n', 'utf8');
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'RETRY_REQUIRED',
      attempts: attempt,
      completedAt: null,
      lastReview: assessmentWithProvider,
      pendingLearning: {
        operationType: assessment.operationType,
        provider: loaded.job.model,
        failures: assessment.failures,
      },
    });
    return { ...assessmentWithProvider, retryPrompt };
  }

  const verificationSheet = await buildTerminalComparisonSheet(
    videoPath,
    reviewDir,
    loaded.item.durationSeconds,
  );
  let verificationReview;
  try {
    verificationReview = await analyzeFiscalImageWithFallback(
      router,
      verificationSheet,
      buildFireflyReviewContext(loaded.job) +
        ' SECOND INDEPENDENT VERIFICATION. The image now contains only START on the LEFT and END on the RIGHT. ' +
        'Re-estimate completion from scratch. Focus on how much of the final visible operation result remains unfinished. ' +
        'Do not assume the previous review was correct.',
      {
        compactPath: path.join(reviewDir, 'terminal-verification-compact.png'),
        preferredProviderId: providerId,
        deprioritizeProviderIds: [firstReview.providerId],
      },
    );
  } catch (error) {
    const blockers = unique([
      ...providerRouteBlockers(error),
      'SECOND_VERIFICATION_UNAVAILABLE',
    ]);

    const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
    await invalidateDownstream(loaded.workspace, queue, jobId);
    const result = {
      verdict: 'REOBSERVE',
      jobId,
      providerId: firstReview.providerId,
      blockers,
      providerRoute: error?.routeTrace ?? [],
      firstObservedStagePercentage: assessment.observedStagePercentage,
      verification: true,
    };
    await writeJson(path.join(reviewDir, 'verification-assessment.json'), result);
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      completedAt: null,
      lastReview: result,
    });
    return result;
  }

  const verificationAnalysis = verificationReview.analysis;
  await writeJson(
    path.join(reviewDir, 'verification-analysis.json'),
    verificationAnalysis,
  );
  const verification = assessNormalizedVisualAnalysis(
    loaded.job,
    verificationAnalysis,
  );

  const firstObserved = assessment.observedStagePercentage;
  const secondObserved = verification.observedStagePercentage;
  const disagreement =
    typeof firstObserved === 'number' && typeof secondObserved === 'number'
      ? Math.abs(firstObserved - secondObserved)
      : Number.POSITIVE_INFINITY;

  if (verification.verdict !== 'PASS' || disagreement > 12) {
    const queue = await readJson(path.join(loaded.workspace, 'queue.json'));
    await invalidateDownstream(loaded.workspace, queue, jobId);

    if (verification.verdict === 'RETRY') {
      const memory = await loadLearningMemory(loaded.workspace);
      const retryPrompt = composeRetryPrompt(loaded.job, verification, memory);
      await writeFile(
        path.join(loaded.jobDir, 'retry-prompt.txt'),
        retryPrompt + '\n',
        'utf8',
      );
      const result = {
        ...verification,
        providerId: verificationReview.providerId,
        providerModel: verificationReview.model,
        providerHealthScore: verificationReview.healthScore,
        providerRoute: verificationReview.routeTrace,
        providerCacheHit: verificationReview.cacheHit,
        verification: true,
        firstProviderId: firstReview.providerId,
        firstObservedStagePercentage: firstObserved,
        disagreement,
        retryPrompt,
      };
      await writeJson(
        path.join(reviewDir, 'verification-assessment.json'),
        result,
      );
      await writeJson(loaded.statePath, {
        ...loaded.state,
        status: 'RETRY_REQUIRED',
        attempts: attempt,
        completedAt: null,
        lastReview: result,
        pendingLearning: {
          operationType: verification.operationType,
          provider: loaded.job.model,
          failures: verification.failures,
        },
      });
      return result;
    }

    const result = {
      verdict: 'REOBSERVE',
      jobId,
      providerId: verificationReview.providerId,
      providerModel: verificationReview.model,
      providerHealthScore: verificationReview.healthScore,
      providerRoute: verificationReview.routeTrace,
      providerCacheHit: verificationReview.cacheHit,
      blockers: unique([
        ...(verification.blockers ?? []),
        ...(disagreement > 12 ? ['PROGRESS_ESTIMATES_DISAGREE'] : []),
      ]),
      firstProviderId: firstReview.providerId,
      firstObservedStagePercentage: firstObserved,
      secondObservedStagePercentage: secondObserved,
      disagreement,
      verification: true,
    };
    await writeJson(
      path.join(reviewDir, 'verification-assessment.json'),
      result,
    );
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      completedAt: null,
      lastReview: result,
    });
    return result;
  }

  const lastFramePath = path.join(
    loaded.workspace,
    loaded.item.lastFrameOutput,
  );
  await extractLastFrame(videoPath, lastFramePath);
  await persistSuccessfulLearning(
    loaded.workspace,
    loaded.state.pendingLearning,
  );
  const confirmed = {
    ...assessmentWithProvider,
    verification: {
      verdict: verification.verdict,
      providerId: verificationReview.providerId,
      providerModel: verificationReview.model,
      providerHealthScore: verificationReview.healthScore,
      providerTrustedByDefault: verificationReview.trustedByDefault,
      providerCacheHit: verificationReview.cacheHit,
      providerRoute: verificationReview.routeTrace,
      observedStagePercentage: verification.observedStagePercentage,
      confidence: verification.confidence,
      disagreement,
    },
  };
  await writeJson(
    path.join(reviewDir, 'verification-assessment.json'),
    confirmed.verification,
  );
  await writeJson(loaded.statePath, {
    ...loaded.state,
    status: 'COMPLETE',
    attempts: attempt,
    completedAt: new Date().toISOString(),
    lastReview: confirmed,
    pendingLearning: null,
  });
  return confirmed;
}

export async function ingestAndReviewFireflyJob(workspacePath, jobId, sourceVideoPath, providerId) {
  const loaded = await loadWorkspaceJob(workspacePath, jobId);
  const source = path.resolve(sourceVideoPath);
  if (!(await exists(source))) throw new Error('Source video not found: ' + source);
  const attempt = (Number(loaded.state.attempts ?? 0) || 0) + 1;
  const canonicalVideo = path.join(loaded.workspace, loaded.item.videoOutput);
  await mkdir(path.dirname(canonicalVideo), { recursive: true });
  await copyFile(source, canonicalVideo);

  const archiveDir = path.join(loaded.jobDir, 'review', 'attempt-' + String(attempt).padStart(3, '0'));
  await mkdir(archiveDir, { recursive: true });
  await copyFile(source, path.join(archiveDir, 'candidate.mp4'));
  await rm(path.join(loaded.workspace, loaded.item.lastFrameOutput), { force: true });
  await writeJson(loaded.statePath, {
    ...loaded.state,
    status: 'REVIEW_REQUIRED',
    attempts: attempt,
    completedAt: null,
  });
  return reviewFireflyJob(workspacePath, jobId, providerId);
}
