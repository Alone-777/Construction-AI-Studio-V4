import type { Operation, Scene, Stage } from '../types/scene';
import type { WorldState } from '../types/world-state';

export type PhysicalActionType =
  | 'INSPECT'
  | 'POSITION'
  | 'CUT'
  | 'FASTEN'
  | 'ASSEMBLE'
  | 'INSTALL'
  | 'REMOVE'
  | 'APPLY'
  | 'EXCAVATE'
  | 'OTHER';

export type PhysicalTargetStatus = 'ABSENT' | 'FUTURE' | 'PARTIAL' | 'COMPLETE';

export interface PhysicalActionState {
  targetStatus: PhysicalTargetStatus;
  constructionProgress: number;
  actorZone: string;
  materialQuantities: Record<string, number>;
}

export interface PhysicalActionIR {
  id: string;
  sceneId: string;
  stageId: string;
  operationId: string;
  primaryAction: {
    type: PhysicalActionType;
    verb: string;
    description: string;
  };
  actor: {
    characterId: string;
  };
  target: {
    id: string;
    label: string;
    elements: string[];
  };
  zone: string;
  tools: string[];
  materials: string[];
  preconditions: string[];
  expectedEffects: {
    constructionProgress: { before: number; after: number };
    targetStatus: { before: PhysicalTargetStatus; after: PhysicalTargetStatus };
    actorZone: { before: string; after: string };
    materialQuantityChanges: Array<{ materialId: string; before: number; after: number }>;
    newlyCompletedComponents: string[];
    newlyPartialComponents: string[];
  };
  before: PhysicalActionState;
  after: PhysicalActionState;
  constraints: {
    preserveActorId: string;
    allowedZone: string;
    preserveComponents: string[];
    preserveZones: string[];
    forbiddenFutureComponents: string[];
    preventPrematureElements: string[];
  };
  evidence: string[];
}

