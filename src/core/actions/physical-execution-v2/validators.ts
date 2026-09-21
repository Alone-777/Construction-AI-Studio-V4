import type { WorldState } from '../../types/world-state';
import { resolveMaterialAffordanceV2, resolveToolAffordanceV2, toolSupportsNodeV2 } from './affordances';
import type {
  PhysicalActionNodeV2,
  PhysicalEffectV2,
  PhysicalExecutionPlanV2,
  PhysicalValidationIssueV2,
  PhysicalValidationReportV2,
} from './types';

function issue(
  severity: PhysicalValidationIssueV2['severity'],
  code: string,
  message: string,
  nodeId?: string,
  details?: Record<string, unknown>,
): PhysicalValidationIssueV2 {
  return { severity, code, message, ...(nodeId ? { nodeId } : {}), ...(details ? { details } : {}) };
}

function officialRevision(state: WorldState): string {
  return `world:${state.timestamp}`;
}

function toolExists(state: WorldState, toolId: string): boolean {
  const normalized = resolveToolAffordanceV2(toolId)?.id ?? toolId;
  return state.tools.some(tool => {
    const candidate = resolveToolAffordanceV2(tool.toolId)?.id ?? tool.toolId;
    return candidate === normalized;
  });
}

function componentExists(state: WorldState, id: string): boolean {
  return state.existingComponents.includes(id) || state.partialComponents.includes(id) || state.futureComponents.includes(id);
}

function physicalEffects(node: PhysicalActionNodeV2): PhysicalEffectV2[] {
  return node.effects.filter(effect => effect.type !== 'PROGRESS_ADVANCED');
}

function graph(plan: PhysicalExecutionPlanV2) {
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  const invalidEdges: Array<{ from: string; to: string }> = [];
  for (const edge of plan.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      invalidEdges.push({ from: edge.from, to: edge.to });
      continue;
    }
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
  }
  return { nodes, outgoing, incoming, invalidEdges };
}

export function topologicalOrderV2(plan: PhysicalExecutionPlanV2): { order: string[]; cyclic: boolean; invalidEdges: Array<{ from: string; to: string }> } {
  const indexed = graph(plan);
  const indegree = new Map<string, number>();
  for (const id of indexed.nodes.keys()) indegree.set(id, indexed.incoming.get(id)?.length ?? 0);
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of indexed.outgoing.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  return { order, cyclic: order.length !== indexed.nodes.size, invalidEdges: indexed.invalidEdges };
}

export function validateSchemaV2(plan: PhysicalExecutionPlanV2): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  if (plan.schemaVersion !== 'construction-physical-intelligence/2') issues.push(issue('BLOCKER', 'PLAN_SCHEMA_INVALID', 'PhysicalExecutionPlan V2 schema is required.'));
  if (!plan.planId) issues.push(issue('BLOCKER', 'PLAN_ID_MISSING', 'Plan id is required.'));
  if (!plan.officialBefore?.revision) issues.push(issue('BLOCKER', 'OFFICIAL_REVISION_MISSING', 'Plan must pin an OFFICIAL revision.'));
  if (!plan.intent?.operationId || !plan.intent?.targetEntityId) issues.push(issue('BLOCKER', 'INTENT_MISSING', 'ConstructionIntent V2 is required.'));
  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) issues.push(issue('BLOCKER', 'NODES_MISSING', 'Plan must contain typed physical nodes.'));
  const ids = plan.nodes.map(node => node.id);
  if (new Set(ids).size !== ids.length) issues.push(issue('BLOCKER', 'NODE_ID_DUPLICATE', 'Physical action node ids must be unique.'));
  return issues;
}

