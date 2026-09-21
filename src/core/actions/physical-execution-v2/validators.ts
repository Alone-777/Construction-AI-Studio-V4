import type { WorldState } from '../../types/world-state';
import {
  PHYSICAL_EXECUTION_PLAN_SCHEMA,
  type PhysicalActionNodeV2,
  type PhysicalEffect,
  type PhysicalExecutionPlanV2,
  type ValidationIssueV2,
  type ValidationReportV2,
} from './types';
import {
  materialCompatibleWithTool,
  resolveToolAffordance,
  toolSupportsContact,
  toolSupportsEffect,
  toolSupportsNode,
} from './affordances';

function issue(
  severity: ValidationIssueV2['severity'],
  code: string,
  message: string,
  nodeId?: string,
  details?: Record<string, unknown>,
): ValidationIssueV2 {
  return {
    severity,
    code,
    message,
    ...(nodeId ? { nodeId } : {}),
    ...(details ? { details } : {}),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function effectMaterialId(effect: PhysicalEffect): string | undefined {
  return 'materialId' in effect ? effect.materialId : undefined;
}

function effectZoneIds(effect: PhysicalEffect): string[] {
  const ids: string[] = [];
  if ('zoneId' in effect && effect.zoneId) ids.push(effect.zoneId);
  if ('destinationZoneId' in effect && effect.destinationZoneId) ids.push(effect.destinationZoneId);
  if ('fromZoneId' in effect && effect.fromZoneId) ids.push(effect.fromZoneId);
  if ('toZoneId' in effect && effect.toZoneId) ids.push(effect.toZoneId);
  if ('sourceZoneId' in effect && effect.sourceZoneId) ids.push(effect.sourceZoneId);
  return unique(ids);
}

function effectChangesMatter(effect: PhysicalEffect): boolean {
  return [
    'SURFACE_REMOVED',
    'MATERIAL_TRANSFER',
    'MATERIAL_CONSUMED',
    'MATERIAL_APPLIED',
    'COMPONENT_MOVED',
    'COMPONENT_ATTACHED',
    'STATE_CHANGED',
  ].includes(effect.type);
}

export interface GraphAnalysis {
  order: string[];
  cyclic: boolean;
  invalidEdges: Array<{ from: string; to: string }>;
  incoming: Map<string, string[]>;
}

export function analyzePhysicalGraph(plan: PhysicalExecutionPlanV2): GraphAnalysis {
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, string[]>(plan.nodes.map(node => [node.id, []]));
  const outgoing = new Map<string, string[]>(plan.nodes.map(node => [node.id, []]));
  const invalidEdges: Array<{ from: string; to: string }> = [];

  for (const edge of plan.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      invalidEdges.push({ from: edge.from, to: edge.to });
      continue;
    }
    incoming.get(edge.to)!.push(edge.from);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const indegree = new Map([...incoming.entries()].map(([id, list]) => [id, list.length]));
  const queue = plan.nodes.map(node => node.id).filter(id => indegree.get(id) === 0);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  return {
    order,
    cyclic: order.length !== plan.nodes.length,
    invalidEdges,
    incoming,
  };
}

export function validatePlanSchema(plan: PhysicalExecutionPlanV2): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  if (plan.schemaVersion !== PHYSICAL_EXECUTION_PLAN_SCHEMA) {
    issues.push(issue('BLOCKER', 'PLAN_SCHEMA_INVALID', 'PhysicalExecutionPlan V2 schema is required.'));
  }
  if (!plan.planId) issues.push(issue('BLOCKER', 'PLAN_ID_MISSING', 'Plan id is required.'));
  if (!plan.officialBefore?.revision) {
    issues.push(issue('BLOCKER', 'OFFICIAL_REVISION_MISSING', 'Plan must pin an OFFICIAL revision.'));
  }
  if (!plan.intent?.operationId) {
    issues.push(issue('BLOCKER', 'INTENT_MISSING', 'ConstructionIntent V2 is required.'));
  }
  if (!plan.nodes.length) {
    issues.push(issue('BLOCKER', 'NODES_MISSING', 'Plan must contain physical subactions.'));
  }
  const ids = plan.nodes.map(node => node.id);
  if (new Set(ids).size !== ids.length) {
    issues.push(issue('BLOCKER', 'NODE_ID_DUPLICATE', 'Physical action node ids must be unique.'));
  }
  return issues;
}

export function validateGraph(plan: PhysicalExecutionPlanV2): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const graph = analyzePhysicalGraph(plan);

  for (const edge of graph.invalidEdges) {
    issues.push(issue(
      'BLOCKER',
      'EDGE_NODE_MISSING',
      'Graph edge ' + edge.from + ' -> ' + edge.to + ' references a missing node.',
      undefined,
      edge,
    ));
  }
  if (graph.cyclic) {
    issues.push(issue('BLOCKER', 'GRAPH_CYCLE', 'Physical action graph contains a cycle.'));
  }

  if (plan.nodes.length) {
    const roots = plan.nodes.filter(node => (graph.incoming.get(node.id)?.length ?? 0) === 0);
    const allowedMultipleRoots = roots.length > 1
      && plan.edges.some(edge => edge.relation === 'PARALLEL_SAFE');
    if (roots.length > 1 && !allowedMultipleRoots) {
      issues.push(issue(
        'BLOCKER',
        'GRAPH_MULTIPLE_ROOTS',
        'Physical action graph has multiple disconnected roots without PARALLEL_SAFE semantics.',
      ));
    }
  }
  return issues;
}

