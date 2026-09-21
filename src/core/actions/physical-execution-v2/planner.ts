import type { Operation, Stage } from '../../types/scene';
import type { WorldState } from '../../types/world-state';
import { canonicalToolIdV2 } from './affordances';
import type {
  ConstructionIntentV2,
  ObservableProgressContractV2,
  PhysicalActionEdgeV2,
  PhysicalActionNodeV2,
  PhysicalEffectV2,
  PhysicalExecutionPlanV2,
  PhysicalNodeKindV2,
  PhysicalObservationContractV2,
  PhysicalPredicateV2,
  PhysicalProgressMetricV2,
} from './types';

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function predicate(type: PhysicalPredicateV2['type'], fields: Omit<PhysicalPredicateV2, 'type'> = {}): PhysicalPredicateV2 {
  return { type, ...fields };
}

function edge(from: string, to: string, relation: PhysicalActionEdgeV2['relation'] = 'SEQUENCE'): PhysicalActionEdgeV2 {
  return { from, to, relation };
}

function node(input: Omit<PhysicalActionNodeV2, 'sourceEntityIds' | 'targetEntityIds' | 'effects' | 'preconditions' | 'postconditions' | 'evidenceIds'> & {
  sourceEntityIds?: string[];
  targetEntityIds?: string[];
  effects?: PhysicalEffectV2[];
  preconditions?: PhysicalPredicateV2[];
  postconditions?: PhysicalPredicateV2[];
  evidenceIds?: string[];
}): PhysicalActionNodeV2 {
  return {
    ...input,
    sourceEntityIds: unique(input.sourceEntityIds ?? []),
    targetEntityIds: unique(input.targetEntityIds ?? []),
    effects: input.effects ?? [],
    preconditions: input.preconditions ?? [],
    postconditions: input.postconditions ?? [],
    evidenceIds: unique(input.evidenceIds ?? []),
  };
}

export function worldRevisionV2(state: WorldState): string {
  return `world:${state.timestamp}`;
}

export interface ObservableProgressInputV2 {
  metric: PhysicalProgressMetricV2;
  from: number;
  target: number;
  unit: string;
  tolerance?: number;
  regionId?: string;
  confidence?: ObservableProgressContractV2['confidence'];
  basis?: string;
}

export interface PlanStagePhysicalExecutionV2Input {
  sceneId: string;
  operation: Operation;
  stage: Stage;
  worldStateBefore: WorldState;
  previousStagePercentage: number;
  observableProgress?: ObservableProgressInputV2;
  mode?: 'SHADOW' | 'ENFORCE';
}

function inferMethod(physicalAction: string, operationType: string): {
  methodId: string;
  actionKind: PhysicalNodeKindV2;
  contactMode: string;
  forceMode?: string;
  effectType: PhysicalEffectV2['type'];
} {
  const text = normalize(`${operationType} ${physicalAction}`);
  if (/escav|dig|fundac/.test(text)) {
    return { methodId: 'manual-excavation', actionKind: 'DIG', contactMode: 'DIG', forceMode: 'PUSH', effectType: 'SURFACE_REMOVED' };
  }
  if (/remov|limp|prepar|rasp|clear|scrap/.test(text)) {
    return { methodId: 'manual-surface-removal', actionKind: 'SCRAPE', contactMode: 'SCRAPE', forceMode: 'SCRAPE', effectType: 'SURFACE_REMOVED' };
  }
  if (/cort|cut/.test(text)) {
    return { methodId: 'manual-cutting', actionKind: 'CUT', contactMode: 'CUT', forceMode: 'PUSH', effectType: 'STATE_CHANGED' };
  }
  if (/fix|fasten|trava|amarr/.test(text)) {
    return { methodId: 'manual-fastening', actionKind: 'FASTEN', contactMode: 'FASTEN', forceMode: 'STRIKE', effectType: 'COMPONENT_ATTACHED' };
  }
  if (/mont|assemble|base|piso|parede|viga|pilar|cobertura|plataforma|tabuleiro/.test(text)) {
    return { methodId: 'manual-assembly', actionKind: 'FASTEN', contactMode: 'FASTEN', forceMode: 'STRIKE', effectType: 'COMPONENT_ATTACHED' };
  }
  if (/aplic|acabamento|spread|finish/.test(text)) {
    return { methodId: 'manual-application', actionKind: 'PLACE', contactMode: 'APPLY', forceMode: 'PUSH', effectType: 'MATERIAL_APPLIED' };
  }
  if (/posicion|alinhar|position|align/.test(text)) {
    return { methodId: 'manual-positioning', actionKind: 'POSITION', contactMode: 'PLACE', effectType: 'COMPONENT_MOVED' };
  }
  return { methodId: 'manual-physical-work', actionKind: 'APPLY_FORCE', contactMode: 'STRIKE', forceMode: 'PUSH', effectType: 'STATE_CHANGED' };
}