export function validateGraphV2(plan: PhysicalExecutionPlanV2): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  const indexed = graph(plan);
  const topo = topologicalOrderV2(plan);
  for (const invalid of topo.invalidEdges) {
    issues.push(issue('BLOCKER', 'EDGE_NODE_MISSING', `Graph edge ${invalid.from} -> ${invalid.to} references a missing node.`, undefined, invalid));
  }
  if (topo.cyclic) issues.push(issue('BLOCKER', 'GRAPH_CYCLE', 'Physical execution graph contains a cycle.'));
  if (!topo.cyclic && topo.order.length) {
    const root = topo.order[0];
    for (const node of plan.nodes) {
      if (node.id !== root && (indexed.incoming.get(node.id)?.length ?? 0) === 0) {
        issues.push(issue('BLOCKER', 'NODE_UNREACHABLE', `Node ${node.id} is disconnected from the execution chain.`, node.id));
      }
    }
  }
  const evidenceIds = new Set(plan.evidence.map(item => item.id));
  for (const node of plan.nodes) {
    for (const evidenceId of node.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(issue('BLOCKER', 'EVIDENCE_REFERENCE_MISSING', `Node ${node.id} references missing evidence ${evidenceId}.`, node.id));
      }
    }
    const effects = physicalEffects(node);
    if (effects.length > 0 && node.evidenceIds.length === 0) {
      issues.push(issue('BLOCKER', 'EFFECT_WITHOUT_EVIDENCE', `Node ${node.id} has a physical effect but no evidence contract.`, node.id));
    }
    const requiresContact = effects.some(effect => ['SURFACE_REMOVED', 'MATERIAL_MOVED', 'COMPONENT_ATTACHED', 'MATERIAL_APPLIED', 'MATERIAL_DEPOSITED', 'STATE_CHANGED'].includes(effect.type));
    const predecessors = indexed.incoming.get(node.id) ?? [];
    const precedingKinds = predecessors.map(id => indexed.nodes.get(id)?.kind);
    if (requiresContact && !node.contact && !precedingKinds.includes('CONTACT')) {
      issues.push(issue('BLOCKER', 'EFFECT_WITHOUT_CONTACT', `Node ${node.id} changes physical state without a contact contract.`, node.id));
    }
    if (node.kind === 'APPLY_FORCE' && !precedingKinds.includes('CONTACT')) {
      issues.push(issue('BLOCKER', 'FORCE_BEFORE_CONTACT', `APPLY_FORCE node ${node.id} must follow CONTACT.`, node.id));
    }
    if (node.kind === 'FASTEN' && !precedingKinds.some(kind => kind === 'POSITION' || kind === 'CONTACT')) {
      issues.push(issue('BLOCKER', 'FASTEN_WITHOUT_POSITION', `FASTEN node ${node.id} must follow positioning/contact.`, node.id));
    }
    if (node.kind === 'RELEASE' && !precedingKinds.some(kind => ['LIFT', 'MOVE_MATERIAL', 'PLACE'].includes(String(kind)))) {
      issues.push(issue('BLOCKER', 'RELEASE_BEFORE_MOVE', `RELEASE node ${node.id} must follow a material move/placement.`, node.id));
    }
  }
  const hasProgress = plan.nodes.some(node => node.effects.some(effect => effect.type === 'PROGRESS_ADVANCED'));
  const hasPhysical = plan.nodes.some(node => physicalEffects(node).length > 0);
  if (hasProgress && !hasPhysical) issues.push(issue('BLOCKER', 'PROGRESS_WITHOUT_PHYSICAL_EFFECT', 'Canonical progress cannot advance without a physical effect.'));
  return issues;
}

export function validateTemporalV2(plan: PhysicalExecutionPlanV2, official: WorldState): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  if (plan.officialBefore.revision !== officialRevision(official)) {
    issues.push(issue('BLOCKER', 'OFFICIAL_REVISION_MISMATCH', 'Plan was created from a different OFFICIAL revision.', undefined, {
      planned: plan.officialBefore.revision,
      actual: officialRevision(official),
    }));
  }
  const allowedRegions = new Set([plan.intent.authorizedRegionId, ...plan.constraints.allowedAuxiliaryRegions]);
  for (const node of plan.nodes) {
    if (node.regionId && !allowedRegions.has(node.regionId)) {
      issues.push(issue('BLOCKER', 'UNAUTHORIZED_WORK_REGION', `Node ${node.id} operates outside the authorized work region.`, node.id, { regionId: node.regionId }));
    }
    for (const effect of node.effects) {
      const componentId = effect.componentId;
      if (componentId && componentId !== plan.intent.targetEntityId && plan.intent.temporalConstraints.forbiddenFutureComponentIds.includes(componentId)) {
        issues.push(issue('BLOCKER', 'FUTURE_COMPONENT_CREATED', `Future component ${componentId} cannot appear during this Job.`, node.id));
      }
    }
  }
  for (const preserved of plan.intent.temporalConstraints.preserveComponentIds) {
    if (!official.existingComponents.includes(preserved)) {
      issues.push(issue('WARNING', 'PRESERVE_COMPONENT_NOT_IN_OFFICIAL', `Preserved component ${preserved} is not present in OFFICIAL.`));
    }
  }
  return issues;
}

