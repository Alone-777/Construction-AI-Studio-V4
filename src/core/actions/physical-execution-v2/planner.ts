import type { Operation, Scene, Stage } from '../../types/scene';
import type { WorldState } from '../../types/world-state';
import { canonicalToolId, resolveToolAffordance } from './affordances';
import { deriveOfficialRevision, fingerprintValue } from './simulator';
import { planEquipmentLogistics } from './logistics';
import type { LogisticsPlanningContext } from './logistics-types';
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

type MethodKind =
  | 'MARK'
  | 'CLEAR'
  | 'EXCAVATE'
  | 'ASSEMBLE'
  | 'CUT_AND_ASSEMBLE'
  | 'POSITION_INSTALL'
  | 'APPLY'
  | 'OTHER';

export interface PlanPhysicalExecutionV2Input {
  scene: Scene;
  stage: Stage;
  operation: Operation;
  worldStateBefore: WorldState;
  beforePercentage: number;
  materialUse?: Record<string, number>;
  logisticsContext?: LogisticsPlanningContext;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function classifyMethod(
  operation: Operation,
  stage: Stage,
): MethodKind {
  const operationText = normalize([
    operation.type,
    operation.name,
  ].join(' '));

  // Operation identity is authoritative. Stage text often contains preservation
  // constraints about earlier/later operations (for example a cleaning stage
  // that says to preserve stakes and rope), and those words must not reclassify
  // the current operation.
  if (
    operationText.includes('marcacao')
    || operationText.includes('marcar')
  ) {
    return 'MARK';
  }

  if (
    operationText.includes('escav')
    || operationText.includes('fundacao')
    || operationText.includes('sapata')
  ) {
    return 'EXCAVATE';
  }

  if (
    operationText.includes('limpeza')
    || operationText.includes('preparacao seletiva')
  ) {
    return 'CLEAR';
  }

  const text = normalize([
    operationText,
    stage.physicalAction,
  ].join(' '));

  if (
    text.includes('marcacao')
    || text.includes('marcar')
    || text.includes('perimetro')
    || text.includes('estaca')
  ) {
    return 'MARK';
  }

  if (
    text.includes('escav')
    || text.includes('fundacao')
    || text.includes('sapata')
  ) {
    return 'EXCAVATE';
  }

  if (
    text.includes('limpeza')
    || text.includes('preparacao seletiva')
    || text.includes('remover')
    || text.includes('obstaculo')
  ) {
    return 'CLEAR';
  }

  const hasCut = text.includes('cortar') || text.includes('corte');
  const hasAssemble =
    text.includes('montar')
    || text.includes('fixar')
    || text.includes('encaixar')
    || text.includes('travar')
    || text.includes('assentar');
  if (hasCut && hasAssemble) return 'CUT_AND_ASSEMBLE';

  if (
    text.includes('aplicar')
    || text.includes('camada final')
    || text.includes('regularizar')
    || text.includes('compactar')
  ) {
    return 'APPLY';
  }

  if (
    text.includes('elevar')
    || text.includes('aprumar')
    || text.includes('posicionar')
    || text.includes('alinhar')
    || text.includes('ancoragem')
  ) {
    return 'POSITION_INSTALL';
  }

  if (
    hasAssemble
    || text.includes('fechamento')
    || text.includes('parede')
    || text.includes('piso')
    || text.includes('viga')
    || text.includes('cobertura')
    || text.includes('porta')
  ) {
    return 'ASSEMBLE';
  }

  return 'OTHER';
}

function firstMaterial(
  operation: Operation,
  materialUse?: Record<string, number>,
): string | undefined {
  return Object.keys(materialUse ?? {})[0]
    ?? operation.visualBasis?.materials?.[0];
}

function materialSourceZone(
  world: WorldState,
  materialId?: string,
): string | undefined {
  if (!materialId) return undefined;
  return world.materials.find(item => item.materialId === materialId)?.location;
}

function toolLocation(
  world: WorldState,
  rawToolId?: string,
): string | undefined {
  if (!rawToolId) return undefined;
  const canonical = canonicalToolId(rawToolId);
  return world.tools.find(item =>
    canonicalToolId(item.toolId) === canonical,
  )?.location;
}

function contactModeFor(
  kind: PhysicalNodeKind,
): NonNullable<PhysicalActionNodeV2['contact']>['mode'] {
  if (kind === 'CUT') return 'CUT';
  if (kind === 'SCRAPE') return 'SCRAPE';
  if (kind === 'DIG') return 'DIG';
  if (kind === 'FASTEN') return 'FASTEN';
  if (kind === 'PLACE' || kind === 'POSITION') return 'PLACE';
  if (kind === 'INSPECT') return 'INSPECT';
  return 'PRESS';
}

function methodRelation(
  method: MethodKind,
  beforePercentage?: number,
  targetPercentage?: number,
): string {
  if (method === 'MARK') {
    if (beforePercentage === 0 && targetPercentage === 50) {
      return 'FOUR_CORNER_STAKES_REMAIN_VISIBLE_AND_FIXED';
    }
    if (beforePercentage === 50 && targetPercentage === 100) {
      return 'MARKED_FOOTPRINT_REMAINS_VISIBLE_AND_ALIGNED';
    }
    return 'MARKING_PROGRESS_REMAINS_VISIBLE';
  }
  if (method === 'CLEAR') return 'BOUNDED_SURFACE_CLEARING_PERSISTS';
  if (method === 'EXCAVATE') return 'BOUNDED_EXCAVATION_AND_SPOIL_PERSIST';
  if (method === 'APPLY') return 'APPLIED_MATERIAL_REMAINS_ON_TARGET';
  if (method === 'CUT_AND_ASSEMBLE') return 'CUT_PIECE_IS_POSITIONED_AND_REMAINS_ATTACHED';
  if (method === 'POSITION_INSTALL') return 'POSITIONED_COMPONENT_REMAINS_AT_TARGET';
  if (method === 'ASSEMBLE') return 'ASSEMBLED_COMPONENT_REMAINS_ATTACHED';
  return 'PHYSICAL_CHANGE_REMAINS_VISIBLE';
}

function targetIdFor(operation: Operation): string {
  return operation.componentId ?? operation.elements?.[0] ?? operation.id;
}

function effectForMethod(
  method: MethodKind,
  targetId: string,
  zoneId: string,
  materialId: string | undefined,
  materialSource: string | undefined,
  world: WorldState,
  stageDelta: number,
  targetPercentage: number,
  materialUse?: Record<string, number>,
): PhysicalEffect {
  if (method === 'MARK') {
    return {
      type: 'STATE_CHANGED',
      entityId: targetId,
      property: 'site-marking',
      to: targetPercentage === 50
        ? 'four-corner-stakes-installed'
        : targetPercentage === 100
          ? 'rope-perimeter-taut-and-aligned'
          : 'visible-marking-progress',
      zoneId,
    };
  }

  if (method === 'CLEAR') {
    return {
      type: 'SURFACE_REMOVED',
      materialId: 'vegetation',
      zoneId,
      destinationZoneId: zoneId + ':spoil',
    };
  }

  if (method === 'EXCAVATE') {
    return {
      type: 'SURFACE_REMOVED',
      materialId: world.terrain.soil || 'soil',
      zoneId,
      destinationZoneId: zoneId + ':spoil',
    };
  }

  const totalUse = materialId
    ? Number(materialUse?.[materialId] ?? NaN)
    : NaN;
  const proportionalQuantity =
    Number.isFinite(totalUse) && totalUse > 0
      ? totalUse * (stageDelta / 100)
      : null;

  if (method === 'APPLY' && materialId && proportionalQuantity !== null) {
    return {
      type: 'MATERIAL_APPLIED',
      materialId,
      quantity: {
        value: proportionalQuantity,
        unit: 'blueprint-unit',
      },
      targetEntityId: targetId,
      ...(materialSource ? { fromZoneId: materialSource } : {}),
      zoneId,
    };
  }

  if (
    method === 'ASSEMBLE'
    || method === 'CUT_AND_ASSEMBLE'
    || method === 'POSITION_INSTALL'
  ) {
    return {
      type: 'COMPONENT_ATTACHED',
      componentId: targetId,
      targetEntityId: targetId,
      ...(materialSource ? { sourceZoneId: materialSource } : {}),
      zoneId,
    };
  }

  return {
    type: 'STATE_CHANGED',
    entityId: targetId,
    property: 'physical-operation',
    to: 'advanced',
    zoneId,
  };
}

function actionKindForMethod(
  method: MethodKind,
  toolId?: string,
): PhysicalNodeKind {
  if (method === 'MARK') return 'PLACE';
  if (method === 'CLEAR') {
    const canonical = canonicalToolId(toolId);
    return canonical === 'machete' || canonical === 'axe' ? 'CUT' : 'SCRAPE';
  }
  if (method === 'EXCAVATE') return 'DIG';
  if (method === 'APPLY') return 'PLACE';
  if (method === 'ASSEMBLE') return 'FASTEN';
  if (method === 'POSITION_INSTALL') return 'PLACE';
  if (method === 'CUT_AND_ASSEMBLE') return 'CUT';
  return 'APPLY_FORCE';
}

function actionInstruction(
  method: MethodKind,
  operation: Operation,
  toolId: string | undefined,
  targetLabel: string,
  beforePercentage?: number,
  targetPercentage?: number,
): string {
  const toolText = toolId ? ' with the ' + toolId : '';
  if (method === 'MARK') {
    if ((beforePercentage ?? -1) === 0 && targetPercentage === 50) {
      return 'Install exactly four existing slender wooden corner stakes one by one: carry one stake to each corner of the intended footprint, press each stake firmly into the soil by hand, and leave all four upright and clearly separated. Keep the existing rope coiled and unused; do not tension it yet.';
    }
    if (beforePercentage === 50 && targetPercentage === 100) {
      return 'Keep all four installed corner stakes fixed. Unroll the existing rope, route it continuously from stake to stake, wrap or guide it around each stake, pull every side taut, adjust the alignment by hand, and finish with one clearly visible closed rope perimeter. Do not move or replace the stakes.';
    }
    return 'Measure the bounded footprint, place visible corner stakes one by one by pressing the slender stakes into the soil by hand, then pull the rope taut between them'
      + toolText
      + ', adjust the line by hand, and leave a clear aligned perimeter visibly marked on the ground.';
  }
  if (method === 'CLEAR') {
    return 'Cut/scrape only the bounded current patch inside the marked footprint using short repeated contacts' + toolText
      + '; after each contact pull or move cut vegetation aside, progressively expose the ground, keep the marking stakes and rope visible, and leave all vegetation outside the marked perimeter untouched.';
  }
  if (method === 'EXCAVATE') {
    return 'Excavate the bounded current section' + toolText
      + ', lift removed soil visibly, and place spoil beside the excavation.';
  }
  if (method === 'APPLY') {
    return 'Take the current material from its visible source and apply/regularize it'
      + toolText + ' only on the bounded target section.';
  }
  if (method === 'ASSEMBLE') {
    return 'Position the current piece on ' + targetLabel + toolText
      + ' and visibly secure it before moving to the next piece.';
  }
  if (method === 'POSITION_INSTALL') {
    return 'Lift/position the current component on ' + targetLabel + toolText
      + ' and leave it visibly seated at the intended location.';
  }
  if (method === 'CUT_AND_ASSEMBLE') {
    return 'Cut only the required current piece' + toolText
      + ' before positioning it on ' + targetLabel + '.';
  }
  return operation.name + ': perform one bounded visible physical action' + toolText
    + ' that leaves a persistent result.';
}

function cutEffect(
  targetId: string,
  zoneId: string,
  materialId: string | undefined,
): PhysicalEffect {
  return {
    type: 'STATE_CHANGED',
    entityId: materialId ?? targetId,
    property: 'cut-state',
    to: 'prepared-for-current-installation',
    zoneId,
  };
}

export function planPhysicalExecutionV2({
  scene,
  stage,
  operation,
  worldStateBefore,
  beforePercentage,
  materialUse,
  logisticsContext,
}: PlanPhysicalExecutionV2Input): PhysicalExecutionPlanV2 {
  if (stage.percentage <= 0) {
    throw new Error('PhysicalExecutionPlan V2 native planning requires a positive construction stage.');
  }

  const targetPercentage = stage.percentage;
  const stageDelta = targetPercentage - beforePercentage;
  if (stageDelta <= 0) {
    throw new Error('PhysicalExecutionPlan V2 requires increasing canonical progress.');
  }

  const method = classifyMethod(operation, stage);
  const targetId = targetIdFor(operation);
  const targetLabel = operation.name || targetId;
  const zoneId = stage.activeZone || worldStateBefore.activeZone;
  const rawToolId =
    stage.tool
    ?? operation.visualBasis?.tools?.[0];
  const isStakeMilestone =
    method === 'MARK' && beforePercentage === 0 && targetPercentage === 50;
  const isRopeMilestone =
    method === 'MARK' && beforePercentage === 50 && targetPercentage === 100;
  const isFilmableMarkingMilestone = isStakeMilestone || isRopeMilestone;
  const effectiveRawToolId = isStakeMilestone ? undefined : rawToolId;
  const toolId = effectiveRawToolId
    ? canonicalToolId(effectiveRawToolId) ?? effectiveRawToolId
    : undefined;
  const materialId = firstMaterial(operation, materialUse);
  const sourceZone = materialSourceZone(worldStateBefore, materialId);
  const officialRevision = deriveOfficialRevision(worldStateBefore);
  const evidenceId =
    'v2:evidence:' + scene.id + ':' + operation.id + ':' + targetPercentage;

  const evidence: ObservationContract[] = [{
    id: evidenceId,
    entityIds: unique([
      targetId,
      ...(materialId ? [materialId] : []),
    ]),
    relation: methodRelation(method, beforePercentage, targetPercentage),
    metric: isFilmableMarkingMilestone ? 'physical-milestone' : 'canonical-stage',
    expected: {
      beforePercentage,
      targetPercentage,
      terminalDescription: isStakeMilestone
        ? 'Exactly four corner stakes are upright and fixed in the ground; the rope remains coiled and unused.'
        : isRopeMilestone
          ? 'All four corner stakes remain fixed and a closed rope perimeter is taut, straight, aligned and clearly visible.'
          : (stage.visualEvidence?.[0]
            ?? ('Visible persistent result for ' + targetLabel)),
    },
    visibleIn: 'TERMINAL_FRAME',
    mustPersist: true,
  }];

  const nodes: PhysicalActionNodeV2[] = [];
  const edges: PhysicalActionEdgeV2[] = [];
  const add = (node: PhysicalActionNodeV2) => {
    const previous = nodes.length ? nodes[nodes.length - 1] : undefined;
    nodes.push(node);
    if (previous) {
      edges.push({
        from: previous.id,
        to: node.id,
        relation: 'SEQUENCE',
      });
    }
  };

  const actorId = worldStateBefore.character.characterId;
  let actorZone = worldStateBefore.character.currentZone;
  const rawToolLocation = toolLocation(worldStateBefore, effectiveRawToolId);

  if (toolId && rawToolLocation && actorZone !== rawToolLocation) {
    add({
      id: evidenceId + ':approach-tool',
      kind: 'APPROACH',
      instruction: 'Move continuously to the visible ' + toolId + ' before starting work.',
      actorId,
      sourceEntityIds: [],
      targetEntityIds: [],
      zoneId: rawToolLocation,
      effects: [],
      preconditions: [],
      postconditions: [{ type: 'ACTOR_IN_ZONE', zoneId: rawToolLocation }],
      evidenceIds: [],
    });
    actorZone = rawToolLocation;
  }

  if (toolId) {
    add({
      id: evidenceId + ':acquire-tool',
      kind: 'ACQUIRE_TOOL',
      instruction: 'Take control of the existing ' + toolId + ' before acting on the construction target.',
      actorId,
      toolId,
      sourceEntityIds: [],
      targetEntityIds: [],
      zoneId: actorZone,
      effects: [],
      preconditions: [
        { type: 'TOOL_AVAILABLE', toolId },
        { type: 'ACTOR_IN_ZONE', zoneId: actorZone },
      ],
      postconditions: [{ type: 'TOOL_HELD', toolId }],
      evidenceIds: [],
    });

    add({
      id: evidenceId + ':grip-tool',
      kind: 'GRIP',
      instruction: 'Grip the ' + toolId + ' securely and keep it under visible control.',
      actorId,
      toolId,
      sourceEntityIds: [],
      targetEntityIds: [],
      zoneId: actorZone,
      contact: {
        id: evidenceId + ':tool-grip',
        mode: 'GRIP',
        required: true,
        zoneId: actorZone,
      },
      effects: [],
      preconditions: [{ type: 'TOOL_HELD', toolId }],
      postconditions: [],
      evidenceIds: [],
    });
  }

  if (actorZone !== zoneId) {
    add({
      id: evidenceId + ':approach-target',
      kind: 'APPROACH',
      instruction: 'Move continuously into the bounded active work zone without changing construction.',
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: [],
      targetEntityIds: [targetId],
      zoneId,
      effects: [],
      preconditions: toolId ? [{ type: 'TOOL_HELD', toolId }] : [],
      postconditions: [{ type: 'ACTOR_IN_ZONE', zoneId }],
      evidenceIds: [],
    });
  }

  add({
    id: evidenceId + ':position',
    kind: 'POSITION',
    instruction: isStakeMilestone
      ? 'Keep the four existing loose stakes visible. Work on one intended corner at a time and do not create extra stakes.'
      : isRopeMilestone
        ? 'Keep the four installed stakes fixed. Position the worker and the existing rope at the first stake before unrolling it.'
        : 'Position actor, tool and current material at the bounded target section before changing it.',
    actorId,
    ...(toolId ? { toolId } : {}),
    sourceEntityIds: materialId ? [materialId] : [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: toolId ? [{ type: 'TOOL_HELD', toolId }] : [],
    postconditions: [],
    evidenceIds: [],
  });

  const primaryKind = actionKindForMethod(method, toolId);

  if (method === 'CUT_AND_ASSEMBLE') {
    add({
      id: evidenceId + ':cut-contact',
      kind: 'CONTACT',
      instruction: 'Bring the cutting edge into visible contact with only the current piece.',
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId ? [materialId] : [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: evidenceId + ':cut-contact-id',
        mode: 'CUT',
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [],
      preconditions: toolId ? [{ type: 'TOOL_HELD', toolId }] : [],
      postconditions: [],
      evidenceIds: [],
    });

    add({
      id: evidenceId + ':cut',
      kind: 'CUT',
      instruction: actionInstruction(
        method, operation, toolId, targetLabel, beforePercentage, targetPercentage,
      ),
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId ? [materialId] : [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: evidenceId + ':cut-action-contact',
        mode: 'CUT',
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [cutEffect(targetId, zoneId, materialId)],
      preconditions: [{
        type: 'CONTACT_ESTABLISHED',
        contactId: evidenceId + ':cut-contact-id',
      }],
      postconditions: [],
      evidenceIds: [evidenceId],
    });

    add({
      id: evidenceId + ':place-after-cut',
      kind: 'PLACE',
      instruction: 'Lift and place the prepared current piece onto ' + targetLabel
        + ' by continuous visible hand/tool handling.',
      actorId,
      sourceEntityIds: materialId ? [materialId] : [targetId],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: evidenceId + ':place-after-cut-contact',
        mode: 'PLACE',
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [
        effectForMethod(
          method,
          targetId,
          zoneId,
          materialId,
          sourceZone,
          worldStateBefore,
          stageDelta,
          targetPercentage,
          materialUse,
        ),
        {
          type: 'CANONICAL_PROGRESS_ADVANCED',
          targetId,
          fromPercentage: beforePercentage,
          toPercentage: targetPercentage,
        },
      ],
      preconditions: [],
      postconditions: [{
        type: 'CANONICAL_PROGRESS_AT',
        targetId,
        percentage: targetPercentage,
      }],
      evidenceIds: [evidenceId],
    });
  } else {
    add({
      id: evidenceId + ':target-contact',
      kind: 'CONTACT',
      instruction: isStakeMilestone
        ? 'Place the first existing wooden stake at a visible corner point and touch it with both hands before pressing it into the soil.'
        : isRopeMilestone
          ? 'Bring the existing loose rope into visible contact with the first installed corner stake before routing it around the perimeter.'
          : 'Establish visible physical contact with ' + targetLabel
            + ' before the transformation begins.',
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId ? [materialId] : [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: evidenceId + ':target-contact-id',
        mode: contactModeFor(primaryKind),
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [],
      preconditions: toolId ? [{ type: 'TOOL_HELD', toolId }] : [],
      postconditions: [],
      evidenceIds: [],
    });

    add({
      id: evidenceId + ':primary-action',
      kind: primaryKind,
      instruction: actionInstruction(
        method, operation, toolId, targetLabel, beforePercentage, targetPercentage,
      ),
      actorId,
      ...(toolId ? { toolId } : {}),
      sourceEntityIds: materialId
        ? [materialId]
        : method === 'CLEAR' || method === 'EXCAVATE'
          ? [method === 'CLEAR' ? 'vegetation' : (worldStateBefore.terrain.soil || 'soil')]
          : [targetId],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: evidenceId + ':primary-contact',
        mode: contactModeFor(primaryKind),
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [
        effectForMethod(
          method,
          targetId,
          zoneId,
          materialId,
          sourceZone,
          worldStateBefore,
          stageDelta,
          targetPercentage,
          materialUse,
        ),
        {
          type: 'CANONICAL_PROGRESS_ADVANCED',
          targetId,
          fromPercentage: beforePercentage,
          toPercentage: targetPercentage,
        },
      ],
      preconditions: [{
        type: 'CONTACT_ESTABLISHED',
        contactId: evidenceId + ':target-contact-id',
      }],
      postconditions: [{
        type: 'CANONICAL_PROGRESS_AT',
        targetId,
        percentage: targetPercentage,
      }],
      evidenceIds: [evidenceId],
    });
  }

  add({
    id: evidenceId + ':inspect',
    kind: 'INSPECT',
    instruction: isStakeMilestone
      ? 'Finish with exactly four upright corner stakes clearly visible and separated; keep the rope coiled and unused, then pause so the milestone is easy to verify.'
      : isRopeMilestone
        ? 'Finish with all four stakes fixed and the rope visibly taut on every side of the closed perimeter; step back and pause so the complete marking remains stable and readable.'
        : 'Keep the changed section visible, show that it persists, and show the remaining unfinished work.',
    actorId,
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: [{
      type: 'CANONICAL_PROGRESS_AT',
      targetId,
      percentage: targetPercentage,
    }],
    postconditions: [],
    evidenceIds: [evidenceId],
  });

  add({
    id: evidenceId + ':stop',
    kind: 'STOP',
    instruction: isFilmableMarkingMilestone
      ? 'Stop after this physical marking milestone; do not begin selective clearing or any later construction operation.'
      : 'Stop construction at exactly the canonical '
        + targetPercentage
        + '% stage; do not begin any later operation.',
    actorId,
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: [{
      type: 'CANONICAL_PROGRESS_AT',
      targetId,
      percentage: targetPercentage,
    }],
    postconditions: [],
    evidenceIds: [evidenceId],
  });

  const limitations = isFilmableMarkingMilestone
    ? []
    : ['PHYSICAL_PROGRESS_MEASURE_NOT_AVAILABLE_FROM_CURRENT_BLUEPRINT'];
  if (toolId && !resolveToolAffordance(toolId)) limitations.push('TOOL_AFFORDANCE_UNKNOWN');
  if (!materialId && !['MARK', 'CLEAR', 'EXCAVATE', 'OTHER'].includes(method)) {
    limitations.push('MATERIAL_SOURCE_NOT_DECLARED');
  }

  const plan: PhysicalExecutionPlanV2 = {
    schemaVersion: PHYSICAL_EXECUTION_PLAN_SCHEMA,
    planId:
      'v2:native:' + scene.id + ':' + operation.id + ':'
      + beforePercentage + '-' + targetPercentage,
    officialBefore: {
      revision: officialRevision,
      timestamp: worldStateBefore.timestamp,
      snapshotFingerprint: fingerprintValue(worldStateBefore),
    },
    intent: {
      schemaVersion: CONSTRUCTION_INTENT_SCHEMA,
      operationId: operation.id,
      targetEntityId: targetId,
      methodId: 'native:' + method.toLowerCase(),
      authorizedZoneId: zoneId,
      officialRevision,
      canonicalProgress: {
        beforePercentage,
        targetPercentage,
        tolerancePercentage: 0,
      },
      temporalConstraints: {
        preserveComponentIds: unique(worldStateBefore.existingComponents),
        forbiddenFutureComponentIds: unique(
          worldStateBefore.futureComponents.filter(id => id !== targetId),
        ),
        preserveZoneIds: unique(stage.preservedZones),
        allowedMaterialSourceZoneIds: sourceZone ? [sourceZone] : [],
        allowedMaterialDestinationZoneIds: [zoneId + ':spoil'],
      },
    },
    nodes,
    edges,
    evidence,
    constraints: {
      stopAtTarget: true,
      requirePersistentEffects: true,
      maxSubactions: 12,
    },
    metadata: {
      source: 'NATIVE_V2',
      confidence: limitations.length === 0
        ? 'HIGH'
        : limitations.length === 1
          ? 'MEDIUM'
          : 'LOW',
      limitations,
    },
  };
  // Child contract only. Do not alter the operational graph or its prompt yet.
  try {
    plan.equipmentLogisticsPlan = planEquipmentLogistics(
      plan, worldStateBefore, operation, materialUse, scene.duration, logisticsContext,
    );
  } catch (error) {
    plan.logisticsError = error instanceof Error ? error.message : String(error);
  }
  return plan;
}
