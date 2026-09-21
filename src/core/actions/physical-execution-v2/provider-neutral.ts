import {
  PROVIDER_NEUTRAL_PROMPT_SCHEMA,
  type PhysicalExecutionPlanV2,
  type PhysicalSimulationReceiptV2,
  type ProviderNeutralPromptArtifactV2,
} from './types';

export interface RetryCorrectionV2 {
  code: string;
  correction: string;
}

export function compileProviderNeutralPromptArtifact(
  plan: PhysicalExecutionPlanV2,
  simulation: PhysicalSimulationReceiptV2,
  retryCorrections: RetryCorrectionV2[] = [],
): ProviderNeutralPromptArtifactV2 {
  if (!simulation.validation.ok || !simulation.projected) {
    throw new Error(
      'Cannot compile provider-neutral prompt artifact from an invalid physical simulation.',
    );
  }

  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  const ordered = simulation.validation.order
    .map(id => byId.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));

  return {
    schemaVersion: PROVIDER_NEUTRAL_PROMPT_SCHEMA,
    sourcePlanId: plan.planId,
    officialBeforeRevision: plan.officialBefore.revision,
    authorizedWorkZoneId: plan.intent.authorizedZoneId,
    executionBeats: ordered.map(node => ({
      id: node.id,
      instruction: node.instruction,
      ...(node.toolId ? { toolId: node.toolId } : {}),
      zoneId: node.zoneId,
    })),
    transformationEffects: ordered.flatMap(node => node.effects),
    evidence: plan.evidence,
    canonicalProgress: plan.intent.canonicalProgress,
    ...(plan.intent.physicalProgress
      ? { physicalProgress: plan.intent.physicalProgress }
      : {}),
    forbiddenFutureComponentIds:
      plan.intent.temporalConstraints.forbiddenFutureComponentIds,
    retryCorrections: retryCorrections
      .filter(item => item.code.trim() && item.correction.trim())
      .map(item => ({
        code: item.code.trim(),
        correction: item.correction.trim(),
      })),
  };
}