function buildIntent({
  operation,
  stage,
  worldStateBefore,
  previousStagePercentage,
  observableProgress,
  methodId,
}: Omit<PlanStagePhysicalExecutionV2Input, 'sceneId' | 'mode'> & { methodId: string }): ConstructionIntentV2 {
  const targetId = operation.componentId ?? stage.component ?? operation.elements?.[0] ?? operation.id;
  const authorizedRegionId = stage.activeZone || worldStateBefore.activeZone;
  const canonical = {
    fromPercent: previousStagePercentage,
    targetPercent: stage.percentage,
  };
  const observable: ObservableProgressContractV2 = observableProgress
    ? {
        metric: observableProgress.metric,
        from: observableProgress.from,
        target: observableProgress.target,
        unit: observableProgress.unit,
        tolerance: observableProgress.tolerance ?? 0,
        regionId: observableProgress.regionId ?? authorizedRegionId,
        confidence: observableProgress.confidence ?? 'DERIVED',
        basis: observableProgress.basis ?? 'explicit-observable-progress',
      }
    : {
        metric: 'STAGE',
        from: canonical.fromPercent,
        target: canonical.targetPercent,
        unit: '%',
        tolerance: 0,
        regionId: authorizedRegionId,
        confidence: 'LEGACY_DERIVED',
        basis: 'stage-percentage-until-geometry-is-available',
      };

  return {
    schemaVersion: 'construction-intent/2',
    operationId: operation.id,
    targetEntityId: targetId,
    methodId,
    authorizedRegionId,
    officialRevision: worldRevisionV2(worldStateBefore),
    canonicalProgress: canonical,
    observableProgress: observable,
    temporalConstraints: {
      forbiddenFutureComponentIds: unique([
        ...worldStateBefore.futureComponents.filter(id => id !== targetId),
        ...stage.futureElements,
      ]),
      preserveComponentIds: unique(worldStateBefore.existingComponents),
      preserveRegionIds: unique(stage.preservedZones),
    },
  };
}

function physicalEffectFor(
  effectType: PhysicalEffectV2['type'],
  planId: string,
  targetId: string,
  materialId: string | undefined,
  regionId: string,
  targetPercent: number,
): PhysicalEffectV2 {
  const flowId = `${planId}:flow:primary`;
  if (effectType === 'SURFACE_REMOVED') {
    return {
      type: 'SURFACE_REMOVED',
      flowId,
      materialId,
      targetId,
      sourceRegionId: regionId,
      destinationRegionId: `${regionId}:spoil`,
      qualitative: true,
    };
  }
  if (effectType === 'COMPONENT_ATTACHED') {
    return {
      type: 'COMPONENT_ATTACHED',
      flowId,
      componentId: targetId,
      targetId,
      sourceEntityId: materialId ? `material:${materialId}` : 'visible-material-supply',
      sourceRegionId: 'visible-material-supply',
      destinationRegionId: regionId,
      toState: targetPercent >= 100 ? 'COMPLETE' : 'PARTIAL',
      qualitative: true,
    };
  }
  if (effectType === 'MATERIAL_APPLIED') {
    return {
      type: 'MATERIAL_APPLIED',
      flowId,
      materialId,
      targetId,
      sourceRegionId: 'visible-material-supply',
      destinationRegionId: regionId,
      qualitative: true,
    };
  }
  if (effectType === 'COMPONENT_MOVED') {
    return {
      type: 'COMPONENT_MOVED',
      flowId,
      componentId: targetId,
      targetId,
      sourceRegionId: 'visible-material-supply',
      destinationRegionId: regionId,
      qualitative: true,
    };
  }
  return {
    type: 'STATE_CHANGED',
    targetId,
    fromState: 'BEFORE',
    toState: targetPercent >= 100 ? 'COMPLETE' : 'PARTIAL',
    qualitative: true,
  };
}