export function validateCausality(plan: PhysicalExecutionPlanV2): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  const predecessors = (node: PhysicalActionNodeV2) => plan.edges
    .filter(edge =>
      edge.to === node.id
      && (edge.relation === 'SEQUENCE' || edge.relation === 'REQUIRES'),
    )
    .map(edge => byId.get(edge.from))
    .filter((value): value is PhysicalActionNodeV2 => Boolean(value));

  for (const node of plan.nodes) {
    const matterEffects = node.effects.filter(effectChangesMatter);
    if (matterEffects.length && !node.evidenceIds.length) {
      issues.push(issue(
        'BLOCKER',
        'EFFECT_WITHOUT_EVIDENCE',
        'Matter-changing action has no evidence contract.',
        node.id,
      ));
    }
    if (matterEffects.length && !node.contact && !['PLACE', 'INSPECT'].includes(node.kind)) {
      issues.push(issue(
        'BLOCKER',
        'EFFECT_WITHOUT_CONTACT',
        'Matter-changing action has no contact contract.',
        node.id,
      ));
    }
    if (node.kind === 'APPLY_FORCE') {
      const hasContact = predecessors(node).some(item => item.kind === 'CONTACT');
      if (!hasContact) {
        issues.push(issue('BLOCKER', 'FORCE_BEFORE_CONTACT', 'APPLY_FORCE must depend on CONTACT.', node.id));
      }
    }
    if (node.kind === 'FASTEN') {
      const positioned = predecessors(node)
        .some(item => item.kind === 'POSITION' || item.kind === 'PLACE');
      if (!positioned) {
        issues.push(issue('BLOCKER', 'FASTEN_WITHOUT_POSITION', 'FASTEN must depend on POSITION or PLACE.', node.id));
      }
    }
    if (node.kind === 'LIFT' && !node.sourceEntityIds.length) {
      issues.push(issue('BLOCKER', 'LIFT_WITHOUT_SOURCE', 'LIFT requires a source entity.', node.id));
    }
    if (node.kind === 'RELEASE') {
      const movable = predecessors(node)
        .some(item => ['LIFT', 'MOVE_MATERIAL', 'PLACE'].includes(item.kind));
      if (!movable) {
        issues.push(issue(
          'BLOCKER',
          'RELEASE_BEFORE_MOVE',
          'RELEASE must follow LIFT, MOVE_MATERIAL or PLACE.',
          node.id,
        ));
      }
    }
  }

  const hasCanonicalProgress = plan.nodes.some(node =>
    node.effects.some(effect => effect.type === 'CANONICAL_PROGRESS_ADVANCED'),
  );
  const hasPhysicalEffect = plan.nodes.some(node =>
    node.effects.some(effectChangesMatter),
  );
  if (hasCanonicalProgress && !hasPhysicalEffect) {
    issues.push(issue(
      'BLOCKER',
      'PROGRESS_WITHOUT_PHYSICAL_EFFECT',
      'Canonical progress cannot advance without a physical effect.',
    ));
  }
  return issues;
}

