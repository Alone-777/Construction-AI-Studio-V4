import type { WorldState } from '../../types/world-state';
import { canonicalToolIdV2 } from './affordances';
import type {
  PhysicalAppliedEffectV2,
  PhysicalExecutionPlanV2,
  PhysicalSimulationReceiptV2,
  PhysicalValidationIssueV2,
} from './types';
import { evaluatePredicateV2, validatePhysicalExecutionPlanV2 } from './validators';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  const text = stable(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function applyComponentProjection(
  projected: WorldState,
  componentId: string,
  targetPercent: number,
): void {
  if (targetPercent >= 100) {
    projected.existingComponents = unique([...projected.existingComponents, componentId]);
    projected.partialComponents = projected.partialComponents.filter(id => id !== componentId);
    projected.futureComponents = projected.futureComponents.filter(id => id !== componentId);
    return;
  }
  projected.partialComponents = unique([...projected.partialComponents, componentId]);
}

function moveInventoryMaterial(
  projected: WorldState,
  materialId: string,
  sourceRegionId: string,
  destinationRegionId: string,
  amount: number,
): void {
  if (!(amount > 0)) return;
  const source = projected.materials.find(material =>
    material.materialId === materialId && material.location === sourceRegionId,
  );
  if (!source || source.quantity < amount) return;
  source.quantity -= amount;
  const destination = projected.materials.find(material =>
    material.materialId === materialId && material.location === destinationRegionId,
  );
  if (destination) {
    destination.quantity += amount;
  } else {
    projected.materials.push({
      materialId,
      quantity: amount,
      status: 'em_uso',
      location: destinationRegionId,
      origin: `physical-v2:${sourceRegionId}`,
    });
  }
}

export function simulatePhysicalExecutionV2({
  official,
  plan,
}: {
  official: WorldState;
  plan: PhysicalExecutionPlanV2;
}): PhysicalSimulationReceiptV2 {
  const officialSnapshot = clone(official);
  const projected = clone(official);
  const staticValidation = validatePhysicalExecutionPlanV2(plan, official);
  const issues: PhysicalValidationIssueV2[] = [...staticValidation.issues];
  const appliedEffects: PhysicalAppliedEffectV2[] = [];
  const runtime = {
    actorZone: official.character.currentZone,
    heldToolId: canonicalToolIdV2(official.character.currentTool),
    contactedTargets: new Set<string>(),
    progressPercent: plan.intent.canonicalProgress.fromPercent,
  };
  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  const order = staticValidation.topologicalOrder.length === plan.nodes.length
    ? staticValidation.topologicalOrder
    : plan.nodes.map(node => node.id);

  for (const nodeId of order) {
    const node = byId.get(nodeId);
    if (!node) continue;
    for (const precondition of node.preconditions) {
      if (!evaluatePredicateV2(precondition, projected, runtime)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PRECONDITION_FAILED',
          message: `Precondition ${precondition.type} failed before node ${node.id}.`,
          nodeId: node.id,
          details: { predicate: precondition },
        });
      }
    }

    if (node.kind === 'APPROACH') {
      runtime.actorZone = node.regionId;
      projected.character.currentZone = node.regionId;
      projected.activeZone = node.regionId;
    }
    if ((node.kind === 'ACQUIRE_TOOL' || node.kind === 'GRIP') && node.toolId) {
      runtime.heldToolId = canonicalToolIdV2(node.toolId);
      projected.character.currentTool = node.toolId;
    }
    if (node.kind === 'CONTACT') {
      for (const target of node.targetEntityIds) runtime.contactedTargets.add(target);
    }

    for (const effect of node.effects) {
      appliedEffects.push({ nodeId: node.id, effect: clone(effect) });
      if (effect.type === 'PROGRESS_ADVANCED' && Number.isFinite(effect.toPercent)) {
        runtime.progressPercent = Number(effect.toPercent);
      }
      if (effect.type === 'COMPONENT_ATTACHED' && effect.componentId) {
        applyComponentProjection(projected, effect.componentId, plan.intent.canonicalProgress.targetPercent);
      }
      if (
        effect.type === 'MATERIAL_MOVED' &&
        effect.materialId &&
        effect.sourceRegionId &&
        effect.destinationRegionId &&
        effect.quantity
      ) {
        moveInventoryMaterial(
          projected,
          effect.materialId,
          effect.sourceRegionId,
          effect.destinationRegionId,
          effect.quantity.value,
        );
      }
    }

    for (const postcondition of node.postconditions) {
      if (!evaluatePredicateV2(postcondition, projected, runtime)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'POSTCONDITION_FAILED',
          message: `Postcondition ${postcondition.type} failed after node ${node.id}.`,
          nodeId: node.id,
          details: { predicate: postcondition },
        });
      }
    }
  }

  const blockers = issues.filter(item => item.severity === 'BLOCKER');
  const warnings = issues.filter(item => item.severity === 'WARNING');
  const validation = {
    ok: blockers.length === 0,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    issues,
    topologicalOrder: staticValidation.topologicalOrder,
  };

  return {
    schemaVersion: 'physical-simulation-receipt/2',
    planId: plan.planId,
    officialBeforeRevision: plan.officialBefore.revision,
    projectedState: projected,
    projectedFingerprint: fingerprint(projected),
    appliedEffects,
    validation,
    canonicalProgress: {
      fromPercent: plan.intent.canonicalProgress.fromPercent,
      targetPercent: plan.intent.canonicalProgress.targetPercent,
      projectedPercent: runtime.progressPercent,
    },
    observableProgress: clone(plan.intent.observableProgress),
    commitAvailable: false,
    officialUnchanged: stable(officialSnapshot) === stable(official),
  };
}