export function planStagePhysicalExecutionV2(input: PlanStagePhysicalExecutionV2Input): PhysicalExecutionPlanV2 {
  const { sceneId, operation, stage, worldStateBefore, previousStagePercentage } = input;
  const inferred = inferMethod(stage.physicalAction, operation.type);
  const intent = buildIntent({ ...input, methodId: inferred.methodId });
  const actorId = worldStateBefore.character.characterId;
  const toolId = canonicalToolIdV2(stage.tool ?? operation.visualBasis?.tools?.[0]) ?? undefined;
  const materialId = operation.visualBasis?.materials?.[0];
  const regionId = intent.authorizedRegionId;
  const targetId = intent.targetEntityId;
  const planId = `physical-v2:${sceneId}:${operation.id}:${stage.percentage}`;

  const contactEvidence: PhysicalObservationContractV2 = {
    id: `${planId}:evidence:contact`,
    entityIds: unique([toolId, materialId, targetId]),
    relation: 'VISIBLE_CONTACT_CAUSES_WORK',
    metric: 'causal-contact',
    expected: { contactMode: inferred.contactMode, regionId },
    tolerance: 0,
    visibleIn: 'TRAJECTORY',
    mustPersist: false,
  };
  const terminalEvidence: PhysicalObservationContractV2 = {
    id: `${planId}:evidence:terminal`,
    entityIds: unique([targetId, materialId]),
    relation: 'PERSISTENT_PARTIAL_RESULT',
    metric: intent.observableProgress.metric,
    expected: {
      canonicalTargetPercent: intent.canonicalProgress.targetPercent,
      observableTarget: intent.observableProgress.target,
      unit: intent.observableProgress.unit,
      remainingWorkVisible: intent.canonicalProgress.targetPercent < 100,
    },
    tolerance: intent.observableProgress.tolerance,
    visibleIn: 'TERMINAL_FRAME',
    mustPersist: true,
  };

  if (stage.percentage === 0) {
    const nodes: PhysicalActionNodeV2[] = [
      node({ id: `${planId}:approach`, kind: 'APPROACH', actorId, regionId, targetEntityIds: [targetId], preconditions: [predicate('REGION_ACCESSIBLE', { regionId })] }),
      node({ id: `${planId}:inspect`, kind: 'INSPECT', actorId, regionId, targetEntityIds: [targetId], evidenceIds: [terminalEvidence.id] }),
      node({ id: `${planId}:stop`, kind: 'STOP', actorId, regionId, targetEntityIds: [targetId], evidenceIds: [terminalEvidence.id] }),
    ];
    return {
      schemaVersion: 'construction-physical-intelligence/2',
      planId,
      officialBefore: { revision: intent.officialRevision, timestamp: worldStateBefore.timestamp },
      intent,
      nodes,
      edges: [edge(nodes[0].id, nodes[1].id), edge(nodes[1].id, nodes[2].id)],
      evidence: [terminalEvidence],
      constraints: { stopAtTarget: true, requirePersistentEffects: true, allowedAuxiliaryRegions: [], maxSubactions: 12 },
      metadata: { mode: input.mode ?? 'SHADOW', source: 'DIRECT_STAGE_PLANNER', confidence: intent.observableProgress.confidence, limitations: ['Baseline stage carries no construction progress effect.'] },
    };
  }

  const toolPreconditions = toolId ? [predicate('TOOL_AVAILABLE', { toolId })] : [];
  const toolHeld = toolId ? [predicate('TOOL_HELD', { actorId, toolId })] : [];
  const physicalEffect = physicalEffectFor(inferred.effectType, planId, targetId, materialId, regionId, stage.percentage);
  const progressEffect: PhysicalEffectV2 = {
    type: 'PROGRESS_ADVANCED',
    targetId,
    fromPercent: previousStagePercentage,
    toPercent: stage.percentage,
  };

  const nodes: PhysicalActionNodeV2[] = [];
  if (toolId) {
    nodes.push(node({ id: `${planId}:acquire`, kind: 'ACQUIRE_TOOL', actorId, toolId, regionId, preconditions: toolPreconditions, postconditions: [predicate('TOOL_HELD', { actorId, toolId })] }));
  }
  nodes.push(node({ id: `${planId}:approach`, kind: 'APPROACH', actorId, toolId, regionId, targetEntityIds: [targetId], preconditions: [predicate('REGION_ACCESSIBLE', { regionId })] }));
  if (toolId) {
    nodes.push(node({ id: `${planId}:grip`, kind: 'GRIP', actorId, toolId, regionId, preconditions: toolPreconditions, postconditions: [predicate('TOOL_HELD', { actorId, toolId })] }));
  }
  nodes.push(node({ id: `${planId}:position`, kind: 'POSITION', actorId, toolId, regionId, sourceEntityIds: unique([materialId]), targetEntityIds: [targetId], preconditions: toolHeld }));
  nodes.push(node({
    id: `${planId}:contact`,
    kind: 'CONTACT',
    actorId,
    toolId,
    regionId,
    sourceEntityIds: unique([materialId]),
    targetEntityIds: [targetId],
    contact: { mode: inferred.contactMode, required: true, location: regionId },
    preconditions: [...toolHeld, predicate('ACTOR_IN_ZONE', { actorId, regionId })],
    postconditions: [predicate('CONTACT_ESTABLISHED', { targetId, toolId })],
    evidenceIds: [contactEvidence.id],
  }));
  nodes.push(node({
    id: `${planId}:execute`,
    kind: inferred.actionKind,
    actorId,
    toolId,
    regionId,
    sourceEntityIds: unique([materialId]),
    targetEntityIds: [targetId],
    contact: { mode: inferred.contactMode, required: true, location: regionId },
    motion: inferred.forceMode ? { forceMode: inferred.forceMode } : undefined,
    effects: [physicalEffect, progressEffect],
    preconditions: [...toolHeld, predicate('CONTACT_ESTABLISHED', { targetId, toolId })],
    postconditions: [predicate('PROGRESS_AT', { targetId, value: stage.percentage })],
    evidenceIds: [contactEvidence.id, terminalEvidence.id],
  }));
  nodes.push(node({ id: `${planId}:inspect`, kind: 'INSPECT', actorId, toolId, regionId, targetEntityIds: [targetId], evidenceIds: [terminalEvidence.id] }));
  nodes.push(node({ id: `${planId}:stop`, kind: 'STOP', actorId, regionId, targetEntityIds: [targetId], preconditions: [predicate('PROGRESS_AT', { targetId, value: stage.percentage })], evidenceIds: [terminalEvidence.id] }));

  const edges = nodes.slice(1).map((current, index) => edge(nodes[index].id, current.id));
  return {
    schemaVersion: 'construction-physical-intelligence/2',
    planId,
    officialBefore: { revision: intent.officialRevision, timestamp: worldStateBefore.timestamp },
    intent,
    nodes,
    edges,
    evidence: [contactEvidence, terminalEvidence],
    constraints: {
      stopAtTarget: true,
      requirePersistentEffects: true,
      allowedAuxiliaryRegions: physicalEffect.destinationRegionId && physicalEffect.destinationRegionId !== regionId
        ? [physicalEffect.destinationRegionId]
        : [],
      maxSubactions: 12,
    },
    metadata: {
      mode: input.mode ?? 'SHADOW',
      source: 'DIRECT_STAGE_PLANNER',
      confidence: intent.observableProgress.confidence,
      limitations: intent.observableProgress.confidence === 'LEGACY_DERIVED'
        ? ['Physical geometry is not available yet; observable progress is represented as stage percentage.']
        : [],
    },
  };
}