export function validateAffordances(
  plan: PhysicalExecutionPlanV2,
  official: WorldState,
): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const availableTools = new Set([
    ...official.tools.map(tool => tool.toolId),
    ...(official.character.currentTool ? [official.character.currentTool] : []),
  ]);

  for (const node of plan.nodes) {
    if (!node.toolId) continue;
    const tool = resolveToolAffordance(node.toolId);
    if (!tool) {
      issues.push(issue(
        'BLOCKER',
        'TOOL_AFFORDANCE_UNKNOWN',
        'No affordance exists for tool ' + node.toolId + '.',
        node.id,
      ));
      continue;
    }
    if (!toolSupportsNode(node.toolId, node.kind)) {
      issues.push(issue(
        'BLOCKER',
        'TOOL_NODE_INCOMPATIBLE',
        'Tool ' + node.toolId + ' cannot perform ' + node.kind + '.',
        node.id,
      ));
    }
    if (node.contact && !toolSupportsContact(node.toolId, node.contact.mode)) {
      issues.push(issue(
        'BLOCKER',
        'TOOL_CONTACT_INCOMPATIBLE',
        'Tool ' + node.toolId + ' cannot perform contact mode ' + node.contact.mode + '.',
        node.id,
      ));
    }

    for (const effect of node.effects) {
      if (effectChangesMatter(effect) && !toolSupportsEffect(node.toolId, effect.type)) {
        issues.push(issue(
          'BLOCKER',
          'TOOL_EFFECT_INCOMPATIBLE',
          'Tool ' + node.toolId + ' cannot cause ' + effect.type + '.',
          node.id,
        ));
      }
      const materialId = effectMaterialId(effect);
      if (materialId && !materialCompatibleWithTool(materialId, node.toolId)) {
        issues.push(issue(
          'BLOCKER',
          'TOOL_MATERIAL_INCOMPATIBLE',
          'Tool ' + node.toolId + ' is incompatible with material ' + materialId + '.',
          node.id,
        ));
      }
    }

    if (![...availableTools].some(id => resolveToolAffordance(id)?.id === tool.id)) {
      issues.push(issue(
        'WARNING',
        'TOOL_NOT_LISTED_IN_OFFICIAL',
        'Tool ' + node.toolId + ' is not listed in OFFICIAL inventory; compatibility mode may be required.',
        node.id,
      ));
    }
  }
  return issues;
}