export interface CompilePhysicalActionIRInput {
  scene: Scene;
  stage: Stage;
  operation: Operation;
  worldStateBefore: WorldState;
  candidateState: WorldState;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function targetStatus(state: WorldState, targetId: string): PhysicalTargetStatus {
  if (state.existingComponents.includes(targetId)) return 'COMPLETE';
  if (state.partialComponents.includes(targetId)) return 'PARTIAL';
  if (state.futureComponents.includes(targetId)) return 'FUTURE';
  return 'ABSENT';
}

function materialQuantities(state: WorldState, materialIds: string[]): Record<string, number> {
  return Object.fromEntries(materialIds.map(materialId => [
    materialId,
    state.materials.find(material => material.materialId === materialId)?.quantity ?? 0,
  ]));
}

function firstVerb(action: string): string {
  return action.trim().split(/[\s,]+/)[0]?.toLowerCase() || 'executar';
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function actionTypeFor(verb: string): PhysicalActionType {
  const normalized = normalize(verb);
  if (['inspecionar', 'registrar', 'medir', 'inspect', 'measure'].includes(normalized)) return 'INSPECT';
  if (['posicionar', 'alinhar', 'elevar', 'delimitar', 'position', 'align', 'raise'].includes(normalized)) return 'POSITION';
  if (['cortar', 'cut'].includes(normalized)) return 'CUT';
  if (['fixar', 'amarrar', 'travar', 'fasten', 'fix', 'tie', 'lock'].includes(normalized)) return 'FASTEN';
  if (['montar', 'assentar', 'assemble', 'mount'].includes(normalized)) return 'ASSEMBLE';
  if (['instalar', 'encaixar', 'install', 'fit'].includes(normalized)) return 'INSTALL';
  if (['remover', 'remove'].includes(normalized)) return 'REMOVE';
  if (['aplicar', 'preencher', 'compactar', 'apply', 'fill', 'compact'].includes(normalized)) return 'APPLY';
  if (['escavar', 'excavate', 'dig'].includes(normalized)) return 'EXCAVATE';
  return 'OTHER';
}

export function compilePhysicalActionIR({
  scene,
  stage,
  operation,
  worldStateBefore,
  candidateState,
}: CompilePhysicalActionIRInput): PhysicalActionIR {
  const actorId = worldStateBefore.character.characterId;
  const targetId = operation.componentId ?? operation.elements?.[0] ?? operation.id;
  const targetLabel = operation.name || targetId;
  const targetElements = uniqueSorted(
    stage.allowedChanges.length > 0 ? stage.allowedChanges : operation.elements ?? [],
  );
  const verb = firstVerb(stage.physicalAction);
  const tools = uniqueSorted([stage.tool]);
  const changedMaterialIds = uniqueSorted([
    ...worldStateBefore.materials
      .filter(material => {
        const afterQuantity = candidateState.materials.find(
          candidate => candidate.materialId === material.materialId,
        )?.quantity;
        return afterQuantity !== undefined && afterQuantity !== material.quantity;
      })
      .map(material => material.materialId),
    ...candidateState.materials
      .filter(material => !worldStateBefore.materials.some(
        beforeMaterial => beforeMaterial.materialId === material.materialId,
      ))
      .map(material => material.materialId),
  ]);
  const materials = uniqueSorted([
    ...(operation.visualBasis?.materials ?? []),
    ...changedMaterialIds,
  ]);
  const before: PhysicalActionState = {
    targetStatus: targetStatus(worldStateBefore, targetId),
    constructionProgress: worldStateBefore.construction.progress,
    actorZone: worldStateBefore.character.currentZone,
    materialQuantities: materialQuantities(worldStateBefore, materials),
  };
  const after: PhysicalActionState = {
    targetStatus: targetStatus(candidateState, targetId),
    constructionProgress: candidateState.construction.progress,
    actorZone: candidateState.character.currentZone,
    materialQuantities: materialQuantities(candidateState, materials),
  };
  const materialQuantityChanges = materials
    .filter(materialId => before.materialQuantities[materialId] !== after.materialQuantities[materialId])
    .map(materialId => ({
      materialId,
      before: before.materialQuantities[materialId],
      after: after.materialQuantities[materialId],
    }));
  const evidence = before.targetStatus !== after.targetStatus ||
    before.constructionProgress !== after.constructionProgress
    ? `${targetLabel} is visibly ${after.targetStatus.toLowerCase()} in zone ${stage.activeZone}, with construction progress changing from ${before.constructionProgress}% to ${after.constructionProgress}%`
    : `${actorId} visibly performs ${verb} on ${targetLabel} in zone ${stage.activeZone}, leaving the target ${after.targetStatus.toLowerCase()}`;

  return {
    id: `physical-action:${scene.id}:${operation.id}:${stage.percentage}`,
    sceneId: scene.id,
    stageId: String(stage.percentage),
    operationId: operation.id,
    primaryAction: {
      type: actionTypeFor(verb),
      verb,
      description: `${verb} ${targetLabel}`,
    },
    actor: { characterId: actorId },
    target: {
      id: targetId,
      label: targetLabel,
      elements: targetElements,
    },
    zone: stage.activeZone,
    tools,
    materials,
    preconditions: [
      `actor ${actorId} is in zone ${before.actorZone}`,
      `target ${targetId} is ${before.targetStatus.toLowerCase()}`,
      `work is limited to zone ${stage.activeZone}`,
    ],
    expectedEffects: {
      constructionProgress: {
        before: before.constructionProgress,
        after: after.constructionProgress,
      },
      targetStatus: { before: before.targetStatus, after: after.targetStatus },
      actorZone: { before: before.actorZone, after: after.actorZone },
      materialQuantityChanges,
      newlyCompletedComponents: uniqueSorted(candidateState.existingComponents.filter(
        component => !worldStateBefore.existingComponents.includes(component),
      )),
      newlyPartialComponents: uniqueSorted(candidateState.partialComponents.filter(
        component => !worldStateBefore.partialComponents.includes(component),
      )),
    },
    before,
    after,
    constraints: {
      preserveActorId: actorId,
      allowedZone: stage.activeZone,
      preserveComponents: uniqueSorted(worldStateBefore.existingComponents),
      preserveZones: uniqueSorted(stage.preservedZones),
      forbiddenFutureComponents: uniqueSorted(candidateState.futureComponents.filter(
        component => component !== targetId,
      )),
      preventPrematureElements: uniqueSorted(stage.futureElements),
    },
    evidence: [evidence],
  };
}
