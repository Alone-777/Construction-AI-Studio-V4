import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { GeminiVisualProvider } from '../server/providers/gemini-visual-provider.mjs';
import { OpenAIVisualProvider } from '../server/providers/openai-visual-provider.mjs';
import { CustomVisualProvider } from '../server/providers/custom-visual-provider.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_PROGRESS_TOLERANCE = 12;
const MIN_PROGRESS_CONFIDENCE = 0.55;

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
    'The supplied image is a chronological contact sheet from ONE generated video clip: LEFT = source/start, CENTER = midpoint, RIGHT = terminal/end.',
    'Judge progress only for the CURRENT OPERATION, never for the whole building.',
    'Current operation type: ' + operationType + '.',
    'Stage starts at ' + job.startStagePercentage + '% and must end at ' + job.targetStagePercentage + '%.',
    'For claims.apparentCompletion, estimate the RIGHT panel completion percentage of this current operation only.',
    'Use LEFT and CENTER only as evidence of progression and continuity.',
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

function providersFromEnv(env = process.env) {
  return [
    new GeminiVisualProvider(env),
    new OpenAIVisualProvider(env),
    new CustomVisualProvider(env),
  ];
}

export function selectConfiguredVisualProvider(providerId, env = process.env) {
  const providers = providersFromEnv(env);
  const selected = providerId
    ? providers.find(provider => provider.id === providerId)
    : providers.find(provider => provider.configured);
  if (!selected) return null;
  if (!selected.configured) return null;
  return selected;
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
  const timestamps = [0.05, Math.max(0.1, duration / 2), Math.max(0.1, duration - 0.12)];
  const frames = ['start.png', 'middle.png', 'end.png'].map(name => path.join(reviewDir, name));

  for (let index = 0; index < frames.length; index += 1) {
    await runFfmpeg([
      '-y', '-ss', timestamps[index].toFixed(3), '-i', videoPath,
      '-frames:v', '1', '-vf', 'scale=640:-2:flags=lanczos', frames[index],
    ]);
  }

  const contactSheet = path.join(reviewDir, 'contact-sheet.png');
  await runFfmpeg([
    '-y', '-i', frames[0], '-i', frames[1], '-i', frames[2],
    '-filter_complex', '[0:v][1:v][2:v]hstack=inputs=3[v]',
    '-map', '[v]', '-frames:v', '1', contactSheet,
  ]);
  return { frames, contactSheet };
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

export async function reviewFireflyJob(workspacePath, jobId, providerId) {
  const loaded = await loadWorkspaceJob(workspacePath, jobId);
  const videoPath = path.join(loaded.workspace, loaded.item.videoOutput);
  if (!(await exists(videoPath))) throw new Error('Cannot review job: video output is missing at ' + loaded.item.videoOutput);

  const attempt = Math.max(1, Number(loaded.state.attempts ?? 0) || 1);
  const reviewDir = path.join(loaded.jobDir, 'review', 'attempt-' + String(attempt).padStart(3, '0'));
  const contact = await buildVideoContactSheet(videoPath, reviewDir, loaded.item.durationSeconds);
  const provider = selectConfiguredVisualProvider(providerId);

  if (!provider) {
    const result = {
      verdict: 'REOBSERVE',
      jobId,
      blockers: ['VISUAL_PROVIDER_UNAVAILABLE'],
      contactSheet: path.relative(loaded.workspace, contact.contactSheet),
    };
    await writeJson(path.join(reviewDir, 'assessment.json'), result);
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      lastReview: result,
      notes: unique([...(loaded.state.notes ?? []), 'Visual provider is not configured.']),
    });
    return result;
  }

  const bytes = await readFile(contact.contactSheet);
  const analysis = await provider.analyze({
    imageData: 'data:image/png;base64,' + bytes.toString('base64'),
    mimeType: 'image/png',
    userContext: buildFireflyReviewContext(loaded.job),
    contract: 'construction-fiscal-v1',
  });
  await writeJson(path.join(reviewDir, 'analysis.json'), analysis);

  const assessment = assessNormalizedVisualAnalysis(loaded.job, analysis);
  const assessmentWithProvider = {
    ...assessment,
    providerId: provider.id,
    contactSheet: path.relative(loaded.workspace, contact.contactSheet),
  };
  await writeJson(path.join(reviewDir, 'assessment.json'), assessmentWithProvider);

  if (assessment.verdict === 'REOBSERVE') {
    await writeJson(loaded.statePath, {
      ...loaded.state,
      status: 'REVIEW_REQUIRED',
      attempts: attempt,
      lastReview: assessmentWithProvider,
    });
    return assessmentWithProvider;
  }

  if (assessment.verdict === 'RETRY') {
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

  const lastFramePath = path.join(loaded.workspace, loaded.item.lastFrameOutput);
  await extractLastFrame(videoPath, lastFramePath);
  await persistSuccessfulLearning(loaded.workspace, loaded.state.pendingLearning);
  await writeJson(loaded.statePath, {
    ...loaded.state,
    status: 'COMPLETE',
    attempts: attempt,
    completedAt: new Date().toISOString(),
    lastReview: assessmentWithProvider,
    pendingLearning: null,
  });
  return assessmentWithProvider;
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
  await writeJson(loaded.statePath, {
    ...loaded.state,
    status: 'REVIEW_REQUIRED',
    attempts: attempt,
    completedAt: null,
  });
  return reviewFireflyJob(workspacePath, jobId, providerId);
}
