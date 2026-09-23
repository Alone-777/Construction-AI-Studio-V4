import {
  ADOBE_FIREFLY_PROMPT_MAX_CHARS,
  assertAnimationPromptWithinLimit,
  compactAnimationPromptField,
  compactAnimationPromptList,
  countAnimationPromptCharacters,
} from '../../video-generation/animation-prompt-budget';
import type { ProviderNeutralPromptArtifactV2 } from './types';
import { evaluateLogisticsPreflight } from './logistics-preflight';

/** Diagnostic preview only; the normal compiler below deliberately ignores logisticsShadow. */
export function compileLogisticsShadowPrompt(
  artifact: ProviderNeutralPromptArtifactV2,
  maxChars = ADOBE_FIREFLY_PROMPT_MAX_CHARS,
): { mode: 'SHADOW'; generationAuthorized: false; prompt: string | null; characterCount: number; reason?: string } {
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return { mode: 'SHADOW', generationAuthorized: false, prompt: null, characterCount: 0, reason: 'LOGISTICS_PROMPT_BUDGET_INVALID' };
  }
  const shadow = artifact.logisticsShadow;
  if (!shadow) return { mode: 'SHADOW', generationAuthorized: false, prompt: null, characterCount: 0, reason: 'LOGISTICS_NOT_AVAILABLE' };
  // Recompute: never trust a caller-modified/stale READY flag.
  const preflight = evaluateLogisticsPreflight(shadow.plan);
  if (preflight.status !== 'READY' || shadow.preflight.status !== 'READY') {
    return { mode: 'SHADOW', generationAuthorized: false, prompt: null, characterCount: 0, reason: preflight.status === 'READY' ? shadow.preflight.status : preflight.status };
  }
  const movements = shadow.plan.movements.map(movement => {
    const resource = shadow.plan.resources.find(item => item.key === movement.resourceKey)!;
    const equipment = movement.equipmentKeys.length ? ' using ' + movement.equipmentKeys.join(', ') : '';
    const handoff = resource.kind === 'MATERIAL'
      ? (movement.transportMethod === 'CART' ? 'rig and guide; no manual heavy lifting → hoist onto cart → roll cart' : 'grip → lift → carry')
        + (movement.method === 'HOIST' ? ' → hoist at destination' : '') + ' → position on support → take staged tool and fasten/seat → return tool → release'
      : movement.method === 'ALREADY_HELD'
        ? 'retain the already held tool; no duplicate pickup' + (movement.steps.some(s => s.kind === 'PLACE') ? '; set it on a reachable support before carrying material or switching tools' : '')
        : 'pick up → carry → place on reachable support → release';
    return `${resource.id} from ${resource.sourceZoneId} to ${movement.destinationZoneId}: ${movement.requiredWorkers} worker(s), transport ${movement.transportMethod}, placement ${movement.method}${equipment}; ${handoff}.`;
  });
  const prompt = [
    '[SHADOW LOGISTICS PREVIEW — NOT AN OFFICIAL JOB]',
    `${shadow.plan.durationSeconds}s 16:9 image-to-video. Source frame is temporal truth.`,
    ...shadow.plan.workerArrivalRoutes.filter(r => r.route.length > 1).map(r => `Worker ${r.workerId} walks continuously along ${r.route.join(' → ')} before work.`),
    ...movements,
    ...artifact.executionBeats.filter(beat => beat.changesMatter).map(beat => beat.instruction),
    progressBlock(artifact),
    'Show stock pickup, continuous contact, transport, supported placement and attachment before release; no floating, teleportation or hidden progress.',
    'Preserve camera, terrain, workers and completed geometry. Stable terminal frame.',
    artifact.forbiddenFutureComponentIds.length ? 'Do not create: ' + artifact.forbiddenFutureComponentIds.join(', ') + '.' : '',
    ...artifact.retryCorrections.map(item => `RETRY ${item.code}: ${item.correction}`),
  ].filter(Boolean).join(' ');
  const count = countAnimationPromptCharacters(prompt);
  // Never slice a handling chain or discard a retry. A split is a proposal, not an inserted Job.
  if (count > Math.min(maxChars, ADOBE_FIREFLY_PROMPT_MAX_CHARS)) {
    return { mode: 'SHADOW', generationAuthorized: false, prompt: null, characterCount: count, reason: 'LOGISTICS_PROMPT_REQUIRES_SPLIT' };
  }
  return { mode: 'SHADOW', generationAuthorized: false, prompt, characterCount: count };
}

