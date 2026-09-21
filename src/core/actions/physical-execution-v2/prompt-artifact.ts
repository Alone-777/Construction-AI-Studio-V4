import type {
  CompiledAdobeFireflyPromptV2,
  PhysicalActionNodeV2,
  PhysicalExecutionPlanV2,
  PhysicalSimulationReceiptV2,
  ProviderNeutralPromptArtifactV2,
} from './types';
import { topologicalOrderV2 } from './validators';

export const ADOBE_FIREFLY_PROMPT_MAX_CHARS_V2 = 1800;

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value: string, maxChars: number): string {
  const text = normalize(value);
  if (Array.from(text).length <= maxChars) return text;
  const sliced = Array.from(text).slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return `${clean || sliced.trimEnd()}…`;
}

function targetLabel(node: PhysicalActionNodeV2): string {
  return node.targetEntityIds[0] ?? 'the active target';
}

function sourceLabel(node: PhysicalActionNodeV2): string {
  return node.sourceEntityIds[0] ?? 'the visible material';
}

export function semanticBeatTextV2(node: PhysicalActionNodeV2): string {
  const tool = node.toolId ?? 'the required tool';
  const target = targetLabel(node);
  switch (node.kind) {
    case 'ACQUIRE_TOOL': return `Pick up the visible ${tool}.`;
    case 'APPROACH': return `Move into ${node.regionId} without changing unrelated construction.`;
    case 'GRIP': return `Grip ${tool} securely before the work stroke.`;
    case 'POSITION': return `Position ${tool} and ${sourceLabel(node)} at ${target}.`;
    case 'CONTACT': return `Make clear ${String(node.contact?.mode || 'physical').toLowerCase()} contact between ${tool} and ${target}.`;
    case 'APPLY_FORCE': return `Apply visible force through ${tool}; the contact must cause the target to change.`;
    case 'SCRAPE': return `Scrape the bounded target with ${tool}; each stroke must visibly remove surface material.`;
    case 'DIG': return `Drive ${tool} into the bounded target, lift material out and keep the excavation change visible.`;
    case 'CUT': return `Cut ${target} with ${tool} through continuous visible contact.`;
    case 'LIFT': return `Lift ${sourceLabel(node)} visibly from its source before moving it.`;
    case 'MOVE_MATERIAL': return `Move ${sourceLabel(node)} continuously to its declared destination.`;
    case 'PLACE': return `Place ${sourceLabel(node)} onto ${target} with visible hand/tool control.`;
    case 'FASTEN': return `Align and visibly fasten ${target} using ${tool}; it must remain fixed afterward.`;
    case 'RELEASE': return `Release the moved material only after it reaches the declared destination.`;
    case 'SETTLE': return `Let the physical result settle and remain visible; do not revert it.`;
    case 'INSPECT': return `Pause and show the changed target together with the clearly unfinished remainder.`;
    case 'STOP': return `Stop construction at the canonical target and do not begin the next operation.`;
    default: return `Physically execute ${node.kind} on ${target}.`;
  }
}

export function physicalPlanToPromptArtifactV2({
  plan,
  simulation,
  continuity = {},
}: {
  plan: PhysicalExecutionPlanV2;
  simulation: PhysicalSimulationReceiptV2;
  continuity?: {
    preserveCamera?: boolean;
    preserveTerrain?: boolean;
    preserveWorkerIdentity?: boolean;
  };
}): ProviderNeutralPromptArtifactV2 {
  const ordered = topologicalOrderV2(plan).order
    .map(id => plan.nodes.find(node => node.id === id))
    .filter((node): node is PhysicalActionNodeV2 => Boolean(node));
  return {
    schemaVersion: 'provider-neutral-prompt-artifact/2',
    sourcePlanId: plan.planId,
    officialBeforeRevision: plan.officialBefore.revision,
    executionBeats: ordered.map(node => ({
      nodeId: node.id,
      kind: node.kind,
      text: semanticBeatTextV2(node),
      required: ['CONTACT', 'SCRAPE', 'DIG', 'CUT', 'FASTEN', 'PLACE', 'APPLY_FORCE', 'STOP'].includes(node.kind),
    })),
    progress: {
      ...plan.intent.canonicalProgress,
      observable: simulation.observableProgress,
    },
    terminalEvidence: plan.evidence.filter(item => item.visibleIn === 'TERMINAL_FRAME'),
    trajectoryEvidence: plan.evidence.filter(item => item.visibleIn === 'TRAJECTORY'),
    forbiddenFutureComponentIds: [...plan.intent.temporalConstraints.forbiddenFutureComponentIds],
    continuity: {
      preserveCamera: continuity.preserveCamera !== false,
      preserveTerrain: continuity.preserveTerrain !== false,
      preserveWorkerIdentity: continuity.preserveWorkerIdentity !== false,
    },
  };
}

function count(value: string): number {
  return Array.from(value).length;
}

