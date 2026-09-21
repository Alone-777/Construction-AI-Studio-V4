import type { WorldState } from '../../types/world-state';
import type { PhysicalActionIR } from '../physical-action-ir';
import { canonicalToolId } from './affordances';
import { deriveOfficialRevision, fingerprintValue } from './simulator';
import {
  CONSTRUCTION_INTENT_SCHEMA,
  PHYSICAL_EXECUTION_PLAN_SCHEMA,
  type ObservationContract,
  type PhysicalActionEdgeV2,
  type PhysicalActionNodeV2,
  type PhysicalEffect,
  type PhysicalExecutionPlanV2,
  type PhysicalNodeKind,
} from './types';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function primaryNodeKind(ir: PhysicalActionIR): PhysicalNodeKind {
  const mapping: Record<PhysicalActionIR['primaryAction']['type'], PhysicalNodeKind> = {
    INSPECT: 'INSPECT',
    POSITION: 'POSITION',
    CUT: 'CUT',
    FASTEN: 'FASTEN',
    ASSEMBLE: 'PLACE',
    INSTALL: 'FASTEN',
    REMOVE: 'SCRAPE',
    APPLY: 'PLACE',
    EXCAVATE: 'DIG',
    OTHER: 'APPLY_FORCE',
  };
  return mapping[ir.primaryAction.type];
}

function contactMode(
  kind: PhysicalNodeKind,
): NonNullable<PhysicalActionNodeV2['contact']>['mode'] {
  if (kind === 'CUT') return 'CUT';
  if (kind === 'FASTEN') return 'FASTEN';
  if (kind === 'DIG') return 'DIG';
  if (kind === 'SCRAPE') return 'SCRAPE';
  if (kind === 'PLACE' || kind === 'POSITION') return 'PLACE';
  return 'PRESS';
}

function matterEffect(
  ir: PhysicalActionIR,
  kind: PhysicalNodeKind,
  targetId: string,
  zoneId: string,
  materialId?: string,
): PhysicalEffect {
  if ((kind === 'DIG' || kind === 'SCRAPE') && materialId) {
    return {
      type: 'SURFACE_REMOVED',
      materialId,
      zoneId,
      destinationZoneId: zoneId + ':spoil',
    };
  }

  if (
    (kind === 'FASTEN' || kind === 'PLACE')
    && ir.primaryAction.type !== 'APPLY'
  ) {
    return {
      type: 'COMPONENT_ATTACHED',
      componentId: targetId,
      targetEntityId: targetId,
      sourceZoneId: zoneId,
      zoneId,
    };
  }

  return {
    type: 'STATE_CHANGED',
    entityId: targetId,
    property: 'legacy-action',
    to: ir.primaryAction.verb,
    zoneId,
  };
}

export interface LegacyPhysicalActionAdapterOptions {
  beforePercentage: number;
  targetPercentage: number;
  methodId?: string;
  authorizedZoneId?: string;
  allowedMaterialDestinationZoneIds?: string[];
}