export function validateProgressV2(plan: PhysicalExecutionPlanV2): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  const canonical = plan.intent.canonicalProgress;
  if (canonical.fromPercent < 0 || canonical.targetPercent > 100 || canonical.targetPercent < canonical.fromPercent) {
    issues.push(issue('BLOCKER', 'CANONICAL_PROGRESS_INVALID', 'Canonical Job progress must stay within 0-100 and never move backwards.'));
  }
  const observable = plan.intent.observableProgress;
  if (!Number.isFinite(observable.from) || !Number.isFinite(observable.target) || observable.target < observable.from) {
    issues.push(issue('BLOCKER', 'OBSERVABLE_PROGRESS_INVALID', 'Observable physical progress must be numeric and monotonic.'));
  }
  if (observable.metric !== 'STAGE' && observable.unit === '%') {
    issues.push(issue('BLOCKER', 'PHYSICAL_METRIC_PERCENT_MIXED', 'A physical metric such as AREA/VOLUME/LENGTH cannot use % as its unit.'));
  }
  const progressEffects = plan.nodes.flatMap(node => node.effects.map(effect => ({ node, effect }))).filter(item => item.effect.type === 'PROGRESS_ADVANCED');
  if (canonical.targetPercent > canonical.fromPercent && progressEffects.length === 0) {
    issues.push(issue('BLOCKER', 'PROGRESS_EFFECT_MISSING', 'Advancing Jobs require an explicit PROGRESS_ADVANCED effect.'));
  }
  for (const { node, effect } of progressEffects) {
    if (effect.fromPercent !== canonical.fromPercent || effect.toPercent !== canonical.targetPercent) {
      const overshoot = Number(effect.toPercent) > canonical.targetPercent;
      issues.push(issue('BLOCKER', overshoot ? 'PROGRESS_OVERSHOOT' : 'PROGRESS_EFFECT_MISMATCH', `Progress effect on ${node.id} does not match the canonical Job segment.`, node.id, {
        expectedFrom: canonical.fromPercent,
        expectedTo: canonical.targetPercent,
        actualFrom: effect.fromPercent,
        actualTo: effect.toPercent,
      }));
    }
  }
  return issues;
}

export function validateConservationV2(plan: PhysicalExecutionPlanV2): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  const flows = new Map<string, PhysicalEffectV2[]>();
  for (const node of plan.nodes) {
    for (const effect of physicalEffects(node)) {
      if (effect.flowId) {
        const entries = flows.get(effect.flowId) ?? [];
        entries.push(effect);
        flows.set(effect.flowId, entries);
      }
      if (['SURFACE_REMOVED', 'MATERIAL_MOVED', 'MATERIAL_APPLIED', 'MATERIAL_DEPOSITED', 'COMPONENT_MOVED'].includes(effect.type)) {
        if (!effect.sourceRegionId && effect.type !== 'MATERIAL_DEPOSITED') {
          issues.push(issue('BLOCKER', 'MATERIAL_SOURCE_MISSING', `${effect.type} requires a physical source region.`, node.id));
        }
        if (!effect.destinationRegionId) {
          issues.push(issue('BLOCKER', 'MATERIAL_DESTINATION_MISSING', `${effect.type} requires a physical destination region.`, node.id));
        }
      }
      if (effect.type === 'COMPONENT_ATTACHED' && !effect.sourceEntityId && !effect.materialId) {
        issues.push(issue('BLOCKER', 'ATTACHED_WITHOUT_SOURCE', 'Attached component must have a material/component source.', node.id));
      }
    }
  }
  for (const [flowId, entries] of flows) {
    const quantities = entries.filter(effect => effect.quantity).map(effect => effect.quantity!);
    if (quantities.length > 1) {
      const units = new Set(quantities.map(quantity => quantity.unit));
      if (units.size > 1) issues.push(issue('BLOCKER', 'CONSERVATION_UNIT_MISMATCH', `Flow ${flowId} mixes incompatible units.`));
      const values = quantities.map(quantity => quantity.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const tolerance = Math.max(1e-9, max * 0.05);
      if (max - min > tolerance) issues.push(issue('BLOCKER', 'CONSERVATION_QUANTITY_MISMATCH', `Flow ${flowId} does not conserve quantity within tolerance.`, undefined, { values }));
    }
  }
  return issues;
}

export function validateAffordancesV2(plan: PhysicalExecutionPlanV2, official: WorldState): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  for (const node of plan.nodes) {
    if (!node.toolId) continue;
    const tool = resolveToolAffordanceV2(node.toolId);
    if (!tool) {
      issues.push(issue('BLOCKER', 'TOOL_AFFORDANCE_UNKNOWN', `No affordance is defined for tool ${node.toolId}.`, node.id));
      continue;
    }
    if (!toolExists(official, node.toolId)) {
      issues.push(issue(plan.metadata.mode === 'ENFORCE' ? 'BLOCKER' : 'WARNING', 'TOOL_NOT_IN_OFFICIAL', `Tool ${node.toolId} is not present in the OFFICIAL inventory.`, node.id));
    }
    const effectTypes = node.effects.map(effect => effect.type);
    if (!toolSupportsNodeV2(tool, node.kind, node.contact?.mode, effectTypes)) {
      issues.push(issue('BLOCKER', 'TOOL_AFFORDANCE_INVALID', `Tool ${node.toolId} cannot perform ${node.kind} with the requested contact/effects.`, node.id, { effectTypes }));
    }
    for (const source of node.sourceEntityIds) {
      const material = resolveMaterialAffordanceV2(source);
      if (!material) continue;
      if (!material.compatibleTools.includes(tool.id)) {
        issues.push(issue('BLOCKER', 'TOOL_MATERIAL_INCOMPATIBLE', `Tool ${tool.id} is incompatible with ${source}.`, node.id));
      }
      for (const effect of physicalEffects(node)) {
        if (!material.supportedEffects.includes(effect.type) && effect.type !== 'STATE_CHANGED') {
          issues.push(issue('BLOCKER', 'MATERIAL_EFFECT_INCOMPATIBLE', `Material ${source} does not support ${effect.type}.`, node.id));
        }
      }
    }
  }
  return issues;
}

