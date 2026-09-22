import type { Operation } from '../../types/scene';
import type { WorldState } from '../../types/world-state';
import type { HandlingProfile } from '../../types/materials';
import { checkAccessibility } from '../../engines/spatial-map';
import { canonicalToolId } from './affordances';
import type { PhysicalExecutionPlanV2, PhysicalNodeKind, ValidationIssueV2 } from './types';
import type {
  EquipmentLogisticsPlan, LogisticsPlanningContext, LogisticsResource, LogisticsMovement,
} from './logistics-types';

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
export const logisticsToolId = (id: string) => canonicalToolId(id) ?? id;

/** Deliberately conservative visual heuristics, NOT safe working-load limits. */
export const VISUAL_HANDLING_POLICY = {
  soloMassKg: 15,
  teamMassKg: 40,
  longLengthM: 2.5,
  elevatedHeightM: 2,
  minimumSecondsPerHandlingStep: 1,
} as const;

export function resolveHandling(profile: HandlingProfile): {
  method: LogisticsMovement['method']; workers: number;
  transportMethod: LogisticsMovement['transportMethod'];
  equipmentKinds: LogisticsMovement['equipmentKinds'];
} {
  const heavy = profile.loadClass === 'HEAVY'
    || (profile.massKg ?? 0) > VISUAL_HANDLING_POLICY.teamMassKg;
  const elevated = profile.heightClass === 'ELEVATED'
    || (profile.targetHeightM ?? 0) >= VISUAL_HANDLING_POLICY.elevatedHeightM;
  const team = heavy || elevated || profile.loadClass === 'TEAM'
    || profile.sizeClass === 'LONG' || profile.sizeClass === 'OVERSIZE'
    || (profile.lengthM ?? 0) > VISUAL_HANDLING_POLICY.longLengthM
    || (profile.massKg ?? 0) > VISUAL_HANDLING_POLICY.soloMassKg;
  const workers = Math.max(team ? 2 : 1, profile.minimumWorkers ?? 1);
  const unknown = ((!profile.loadClass || profile.loadClass === 'UNKNOWN') && profile.massKg === undefined)
    || ((!profile.sizeClass || profile.sizeClass === 'UNKNOWN') && profile.lengthM === undefined);
  return {
    method: elevated ? 'HOIST' : heavy ? 'CART' : unknown ? 'UNRESOLVED' : workers > 1 ? 'TEAM_CARRY' : 'HAND_CARRY',
    workers,
    transportMethod: heavy ? 'CART' : unknown ? 'UNRESOLVED' : workers > 1 ? 'TEAM_CARRY' : 'HAND_CARRY',
    equipmentKinds: elevated ? [...(heavy ? ['CART' as const] : []), 'HOIST', 'RIGGING', 'WORK_PLATFORM']
      : heavy ? ['CART', 'HOIST', 'RIGGING'] : [],
  };
}

function route(context: LogisticsPlanningContext, from: string, to: string): {
  route: string[]; verified: boolean;
} {
  const map = context.spatialMap;
  // Even same-zone routes must have a real, non-blocked endpoint.
  if (!map || [from, to].some(id => !map.zones.some(z => z.id === id && z.status !== 'blocked'))) {
    return { route: [], verified: false };
  }
  // Reuse the spatial engine; explicitly restricted transit zones are filtered below.
  const result = checkAccessibility(map, from, to);
  return { route: result.route, verified: result.accessible };
}

