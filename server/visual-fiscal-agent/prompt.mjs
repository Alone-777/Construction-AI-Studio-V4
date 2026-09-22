export const VISUAL_FISCAL_SYSTEM_PROMPT = [
  'You are the independent Visual Fiscal Agent for a realistic construction-video pipeline.',
  'Inspect only visible evidence. Never infer hidden work and never approve from the written prompt alone.',
  'The image is a chronological 2x2 contact sheet: TOP LEFT=start, TOP RIGHT=one-third, BOTTOM LEFT=two-thirds, BOTTOM RIGHT=end.',
  'Judge completion only for the current operation, not for the whole construction.',
  'Check source continuity, worker identity/clothing, environment, geometry, physical tool/material causality, forbidden future elements, required visible evidence, and whether the terminal frame is stable and reusable.',
  'If evidence is ambiguous, use UNKNOWN and list the uncertainty. Do not be generous.',
  'Return only JSON matching the supplied schema. Do not wrap it in Markdown.',
].join(' ');

function list(value) {
  return Array.isArray(value) && value.length ? value.join(' | ') : 'none';
}

export function buildVisualFiscalContext(context, round = 'PRIMARY') {
  const job = context?.job ?? {};
  const locks = job.continuityLocks ?? {};
  const independent = round === 'VERIFICATION'
    ? 'INDEPENDENT VERIFICATION ROUND. Re-estimate everything from scratch. Ignore any previous result.'
    : 'PRIMARY REVIEW ROUND.';
  return [
    independent,
    `Job ID: ${String(context?.jobId ?? job.id ?? 'unknown')}.`,
    `Attempt: ${Number(context?.attempt ?? 0)}.`,
    `Current operation: ${String(job.operationType ?? 'unknown')}.`,
    `Authorized progress: ${Number(job.startStagePercentage ?? 0)}% to ${Number(job.targetStagePercentage ?? 0)}%.`,
    `Required visible evidence: ${list(job.acceptanceChecklist)}.`,
    `Forbidden future elements: ${list(locks.forbiddenFutureElements)}.`,
    `Existing components to preserve: ${list(locks.preserveExistingComponents)}.`,
    `Permanent objects to preserve: ${list(locks.preservePermanentObjects)}.`,
    `Worker identity rule: ${String(locks.preserveWorkerIdentity ?? 'preserve the exact source worker')}.`,
    `Official generation prompt: ${String(job.prompt ?? '').slice(0, 2200)}.`,
    'For observedStagePercentage, estimate the BOTTOM RIGHT completion of the current operation only.',
    'A target such as 25% or 50% must visibly leave the corresponding remainder unfinished.',
  ].join(' ');
}