export interface CompileAdobeFireflyVideoPromptV2Input {
  artifact: ProviderNeutralPromptArtifactV2;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  maxChars?: number;
}

export interface CompiledAdobeFireflyVideoPromptV2 {
  platform: 'ADOBE_FIREFLY';
  model: string;
  prompt: string;
  characterCount: number;
  maxChars: number;
  sourcePlanId: string;
  sourceSchema: ProviderNeutralPromptArtifactV2['schemaVersion'];
}

function retryBlock(
  corrections: ProviderNeutralPromptArtifactV2['retryCorrections'],
  correctionChars: number,
): string {
  if (!corrections.length) return '';
  return 'RETRY FIXES: ' + corrections.map(item =>
    compactAnimationPromptField(item.code, 36) + ': ' +
    compactAnimationPromptField(item.correction, correctionChars)
  ).join(' | ');
}

function markingEvidence(artifact: ProviderNeutralPromptArtifactV2) {
  return artifact.evidence.find(item =>
    item.relation === 'FOUR_CORNER_STAKES_REMAIN_VISIBLE_AND_FIXED'
    || item.relation === 'MARKED_FOOTPRINT_REMAINS_VISIBLE_AND_ALIGNED'
  );
}

function progressBlock(artifact: ProviderNeutralPromptArtifactV2): string {
  const marking = markingEvidence(artifact);
  if (marking?.relation === 'FOUR_CORNER_STAKES_REMAIN_VISIBLE_AND_FIXED') {
    return 'Physical milestone: install exactly four existing corner stakes and leave the existing rope coiled and unused. Do not begin rope layout or clearing. Stop exactly at the target; never overshoot.';
  }
  if (marking?.relation === 'MARKED_FOOTPRINT_REMAINS_VISIBLE_AND_ALIGNED') {
    return 'Physical milestone: keep the four installed stakes fixed and finish one closed, taut, aligned rope perimeter. Do not begin clearing. Stop exactly at the target; never overshoot.';
  }

  const canonical = artifact.canonicalProgress;
  const parts = [
    'Advance only ' + canonical.beforePercentage + '%→' +
      canonical.targetPercentage + '% of this operation.',
  ];
  if (artifact.physicalProgress) {
    const physical = artifact.physicalProgress;
    parts.push(
      'Observable physical target: ' + physical.from + '→' + physical.target +
      ' ' + physical.unit + ' by ' + physical.metric +
      ' in ' + physical.zoneId + '.',
    );
  }
  parts.push('Stop exactly at the target; never overshoot.');
  return parts.join(' ');
}

function evidenceBlock(artifact: ProviderNeutralPromptArtifactV2, maxChars: number): string {
  const marking = markingEvidence(artifact);
  if (marking) {
    const expected = marking.expected as Record<string, unknown>;
    const terminalDescription = typeof expected?.terminalDescription === 'string'
      ? expected.terminalDescription
      : 'The physical marking milestone remains clearly visible and stable.';
    return 'END EVIDENCE: ' + compactAnimationPromptField(terminalDescription, maxChars) + '.';
  }

  const terminal = artifact.evidence
    .filter(item => item.visibleIn === 'TERMINAL_FRAME')
    .map(item =>
      item.relation + ' expected ' + JSON.stringify(item.expected)
    )
    .join('; ');
  return 'END EVIDENCE: ' + compactAnimationPromptField(
    terminal || 'the physical result remains visible while later work stays unfinished',
    maxChars,
  ) + '.';
}