export function validateTemporal(
  plan: PhysicalExecutionPlanV2,
  officialRevision: string,
): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  if (plan.officialBefore.revision !== officialRevision) {
    issues.push(issue(
      'BLOCKER',
      'OFFICIAL_REVISION_MISMATCH',
      'Plan revision does not match the supplied OFFICIAL state.',
      undefined,
      { expected: officialRevision, actual: plan.officialBefore.revision },
    ));
  }

  const forbidden = new Set(
    plan.intent.temporalConstraints.forbiddenFutureComponentIds,
  );
  const allowedZones = new Set([
    plan.intent.authorizedZoneId,
    ...plan.intent.temporalConstraints.allowedMaterialDestinationZoneIds,
  ]);

  for (const node of plan.nodes) {
    if (!allowedZones.has(node.zoneId)) {
      issues.push(issue(
        'BLOCKER',
        'NODE_OUTSIDE_AUTHORIZED_ZONE',
        'Node acts outside the authorized zone: ' + node.zoneId + '.',
        node.id,
      ));
    }

    for (const effect of node.effects) {
      if ('componentId' in effect && forbidden.has(effect.componentId)) {
        issues.push(issue(
          'BLOCKER',
          'FUTURE_COMPONENT_TOUCHED',
          'Future component ' + effect.componentId + ' is modified by the current plan.',
          node.id,
        ));
      }
      for (const zoneId of effectZoneIds(effect)) {
        if (!allowedZones.has(zoneId)) {
          issues.push(issue(
            'BLOCKER',
            'EFFECT_OUTSIDE_AUTHORIZED_ZONE',
            'Effect occurs outside authorized zones: ' + zoneId + '.',
            node.id,
          ));
        }
      }
    }
  }
  return issues;
}

export function validateProgress(
  plan: PhysicalExecutionPlanV2,
): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const canonical = plan.intent.canonicalProgress;

  if (
    canonical.beforePercentage < 0
    || canonical.targetPercentage > 100
    || canonical.targetPercentage <= canonical.beforePercentage
  ) {
    issues.push(issue(
      'BLOCKER',
      'CANONICAL_PROGRESS_INVALID',
      'Canonical JOB progress must be an increasing segment within 0-100%.',
    ));
  }

  const canonicalEffects = plan.nodes
    .flatMap(node => node.effects)
    .filter(
      (effect): effect is Extract<PhysicalEffect, { type: 'CANONICAL_PROGRESS_ADVANCED' }> =>
        effect.type === 'CANONICAL_PROGRESS_ADVANCED',
    );
  const projectedCanonical = canonicalEffects.reduce(
    (value, effect) => Math.max(value, effect.toPercentage),
    canonical.beforePercentage,
  );

  if (projectedCanonical > canonical.targetPercentage + canonical.tolerancePercentage) {
    issues.push(issue(
      'BLOCKER',
      'CANONICAL_PROGRESS_OVERSHOOT',
      'Plan exceeds the canonical JOB target.',
      undefined,
      { projectedCanonical, target: canonical.targetPercentage },
    ));
  }
  if (projectedCanonical < canonical.targetPercentage - canonical.tolerancePercentage) {
    issues.push(issue(
      'WARNING',
      'CANONICAL_PROGRESS_UNDERSHOOT',
      'Plan does not reach the canonical JOB target.',
      undefined,
      { projectedCanonical, target: canonical.targetPercentage },
    ));
  }

  const physical = plan.intent.physicalProgress;
  if (physical) {
    if (physical.target <= physical.from) {
      issues.push(issue(
        'BLOCKER',
        'PHYSICAL_PROGRESS_INVALID',
        'Physical progress target must exceed its start value.',
      ));
    }
    if (physical.total !== undefined && physical.target > physical.total + physical.tolerance) {
      issues.push(issue(
        'BLOCKER',
        'PHYSICAL_PROGRESS_EXCEEDS_TOTAL',
        'Physical progress target exceeds the measurable total.',
      ));
    }

    const physicalEffects = plan.nodes
      .flatMap(node => node.effects)
      .filter(
        (effect): effect is Extract<PhysicalEffect, { type: 'PHYSICAL_PROGRESS_ADVANCED' }> =>
          effect.type === 'PHYSICAL_PROGRESS_ADVANCED',
      );
    const projected = physicalEffects.reduce(
      (value, effect) => Math.max(value, effect.to),
      physical.from,
    );

    if (projected > physical.target + physical.tolerance) {
      issues.push(issue(
        'BLOCKER',
        'PHYSICAL_PROGRESS_OVERSHOOT',
        'Plan exceeds the physical progress target.',
        undefined,
        { projected, target: physical.target, unit: physical.unit },
      ));
    }
    if (projected < physical.target - physical.tolerance) {
      issues.push(issue(
        'WARNING',
        'PHYSICAL_PROGRESS_UNDERSHOOT',
        'Plan does not reach the physical progress target.',
        undefined,
        { projected, target: physical.target, unit: physical.unit },
      ));
    }
    for (const effect of physicalEffects) {
      if (
        effect.metric !== physical.metric
        || effect.unit !== physical.unit
        || effect.zoneId !== physical.zoneId
      ) {
        issues.push(issue(
          'BLOCKER',
          'PHYSICAL_PROGRESS_CONTRACT_MISMATCH',
          'Physical progress effect does not match the intent metric/unit/zone.',
        ));
      }
    }
  }

  return issues;
}