export function validateObservabilityV2(plan: PhysicalExecutionPlanV2): PhysicalValidationIssueV2[] {
  const issues: PhysicalValidationIssueV2[] = [];
  const evidenceIds = new Set(plan.evidence.map(item => item.id));
  for (const node of plan.nodes) {
    if (physicalEffects(node).length > 0 && node.evidenceIds.every(id => !evidenceIds.has(id))) {
      issues.push(issue('BLOCKER', 'OBSERVATION_MISSING', `Physical effect node ${node.id} has no valid observation contract.`, node.id));
    }
  }
  if (plan.intent.canonicalProgress.targetPercent > plan.intent.canonicalProgress.fromPercent) {
    const terminal = plan.evidence.some(item => item.visibleIn === 'TERMINAL_FRAME' && item.mustPersist);
    if (!terminal) issues.push(issue('BLOCKER', 'TERMINAL_EVIDENCE_MISSING', 'Advancing Jobs require persistent terminal-frame evidence.'));
    const trajectory = plan.evidence.some(item => item.visibleIn === 'TRAJECTORY');
    if (!trajectory) issues.push(issue('BLOCKER', 'TRAJECTORY_EVIDENCE_MISSING', 'Advancing Jobs require visible trajectory/contact evidence.'));
  }
  return issues;
}

export function validatePhysicalExecutionPlanV2(plan: PhysicalExecutionPlanV2, official: WorldState): PhysicalValidationReportV2 {
  const topo = topologicalOrderV2(plan);
  const issues = [
    ...validateSchemaV2(plan),
    ...validateGraphV2(plan),
    ...validateTemporalV2(plan, official),
    ...validateProgressV2(plan),
    ...validateConservationV2(plan),
    ...validateAffordancesV2(plan, official),
    ...validateObservabilityV2(plan),
  ];
  const blockers = issues.filter(item => item.severity === 'BLOCKER');
  const warnings = issues.filter(item => item.severity === 'WARNING');
  return {
    ok: blockers.length === 0,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    issues,
    topologicalOrder: topo.order,
  };
}

export function evaluatePredicateV2(
  predicate: PhysicalActionNodeV2['preconditions'][number],
  state: WorldState,
  runtime: { actorZone: string; heldToolId: string | null; contactedTargets: Set<string>; progressPercent: number },
): boolean {
  switch (predicate.type) {
    case 'ACTOR_IN_ZONE': return runtime.actorZone === predicate.regionId;
    case 'TOOL_AVAILABLE': return Boolean(predicate.toolId && toolExists(state, predicate.toolId));
    case 'TOOL_HELD': return Boolean(predicate.toolId && runtime.heldToolId === (resolveToolAffordanceV2(predicate.toolId)?.id ?? predicate.toolId));
    case 'TARGET_EXISTS': return Boolean(predicate.targetId && componentExists(state, predicate.targetId));
    case 'REGION_ACCESSIBLE': return Boolean(predicate.regionId);
    case 'CONTACT_ESTABLISHED': return Boolean(predicate.targetId && runtime.contactedTargets.has(predicate.targetId));
    case 'PROGRESS_AT': return runtime.progressPercent === predicate.value;
    case 'FUTURE_COMPONENT_ABSENT': return Boolean(predicate.targetId && !state.existingComponents.includes(predicate.targetId) && !state.partialComponents.includes(predicate.targetId));
    case 'MATERIAL_AVAILABLE': return Boolean(predicate.materialId && state.materials.some(material => material.materialId === predicate.materialId && material.quantity > 0));
    case 'COMPONENT_STATUS': {
      if (!predicate.targetId || !predicate.status) return false;
      if (predicate.status === 'COMPLETE') return state.existingComponents.includes(predicate.targetId);
      if (predicate.status === 'PARTIAL') return state.partialComponents.includes(predicate.targetId);
      if (predicate.status === 'FUTURE') return state.futureComponents.includes(predicate.targetId);
      return false;
    }
    default: return false;
  }
}