function causalBeats(
  artifact: ProviderNeutralPromptArtifactV2,
  maxItems: number,
  itemChars: number,
): string {
  const marking = markingEvidence(artifact);
  const sourceBeats = marking
    ? artifact.executionBeats.filter(beat =>
        beat.changesMatter
        || beat.kind === 'ACQUIRE_TOOL'
        || beat.kind === 'INSPECT'
        || beat.kind === 'STOP'
      )
    : artifact.executionBeats;
  const beats = sourceBeats
    .slice(0, maxItems)
    .map((beat, index) =>
      String(index + 1) + ') ' + compactAnimationPromptField(beat.instruction, itemChars)
    );
  return 'PHYSICAL EXECUTION: ' + beats.join(' ');
}

function futureBlock(artifact: ProviderNeutralPromptArtifactV2): string {
  if (!artifact.forbiddenFutureComponentIds.length) return '';
  return 'Do not create future elements: ' + compactAnimationPromptList(
    artifact.forbiddenFutureComponentIds,
    { maxItems: 6, itemChars: 42 },
  ) + '.';
}

export function compileAdobeFireflyVideoPromptV2({
  artifact,
  model = 'KLING_3_0',
  durationSeconds,
  aspectRatio = '16:9',
  maxChars = ADOBE_FIREFLY_PROMPT_MAX_CHARS,
}: CompileAdobeFireflyVideoPromptV2Input): CompiledAdobeFireflyVideoPromptV2 {
  const header = '[ADOBE FIREFLY VIDEO JOB] ' +
    (durationSeconds ? durationSeconds + 's ' : '') +
    aspectRatio + ' ' + model +
    ' image-to-video. Source frame is temporal truth.';
  const scope = artifact.authorizedWorkZoneId
    ? 'Work only in zone ' + artifact.authorizedWorkZoneId + '.'
    : '';

  const full = [
    header,
    scope,
    causalBeats(artifact, 10, 150),
    progressBlock(artifact),
    evidenceBlock(artifact, 300),
    'Every worker/tool/material action must have visible physical causality and a persistent result.',
    'Negative: no pantomime, no magic, no morphing, no teleportation, no hidden progress, no disappearing work, no camera jump, no unexplained material movement.',
    futureBlock(artifact),
    'Preserve camera, terrain/environment, worker identity and every unchanged completed component.',
    'Final frame stable and reusable as the next Job source.',
    retryBlock(artifact.retryCorrections, 190),
  ].filter(Boolean).join(' ');

  let prompt = full;
  if (countAnimationPromptCharacters(prompt) > maxChars) {
    prompt = [
      header,
      scope,
      causalBeats(artifact, 7, 115),
      progressBlock(artifact),
      evidenceBlock(artifact, 200),
      'Visible tool/material causality; every work stroke must leave a persistent physical change.',
      'Negative: no pantomime, no magic, no morphing, no teleportation, no hidden progress, no camera jump.',
      futureBlock(artifact),
      'Preserve camera, terrain and worker identity. Final frame stable.',
      retryBlock(artifact.retryCorrections, 120),
    ].filter(Boolean).join(' ');
  }

  if (countAnimationPromptCharacters(prompt) > maxChars) {
    prompt = [
      header,
      scope,
      causalBeats(artifact, 5, 90),
      progressBlock(artifact),
      evidenceBlock(artifact, 140),
      'Negative: no pantomime, no magic, no morphing, no teleportation, no hidden progress. Preserve continuity.',
      retryBlock(artifact.retryCorrections, 72),
    ].filter(Boolean).join(' ');
  }

  assertAnimationPromptWithinLimit(prompt, maxChars);

  for (const retry of artifact.retryCorrections) {
    if (!prompt.includes(compactAnimationPromptField(retry.code, 36))) {
      throw new Error(
        'Adobe Firefly V2 prompt lost required retry correction: ' + retry.code,
      );
    }
  }

  return {
    platform: 'ADOBE_FIREFLY',
    model,
    prompt,
    characterCount: countAnimationPromptCharacters(prompt),
    maxChars,
    sourcePlanId: artifact.sourcePlanId,
    sourceSchema: artifact.schemaVersion,
  };
}