export function legacyPhysicalActionIRToV2Plan(
  ir: PhysicalActionIR,
  official: WorldState,
  options: LegacyPhysicalActionAdapterOptions,
): PhysicalExecutionPlanV2 {
  const officialRevision = deriveOfficialRevision(official);
  const targetId = ir.target.id || ir.operationId;
  const actorId = ir.actor.characterId || official.character.characterId;
  const zoneId =
    options.authorizedZoneId || ir.zone || official.activeZone;
  const materialId = ir.materials[0];
  const toolId = canonicalToolId(ir.tools[0]);
  const kind = primaryNodeKind(ir);
  const evidenceId = 'v2:evidence:' + ir.id;

  const evidence: ObservationContract[] = [{
    id: evidenceId,
    entityIds: unique([
      targetId,
      ...(materialId ? [materialId] : []),
    ]),
    relation: 'LEGACY_VISIBLE_RESULT',
    metric: 'canonical-stage',
    expected: {
      beforePercentage: options.beforePercentage,
      targetPercentage: options.targetPercentage,
    },
    visibleIn: 'TERMINAL_FRAME',
    mustPersist: true,
  }];

  const nodes: PhysicalActionNodeV2[] = [];
  const edges: PhysicalActionEdgeV2[] = [];
  const add = (node: PhysicalActionNodeV2) => {
    const previous = nodes.at(-1);
    nodes.push(node);
    if (previous) {
      edges.push({
        from: previous.id,
        to: node.id,
        relation: 'SEQUENCE',
      });
    }
  };

  if (toolId) {
    add({
      id: ir.id + ':acquire',
      kind: 'ACQUIRE_TOOL',
      instruction: 'Take and control the existing ' + toolId + '.',
      actorId,
      toolId,
      sourceEntityIds: [],
      targetEntityIds: [],
      zoneId,
      effects: [],
      preconditions: [],
      postconditions: [{ type: 'TOOL_HELD', toolId }],
      evidenceIds: [],
    });

    add({
      id: ir.id + ':grip',
      kind: 'GRIP',
      instruction:
        'Grip the ' + toolId + ' securely before acting on the target.',
      actorId,
      toolId,
      sourceEntityIds: [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: ir.id + ':grip-contact',
        mode: 'GRIP',
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [],
      preconditions: [{ type: 'TOOL_HELD', toolId }],
      postconditions: [],
      evidenceIds: [],
    });
  }

  if (kind !== 'INSPECT') {
    add({
      id: ir.id + ':position',
      kind: 'POSITION',
      instruction:
        'Position the actor and active tool on ' + ir.target.label
        + ' before the physical action.',
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId ? [materialId] : [],
      targetEntityIds: [targetId],
      zoneId,
      effects: [],
      preconditions: toolId
        ? [{ type: 'TOOL_HELD', toolId }]
        : [],
      postconditions: [],
      evidenceIds: [],
    });

    add({
      id: ir.id + ':contact',
      kind: 'CONTACT',
      instruction:
        'Show continuous contact with ' + ir.target.label
        + ' before the visible change.',
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId ? [materialId] : [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: ir.id + ':target-contact',
        mode: contactMode(kind),
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [],
      preconditions: toolId
        ? [{ type: 'TOOL_HELD', toolId }]
        : [],
      postconditions: [],
      evidenceIds: [],
    });
  }

  const effects: PhysicalEffect[] = kind === 'INSPECT'
    ? []
    : [
        matterEffect(ir, kind, targetId, zoneId, materialId),
        {
          type: 'CANONICAL_PROGRESS_ADVANCED',
          targetId,
          fromPercentage: options.beforePercentage,
          toPercentage: options.targetPercentage,
        },
      ];

  add({
    id: ir.id + ':action',
    kind,
    instruction:
      ir.primaryAction.description || ir.primaryAction.verb,
    actorId,
    ...(toolId ? { toolId } : {}),
    sourceEntityIds: materialId ? [materialId] : [],
    targetEntityIds: [targetId],
    zoneId,
    ...(kind !== 'INSPECT'
      ? {
          contact: {
            id: ir.id + ':action-contact',
            mode: contactMode(kind),
            required: true,
            zoneId,
            targetEntityId: targetId,
          },
        }
      : {}),
    effects,
    preconditions: kind !== 'INSPECT'
      ? [{
          type: 'CONTACT_ESTABLISHED',
          contactId: ir.id + ':target-contact',
        }]
      : [],
    postconditions: effects.some(
      effect => effect.type === 'CANONICAL_PROGRESS_ADVANCED',
    )
      ? [{
          type: 'CANONICAL_PROGRESS_AT',
          targetId,
          percentage: options.targetPercentage,
        }]
      : [],
    evidenceIds: effects.length ? [evidenceId] : [],
  });

  add({
    id: ir.id + ':inspect',
    kind: 'INSPECT',
    instruction:
      'Hold the result visibly and verify the changed target remains on screen.',
    actorId,
    ...(toolId ? { toolId } : {}),
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: [],
    postconditions: [],
    evidenceIds: [evidenceId],
  });

  add({
    id: ir.id + ':stop',
    kind: 'STOP',
    instruction:
      'Stop physical progress at the canonical '
      + options.targetPercentage
      + '% target.',
    actorId,
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: [],
    postconditions: [],
    evidenceIds: [evidenceId],
  });

  const limitations = [
    'LEGACY_IR_HAS_NO_TYPED_CONTACT_GRAPH',
    'LEGACY_IR_HAS_NO_PHYSICAL_PROGRESS_MEASURE',
  ];
  if (!materialId) limitations.push('LEGACY_MATERIAL_UNKNOWN');
  if (!toolId) limitations.push('LEGACY_TOOL_UNKNOWN');

  return {
    schemaVersion: PHYSICAL_EXECUTION_PLAN_SCHEMA,
    planId: 'v2:legacy:' + ir.id,
    officialBefore: {
      revision: officialRevision,
      timestamp: official.timestamp,
      snapshotFingerprint: fingerprintValue(official),
    },
    intent: {
      schemaVersion: CONSTRUCTION_INTENT_SCHEMA,
      operationId: ir.operationId,
      targetEntityId: targetId,
      methodId:
        options.methodId
        || 'legacy:' + ir.primaryAction.type.toLowerCase(),
      authorizedZoneId: zoneId,
      officialRevision,
      canonicalProgress: {
        beforePercentage: options.beforePercentage,
        targetPercentage: options.targetPercentage,
        tolerancePercentage: 0,
      },
      temporalConstraints: {
        preserveComponentIds:
          unique(ir.constraints.preserveComponents),
        forbiddenFutureComponentIds:
          unique(
            ir.constraints.forbiddenFutureComponents
              .filter(id => id !== targetId),
          ),
        preserveZoneIds:
          unique(ir.constraints.preserveZones),
        allowedMaterialDestinationZoneIds:
          unique([
            ...(options.allowedMaterialDestinationZoneIds ?? []),
            zoneId + ':spoil',
          ]),
      },
    },
    nodes,
    edges,
    evidence,
    constraints: {
      stopAtTarget: true,
      requirePersistentEffects: true,
    },
    metadata: {
      source: 'LEGACY_PHYSICAL_ACTION_IR',
      confidence: 'LOW',
      limitations,
    },
  };
}
