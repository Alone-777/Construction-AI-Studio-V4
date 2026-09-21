import {
  ADOBE_FIREFLY_PROMPT_MAX_CHARS,
  assertAnimationPromptWithinLimit,
  compactAnimationPromptField,
  compactAnimationPromptList,
  countAnimationPromptCharacters,
} from '../../video-generation/animation-prompt-budget';
import type { ProviderNeutralPromptArtifactV2 } from './types';

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

function progressBlock(artifact: ProviderNeutralPromptArtifactV2): string {
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
  const beats = artifact.executionBeats
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

  const full = [
    header,
    causalBeats(artifact, 10, 150),
    progressBlock(artifact),
    evidenceBlock(artifact, 300),
    'Every worker/tool/material action must have visible physical causality and a persistent result.',
    'No pantomime, magic, morphing, teleportation, hidden progress, disappearing work, camera jump or unexplained material movement.',
    futureBlock(artifact),
    'Preserve camera, terrain/environment, worker identity and every unchanged completed component.',
    'Final frame stable and reusable as the next Job source.',
    retryBlock(artifact.retryCorrections, 190),
  ].filter(Boolean).join(' ');

  let prompt = full;
  if (countAnimationPromptCharacters(prompt) > maxChars) {
    prompt = [
      header,
      causalBeats(artifact, 7, 115),
      progressBlock(artifact),
      evidenceBlock(artifact, 200),
      'Visible tool/material causality; every work stroke must leave a persistent physical change.',
      'No pantomime, magic, morphing, teleportation, hidden progress or camera jump.',
      futureBlock(artifact),
      'Preserve camera, terrain and worker identity. Final frame stable.',
      retryBlock(artifact.retryCorrections, 120),
    ].filter(Boolean).join(' ');
  }

  if (countAnimationPromptCharacters(prompt) > maxChars) {
    prompt = [
      header,
      causalBeats(artifact, 5, 90),
      progressBlock(artifact),
      evidenceBlock(artifact, 140),
      'No pantomime, magic, morphing, teleportation or hidden progress. Preserve continuity.',
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
