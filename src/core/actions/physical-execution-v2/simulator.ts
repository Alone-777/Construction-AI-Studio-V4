import type { WorldState } from '../../types/world-state';
import type {
  PhysicalActionNodeV2,
  PhysicalEffect,
  PhysicalExecutionPlanV2,
  PhysicalPredicate,
  PhysicalSimulationProjection,
  PhysicalSimulationReceiptV2,
  ValidationIssueV2,
} from './types';
import { SIMULATION_RECEIPT_SCHEMA } from './types';
import { validatePhysicalExecutionPlan } from './validators';
import { resolveToolAffordance } from './affordances';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(stable).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{'
      + Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + stable(item))
        .join(',')
      + '}';
  }
  return JSON.stringify(value);
}

export function fingerprintValue(value: unknown): string {
  const text = stable(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveOfficialRevision(state: WorldState): string {
  return 'world:' + state.timestamp + ':' + fingerprintValue({
    construction: state.construction,
    existingComponents: state.existingComponents,
    partialComponents: state.partialComponents,
    futureComponents: state.futureComponents,
    materials: state.materials,
    character: state.character,
    activeZone: state.activeZone,
  });
}

interface RuntimeState {
  projected: PhysicalSimulationProjection;
  contacts: Set<string>;
}

function componentStatus(
  world: WorldState,
  componentId: string,
): 'ABSENT' | 'FUTURE' | 'PARTIAL' | 'COMPLETE' {
  if (world.existingComponents.includes(componentId)) return 'COMPLETE';
  if (world.partialComponents.includes(componentId)) return 'PARTIAL';
  if (world.futureComponents.includes(componentId)) return 'FUTURE';
  return 'ABSENT';
}

function materialQuantity(world: WorldState, materialId: string): number {
  return world.materials.find(item => item.materialId === materialId)?.quantity ?? 0;
}

function toolAvailable(world: WorldState, toolId: string): boolean {
  const canonical = resolveToolAffordance(toolId)?.id;
  if (!canonical) return false;
  if (
    world.character.currentTool
    && resolveToolAffordance(world.character.currentTool)?.id === canonical
  ) {
    return true;
  }
  return world.tools.some(item =>
    resolveToolAffordance(item.toolId)?.id === canonical
    && item.status !== 'indisponivel',
  );
}

function evaluatePredicate(
  predicate: PhysicalPredicate,
  runtime: RuntimeState,
): boolean {
  const world = runtime.projected.worldState;

  if (predicate.type === 'ACTOR_IN_ZONE') {
    return runtime.projected.actorZone === predicate.zoneId;
  }
  if (predicate.type === 'TOOL_AVAILABLE') {
    return toolAvailable(world, predicate.toolId);
  }
  if (predicate.type === 'TOOL_HELD') {
    return resolveToolAffordance(runtime.projected.heldToolId)?.id
      === resolveToolAffordance(predicate.toolId)?.id;
  }
  if (predicate.type === 'TARGET_EXISTS') {
    return world.existingComponents.includes(predicate.entityId)
      || world.partialComponents.includes(predicate.entityId)
      || world.futureComponents.includes(predicate.entityId)
      || world.materials.some(item => item.materialId === predicate.entityId);
  }
  if (predicate.type === 'MATERIAL_AVAILABLE') {
    return materialQuantity(world, predicate.materialId) >= (predicate.minQuantity ?? 0);
  }
  if (predicate.type === 'COMPONENT_STATUS') {
    return componentStatus(world, predicate.componentId) === predicate.status;
  }
  if (predicate.type === 'ZONE_ACCESSIBLE') {
    return Boolean(predicate.zoneId);
  }
  if (predicate.type === 'CONTACT_ESTABLISHED') {
    return runtime.contacts.has(predicate.contactId);
  }
  if (predicate.type === 'CANONICAL_PROGRESS_AT') {
    const value = runtime.projected.canonicalProgressByTarget[predicate.targetId] ?? 0;
    return Math.abs(value - predicate.percentage)
      <= (predicate.tolerancePercentage ?? 0);
  }
  if (predicate.type === 'FUTURE_COMPONENT_ABSENT') {
    return world.futureComponents.includes(predicate.componentId)
      && !world.existingComponents.includes(predicate.componentId)
      && !world.partialComponents.includes(predicate.componentId);
  }
  return false;
}

function predicateIssue(
  phase: 'PRE' | 'POST',
  node: PhysicalActionNodeV2,
  predicate: PhysicalPredicate,
): ValidationIssueV2 {
  return {
    severity: 'BLOCKER',
    code: phase + 'CONDITION_FALSE',
    message:
      (phase === 'PRE' ? 'Precondition ' : 'Postcondition ')
      + predicate.type
      + ' is false for node '
      + node.id
      + '.',
    nodeId: node.id,
    details: { predicate },
  };
}

function decrementMaterial(
  world: WorldState,
  materialId: string,
  amount: number,
): void {
  const item = world.materials.find(material => material.materialId === materialId);
  if (item) item.quantity = Math.max(0, item.quantity - amount);
}

function applyEffect(
  runtime: RuntimeState,
  node: PhysicalActionNodeV2,
  effect: PhysicalEffect,
): void {
  const projected = runtime.projected;
  projected.physicalChanges.push({
    nodeId: node.id,
    effect: clone(effect),
  });

  if (effect.type === 'CANONICAL_PROGRESS_ADVANCED') {
    projected.canonicalProgressByTarget[effect.targetId] = effect.toPercentage;
    return;
  }

  if (effect.type === 'PHYSICAL_PROGRESS_ADVANCED') {
    projected.physicalProgressByTarget[effect.targetId] = {
      metric: effect.metric,
      unit: effect.unit,
      value: effect.to,
      zoneId: effect.zoneId,
    };
    return;
  }

  if (effect.type === 'SURFACE_REMOVED') {
    if (effect.destinationZoneId) {
      projected.materialTransfers.push({
        materialId: effect.materialId,
        quantity: effect.quantity ? clone(effect.quantity) : undefined,
        fromZoneId: effect.zoneId,
        toZoneId: effect.destinationZoneId,
        causeNodeId: node.id,
      });
    }
    return;
  }

  if (effect.type === 'MATERIAL_TRANSFER') {
    projected.materialTransfers.push({
      materialId: effect.materialId,
      quantity: clone(effect.quantity),
      fromZoneId: effect.fromZoneId,
      toZoneId: effect.toZoneId,
      causeNodeId: node.id,
    });
    return;
  }

  if (effect.type === 'MATERIAL_CONSUMED') {
    decrementMaterial(
      projected.worldState,
      effect.materialId,
      effect.quantity.value,
    );
    return;
  }

  if (effect.type === 'MATERIAL_APPLIED') {
    decrementMaterial(
      projected.worldState,
      effect.materialId,
      effect.quantity.value,
    );
    return;
  }

  if (effect.type === 'COMPONENT_MOVED') {
    projected.worldState.temporaryObjects = [
      ...projected.worldState.temporaryObjects
        .filter(item => item !== effect.componentId),
      effect.componentId + '@' + effect.toZoneId,
    ];
    return;
  }

  if (effect.type === 'COMPONENT_ATTACHED') {
    if (
      !projected.worldState.existingComponents.includes(effect.componentId)
      && !projected.worldState.partialComponents.includes(effect.componentId)
    ) {
      projected.worldState.partialComponents.push(effect.componentId);
    }
    projected.worldState.futureComponents =
      projected.worldState.futureComponents
        .filter(item => item !== effect.componentId);
    return;
  }

  if (effect.type === 'STATE_CHANGED') {
    projected.worldState.temporaryObjects = [
      ...projected.worldState.temporaryObjects,
      'state:' + effect.entityId + ':' + effect.property + '=' + effect.to,
    ];
  }
}

function applyNode(
  runtime: RuntimeState,
  node: PhysicalActionNodeV2,
): void {
  if (node.kind === 'APPROACH') {
    runtime.projected.actorZone = node.zoneId;
    runtime.projected.worldState.character.currentZone = node.zoneId;
    runtime.projected.worldState.activeZone = node.zoneId;
  }

  if (
    (node.kind === 'ACQUIRE_TOOL' || node.kind === 'GRIP')
    && node.toolId
  ) {
    runtime.projected.heldToolId = node.toolId;
    runtime.projected.worldState.character.currentTool = node.toolId;
  }

  if (node.contact) runtime.contacts.add(node.contact.id);

  for (const effect of node.effects) {
    applyEffect(runtime, node, effect);
  }
}

export function simulatePhysicalExecution(
  official: WorldState,
  plan: PhysicalExecutionPlanV2,
): PhysicalSimulationReceiptV2 {
  const officialRevision = deriveOfficialRevision(official);
  const validation = validatePhysicalExecutionPlan(
    plan,
    official,
    officialRevision,
  );

  if (!validation.ok) {
    return {
      schemaVersion: SIMULATION_RECEIPT_SCHEMA,
      planId: plan.planId,
      officialBeforeRevision: officialRevision,
      projectedAfterFingerprint: null,
      projected: null,
      appliedEffects: [],
      validation,
      commitAvailable: false,
    };
  }

  const projectedWorld = clone(official);
  const runtime: RuntimeState = {
    projected: {
      worldState: projectedWorld,
      actorZone: projectedWorld.character.currentZone,
      heldToolId: projectedWorld.character.currentTool,
      contacts: [],
      canonicalProgressByTarget: {
        [plan.intent.targetEntityId]:
          plan.intent.canonicalProgress.beforePercentage,
      },
      physicalProgressByTarget: plan.intent.physicalProgress
        ? {
            [plan.intent.targetEntityId]: {
              metric: plan.intent.physicalProgress.metric,
              unit: plan.intent.physicalProgress.unit,
              value: plan.intent.physicalProgress.from,
              zoneId: plan.intent.physicalProgress.zoneId,
            },
          }
        : {},
      materialTransfers: [],
      physicalChanges: [],
    },
    contacts: new Set<string>(),
  };

  const dynamicIssues: ValidationIssueV2[] = [];
  const appliedEffects: PhysicalSimulationReceiptV2['appliedEffects'] = [];

  for (const nodeId of validation.order) {
    const node = plan.nodes.find(item => item.id === nodeId);
    if (!node) continue;

    for (const predicate of node.preconditions) {
      if (!evaluatePredicate(predicate, runtime)) {
        dynamicIssues.push(predicateIssue('PRE', node, predicate));
      }
    }
    if (dynamicIssues.some(item => item.severity === 'BLOCKER')) break;

    applyNode(runtime, node);
    for (const effect of node.effects) {
      appliedEffects.push({
        nodeId: node.id,
        effect: clone(effect),
      });
    }

    for (const predicate of node.postconditions) {
      if (!evaluatePredicate(predicate, runtime)) {
        dynamicIssues.push(predicateIssue('POST', node, predicate));
      }
    }
    if (dynamicIssues.some(item => item.severity === 'BLOCKER')) break;
  }

  runtime.projected.contacts = [...runtime.contacts];
  const combinedValidation = {
    ...validation,
    ok:
      validation.ok
      && !dynamicIssues.some(item => item.severity === 'BLOCKER'),
    issues: [...validation.issues, ...dynamicIssues],
  };

  return {
    schemaVersion: SIMULATION_RECEIPT_SCHEMA,
    planId: plan.planId,
    officialBeforeRevision: officialRevision,
    projectedAfterFingerprint: combinedValidation.ok
      ? fingerprintValue(runtime.projected)
      : null,
    projected: combinedValidation.ok ? runtime.projected : null,
    appliedEffects: combinedValidation.ok ? appliedEffects : [],
    validation: combinedValidation,
    commitAvailable: false,
  };
}