export function planEquipmentLogistics(
  plan: PhysicalExecutionPlanV2,
  world: WorldState,
  operation: Operation,
  materialUse: Record<string, number> | undefined,
  durationSeconds: number,
  context: LogisticsPlanningContext = {},
): EquipmentLogisticsPlan {
  const resources: LogisticsResource[] = [];
  const movements: LogisticsMovement[] = [];
  const issues: ValidationIssueV2[] = [];
  const target = plan.intent.authorizedZoneId;
  const delta = (plan.intent.canonicalProgress.targetPercentage - plan.intent.canonicalProgress.beforePercentage) / 100;
  const configuredWorkers = context.workerCount ?? 1;
  const filteredContext = context.spatialMap ? {
    ...context,
    spatialMap: {
      ...context.spatialMap,
      zones: context.spatialMap.zones.map(zone => ({
        ...zone,
        status: context.restrictedRouteZoneIds?.includes(zone.id)
          ? 'blocked' as const : zone.status,
      })),
    },
  } : context;

  const toolIds = unique([
    ...(world.character.currentTool ? [logisticsToolId(world.character.currentTool)] : []),
    ...plan.nodes.flatMap(node => node.toolId ? [logisticsToolId(node.toolId)] : []),
    ...(operation.visualBasis?.tools ?? []).map(logisticsToolId),
  ]);
  const materialIds = unique([...Object.keys(materialUse ?? {}), ...(operation.visualBasis?.materials ?? [])]);
  for (const id of toolIds) {
    const candidates = world.tools.filter(tool => logisticsToolId(tool.toolId) === id);
    const stock = candidates[0];
    if (candidates.length > 1) issues.push({ severity: 'BLOCKER', code: 'LOGISTICS_AMBIGUOUS_TOOL', message: `Select a unique tool instance for ${id}.` });
    const held = world.character.currentTool && logisticsToolId(world.character.currentTool) === id;
    if (stock?.carrier && stock.carrier !== world.character.characterId) {
      issues.push({ severity: 'BLOCKER', code: 'LOGISTICS_TOOL_HANDOFF_REQUIRED', message: `${id} belongs to another worker; a verified handoff is required.` });
    }
    if (stock?.carrier === world.character.characterId && !held) {
      issues.push({ severity: 'BLOCKER', code: 'LOGISTICS_TOOL_CUSTODY_CONFLICT', message: `${id} is assigned to the actor but is not the current held tool; verify custody and pickup before use.` });
    }
    resources.push({
      key: 'tool:' + id, kind: 'TOOL', id,
      sourceZoneId: held ? world.character.currentZone : stock?.location ?? '',
      origin: stock ? 'OFFICIAL tool inventory' : held ? 'OFFICIAL currentTool' : '',
      registered: Boolean(stock || held),
      available: Boolean((stock || held) && stock?.status !== 'indisponivel'),
      ...(held ? { heldBy: world.character.characterId } : stock?.carrier ? { heldBy: stock.carrier } : {}),
    });
  }
  // A component id alone is not a physical source. Flag assembly without declared stock.
  if (!materialIds.length && plan.nodes.some(n => n.effects.some(e => ['COMPONENT_ATTACHED', 'MATERIAL_APPLIED'].includes(e.type)))) {
    issues.push({ severity: 'BLOCKER', code: 'LOGISTICS_MATERIAL_SOURCE_MISSING', message: 'Installation has no declared material stock.' });
  }
  for (const id of materialIds) {
    const stocks = world.materials.filter(item => item.materialId === id);
    const stock = stocks[0];
    if (stocks.length > 1) issues.push({ severity: 'BLOCKER', code: 'LOGISTICS_AMBIGUOUS_STOCK', message: `Select a stock lot for ${id}; do not silently use the first origin.` });
    const requiredQuantity = materialUse?.[id] === undefined ? undefined : materialUse[id] * delta;
    resources.push({
      key: 'material:' + id, kind: 'MATERIAL', id,
      sourceZoneId: stock?.location ?? '', origin: stock?.origin ?? '',
      registered: Boolean(stock),
      available: Boolean(stock && ['disponivel', 'armazenado'].includes(stock.status) && stock.quantity > 0),
      quantity: stock?.quantity, requiredQuantity,
    });
  }

  // Equipment must already be staged (checked in preflight). Handle tools next,
  // then one material piece/batch at a time; no simultaneous double-booking.
  let actorZone = world.character.currentZone;
  for (const resource of [...resources]) {
    const material = world.materials.find(item => item.materialId === resource.id);
    const handling: HandlingProfile = resource.kind === 'MATERIAL'
      ? { ...material?.handling, ...context.handling, ...context.handlingByMaterial?.[resource.id] }
      : { loadClass: 'LIGHT', sizeClass: 'COMPACT', heightClass: 'GROUND' };
    const selected = resolveHandling(handling);
    const placementKind = resource.kind === 'TOOL' || plan.intent.methodId === 'native:apply' ? 'PLACE' : 'FASTEN';
    const held = resource.heldBy === world.character.characterId;
    const approach = route(filteredContext, actorZone, resource.sourceZoneId);
    const transport = route(filteredContext, resource.sourceZoneId, target);
    const equipmentKeys: string[] = [];
    for (const kind of selected.equipmentKinds) {
      const tool = world.tools.find(item => item.equipment?.kind === kind && item.status !== 'indisponivel');
      if (!tool) continue;
      const key = 'equipment:' + tool.toolId;
      equipmentKeys.push(key);
      if (!resources.some(item => item.key === key)) resources.push({
        key, id: tool.toolId, kind: 'EQUIPMENT', sourceZoneId: tool.location,
        origin: 'OFFICIAL equipment inventory', registered: true,
        available: tool.status !== 'indisponivel', equipment: structuredClone(tool.equipment),
      });
    }
    const kinds: PhysicalNodeKind[] = resource.kind === 'TOOL'
      ? held ? materialIds.length || toolIds.length > 1 ? ['APPROACH', 'PLACE', 'RELEASE'] : ['APPROACH', 'INSPECT']
        : ['APPROACH', 'ACQUIRE_TOOL', 'MOVE_MATERIAL', 'PLACE', 'RELEASE']
      : ['APPROACH', 'GRIP', 'LIFT', 'MOVE_MATERIAL', ...(selected.method === 'HOIST' ? ['LIFT' as const] : []), 'POSITION',
          placementKind, 'RELEASE'];
    const steps = kinds.map((kind, index) => {
      const finalHoist = kind === 'LIFT' && index > kinds.indexOf('MOVE_MATERIAL');
      const atSource = (!finalHoist && ['GRIP', 'LIFT', 'ACQUIRE_TOOL'].includes(kind)) || (kind === 'APPROACH' && !held);
      const zoneId = atSource ? resource.sourceZoneId : target;
      const instructions: Partial<Record<PhysicalNodeKind, string>> = {
        APPROACH: held ? `Walk to ${target} retaining the already held ${resource.id}.`
          : `Walk to ${resource.sourceZoneId} to retrieve the registered ${resource.id}.`,
        ACQUIRE_TOOL: `Pick up ${resource.id} from ${resource.sourceZoneId}; do not create a duplicate.`,
        GRIP: selected.transportMethod === 'CART'
          ? `${selected.workers} worker(s) attach the prepared rigging and guide ${resource.id}; do not lift this heavy load by hand.`
          : `${selected.workers} worker(s) grip one ${resource.id} piece/batch at its stock.`,
        LIFT: finalHoist ? `Hoist ${resource.id} at ${target} to the declared working height using prepared anchored rigging and work platform.`
          : selected.transportMethod === 'CART'
            ? `Use the prepared anchored hoist and rigging at ${resource.sourceZoneId} to load ${resource.id} onto the cart; workers guide, never hand-lift the heavy load.`
            : `Lift ${resource.id} at its stock under continuous control.`,
        MOVE_MATERIAL: `Transport ${resource.id} continuously from ${resource.sourceZoneId} to ${target} using ${selected.transportMethod}.`,
        POSITION: `Position ${resource.id} on stable supports at ${target}.`,
        FASTEN: `Keep ${resource.id} supported, take the staged tool, visibly fasten/seat the piece, then return the tool to its support before letting go.`,
        PLACE: resource.kind === 'TOOL' ? `Put ${resource.id} on a stable reachable support before handling material.`
          : `Apply/seat ${resource.id} on the current target.`,
        RELEASE: `Release ${resource.id} only after stable support or attachment.`,
        INSPECT: `Keep the already held ${resource.id} visible; do not pick up a second copy.`,
      };
      return { id: plan.planId + ':logistics:' + resource.key + ':' + index, kind, resourceKey: resource.key, zoneId, instruction: instructions[kind]! };
    });
    movements.push({
      resourceKey: resource.key, destinationZoneId: target,
      approachRoute: approach.route, transportRoute: transport.route,
      routesVerified: approach.verified && transport.verified,
      method: held ? 'ALREADY_HELD' : selected.method,
      transportMethod: selected.transportMethod,
      placementKind,
      handling, requiredWorkers: selected.workers,
      equipmentKinds: selected.equipmentKinds, equipmentKeys, steps,
    });
    actorZone = target;
  }

  return {
    schemaVersion: 'construction-equipment-logistics/1', mode: 'SHADOW',
    officialRevision: plan.officialBefore.revision,
    officialFingerprint: plan.officialBefore.snapshotFingerprint,
    sourceFrameId: context.sourceFrameId, sourceFrameHash: context.sourceFrameHash,
    sourceEvidence: context.sourceEvidence ? structuredClone(context.sourceEvidence) : undefined,
    configuredWorkers, primaryActorId: world.character.characterId, authorizedWorkZoneId: target,
    workerArrivalRoutes: (context.sourceEvidence?.workers ?? []).map(worker => {
      const arrival = route(filteredContext, worker.zoneId, world.character.currentZone);
      return { workerId: worker.id, route: arrival.route, verified: arrival.verified };
    }),
    durationSeconds,
    area: context.area ? structuredClone(context.area) : undefined,
    resources, movements, issues,
    assumptions: [
      'SHADOW ONLY: no resources, workers, Jobs or OFFICIAL images are created.',
      'Blueprint quantities are not kilograms. Handling metadata describes one piece/batch.',
      'Capacity thresholds are visual heuristics, not engineering or safety certification.',
      'Planned inventory is not proof of source-image visibility. Unknown evidence requires review.',
    ],
  };
}