export function validateObservability(
  plan: PhysicalExecutionPlanV2,
): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const evidence = new Map(plan.evidence.map(item => [item.id, item]));

  for (const node of plan.nodes) {
    for (const effect of node.effects) {
      const linked = node.evidenceIds
        .map(id => evidence.get(id))
        .filter(Boolean);
      if (!linked.length) {
        issues.push(issue(
          'BLOCKER',
          'OBSERVATION_MISSING',
          'Effect ' + effect.type + ' has no observation contract.',
          node.id,
        ));
        continue;
      }
      if (
        effectChangesMatter(effect)
        && plan.constraints.requirePersistentEffects
        && !linked.some(item => item?.mustPersist)
      ) {
        issues.push(issue(
          'BLOCKER',
          'PERSISTENCE_EVIDENCE_MISSING',
          'Effect ' + effect.type + ' needs persistent visual evidence.',
          node.id,
        ));
      }
    }
  }
  return issues;
}

export function validateConservation(
  plan: PhysicalExecutionPlanV2,
): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];

  for (const node of plan.nodes) {
    for (const effect of node.effects) {
      if (effect.type === 'SURFACE_REMOVED') {
        if (!effect.destinationZoneId) {
          issues.push(issue(
            'BLOCKER',
            'REMOVED_MATERIAL_WITHOUT_DESTINATION',
            'Removed surface material must have a traceable destination.',
            node.id,
          ));
        }
        if (effect.quantity && effect.quantity.value < 0) {
          issues.push(issue(
            'BLOCKER',
            'NEGATIVE_MATERIAL_QUANTITY',
            'Removed material quantity cannot be negative.',
            node.id,
          ));
        }
      }

      if (effect.type === 'MATERIAL_TRANSFER') {
        if (
          !effect.fromZoneId
          || !effect.toZoneId
          || effect.fromZoneId === effect.toZoneId
        ) {
          issues.push(issue(
            'BLOCKER',
            'MATERIAL_TRANSFER_INVALID',
            'Material transfer requires distinct source and destination zones.',
            node.id,
          ));
        }
      }

      if (effect.type === 'COMPONENT_ATTACHED') {
        const hasSource = node.sourceEntityIds.includes(effect.componentId)
          || Boolean(effect.sourceZoneId)
          || node.sourceEntityIds.length > 0;
        if (!hasSource) {
          issues.push(issue(
            'BLOCKER',
            'ATTACHED_COMPONENT_WITHOUT_SOURCE',
            'Attached component/material must have a traceable source.',
            node.id,
          ));
        }
      }
    }
  }

  return issues;
}

export function validatePhysicalExecutionPlan(
  plan: PhysicalExecutionPlanV2,
  official: WorldState,
  officialRevision: string,
): ValidationReportV2 {
  const graph = analyzePhysicalGraph(plan);
  const issues = [
    ...validatePlanSchema(plan),
    ...validateGraph(plan),
    ...validateCausality(plan),
    ...validateAffordances(plan, official),
    ...validateTemporal(plan, officialRevision),
    ...validateProgress(plan),
    ...validateObservability(plan),
    ...validateConservation(plan),
  ];

  return {
    ok: !issues.some(item => item.severity === 'BLOCKER'),
    issues,
    order: graph.order,
  };
}