function retryText(
  retryCorrections: Array<{ code: string; correction: string }>,
  correctionChars: number,
): string {
  if (!retryCorrections.length) return '';
  return `RETRY FIXES: ${retryCorrections.map(item => `${clip(item.code, 34)}: ${clip(item.correction, correctionChars)}`).join(' | ')}`;
}

function evidenceText(artifact: ProviderNeutralPromptArtifactV2, maxChars: number): string {
  const terminal = artifact.terminalEvidence.map(item =>
    `${item.relation}: ${JSON.stringify(item.expected)}`,
  ).join('; ');
  return clip(terminal || 'changed target persists and unfinished work remains visible', maxChars);
}

export function compileAdobeFireflyVideoPromptV2({
  artifact,
  model,
  durationSeconds,
  aspectRatio = '16:9',
  retryCorrections = [],
  maxChars = ADOBE_FIREFLY_PROMPT_MAX_CHARS_V2,
}: {
  artifact: ProviderNeutralPromptArtifactV2;
  model: string;
  durationSeconds: number;
  aspectRatio?: string;
  retryCorrections?: Array<{ code: string; correction: string }>;
  maxChars?: number;
}): CompiledAdobeFireflyPromptV2 {
  const progress = artifact.progress;
  const beats = artifact.executionBeats.map(beat => beat.text);
  const future = artifact.forbiddenFutureComponentIds.join(', ');
  const fullParts = [
    `[ANIMATION JOB] ${durationSeconds}s ${aspectRatio} ${model} image-to-video in Adobe Firefly. Source frame is temporal truth.`,
    `PHYSICAL EXECUTION: ${beats.join(' ')}`,
    `Advance only ${progress.fromPercent}%→${progress.targetPercent}% of this Job. Observable proof: ${progress.observable.from}→${progress.observable.target} ${progress.observable.unit} by ${progress.observable.metric}.`,
    `END EVIDENCE: ${evidenceText(artifact, 300)}.`,
    'Every tool movement must cause a persistent visible physical change. No pantomime, magic, morphing, teleportation, hidden progress, disappearing work or unexplained material movement.',
    artifact.continuity.preserveCamera || artifact.continuity.preserveTerrain || artifact.continuity.preserveWorkerIdentity
      ? 'Preserve camera, terrain/environment and worker identity unless the plan explicitly changes them.'
      : '',
    future ? `Do not create future elements: ${future}.` : '',
    'Stop exactly at the target. Final frame stable and reusable for the next Job.',
    retryText(retryCorrections, 190),
  ].filter(Boolean);
  let prompt = fullParts.join(' ');

  if (count(prompt) > maxChars) {
    const requiredBeats = artifact.executionBeats
      .filter(beat => beat.required)
      .map(beat => clip(beat.text, 120));
    const compactParts = [
      `[ANIMATION JOB] ${durationSeconds}s ${aspectRatio} ${model} in Adobe Firefly. Source frame is temporal truth.`,
      `PHYSICAL EXECUTION: ${requiredBeats.join(' ')}`,
      `Advance only ${progress.fromPercent}%→${progress.targetPercent}%. Observable target ${progress.observable.target} ${progress.observable.unit} (${progress.observable.metric}).`,
      `VISIBLE END: ${evidenceText(artifact, 180)}.`,
      'Visible tool/material causality. No pantomime, magic, morphing, teleportation or hidden progress.',
      'Preserve camera, terrain and worker identity. Stop at target; leave future work absent and final frame stable.',
      retryText(retryCorrections, 120),
    ].filter(Boolean);
    prompt = compactParts.join(' ');
  }

  if (count(prompt) > maxChars && retryCorrections.length) {
    const minimumRetry = retryText(retryCorrections, 64);
    const essentialBeats = artifact.executionBeats
      .filter(beat => beat.required)
      .slice(0, 5)
      .map(beat => clip(beat.text, 90));
    prompt = [
      `[ANIMATION JOB] ${durationSeconds}s ${aspectRatio} ${model}. Source frame is temporal truth.`,
      `Execute visibly: ${essentialBeats.join(' ')}`,
      `Only ${progress.fromPercent}%→${progress.targetPercent}%; stop exactly there.`,
      `END EVIDENCE: ${evidenceText(artifact, 130)}.`,
      'No pantomime, magic, morphing, teleportation or hidden progress. Preserve continuity.',
      minimumRetry,
    ].filter(Boolean).join(' ');
  }

  if (count(prompt) > maxChars) {
    throw new Error(`Adobe Firefly prompt exceeds ${maxChars} characters without safely dropping required execution/retry constraints.`);
  }
  for (const retry of retryCorrections) {
    if (!prompt.includes(clip(retry.code, 34))) {
      throw new Error(`Adobe Firefly prompt lost required retry correction ${retry.code}.`);
    }
  }
  return {
    platform: 'ADOBE_FIREFLY',
    model,
    prompt,
    characterCount: count(prompt),
    maxChars,
    sourceArtifactSchema: 'provider-neutral-prompt-artifact/2',
  };
}
