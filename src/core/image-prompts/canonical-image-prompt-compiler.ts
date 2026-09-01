import type { CanonicalImagePromptSpec } from './canonical-image-prompt-spec';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function cloneSnapshotSpace(snapshot: VisualStateSnapshot): VisualStateSnapshot['space'] {
  return {
    activeZone: snapshot.space.activeZone,
    stateZone: snapshot.space.stateZone,
    relevantZones: snapshot.space.relevantZones.map(zone => ({
      ...zone,
      bounds: { ...zone.bounds },
    })),
  };
}

function cloneSnapshotCamera(snapshot: VisualStateSnapshot): VisualStateSnapshot['camera'] {
  return {
    ...snapshot.camera,
    relativePosition: { ...snapshot.camera.relativePosition },
    visibleZones: [...snapshot.camera.visibleZones],
    partiallyVisibleZones: [...snapshot.camera.partiallyVisibleZones],
    hiddenZones: [...snapshot.camera.hiddenZones],
    viewpoint: {
      ...snapshot.camera.viewpoint,
      position: { ...snapshot.camera.viewpoint.position },
      target: { ...snapshot.camera.viewpoint.target },
    },
    lens: { ...snapshot.camera.lens },
  };
}

function cloneSnapshotEnvironment(
  snapshot: VisualStateSnapshot,
): VisualStateSnapshot['environment'] {
  return {
    ...snapshot.environment,
    terrain: { ...snapshot.environment.terrain },
    permanentObjects: [...snapshot.environment.permanentObjects],
    zoneVegetation: snapshot.environment.zoneVegetation.map(entry => ({ ...entry })),
  };
}

function cloneSnapshotMaterials(snapshot: VisualStateSnapshot): VisualStateSnapshot['materials'] {
  return {
    visible: snapshot.materials.visible.map(material => ({ ...material })),
    active: uniqueSorted(snapshot.materials.active),
    incorporated: snapshot.materials.incorporated.map(material => ({ ...material })),
  };
}

function assertNoTemporalConflict(snapshot: VisualStateSnapshot): void {
  const forbidden = new Set([
    ...snapshot.continuity.futureForbidden,
    ...snapshot.continuity.forbiddenVisualElements,
  ]);
  const conflicts = snapshot.construction.visibleComponents.filter(component => forbidden.has(component));
  if (conflicts.length > 0) {
    throw new Error(
      `Visual state contains components that are both present and forbidden: ${uniqueSorted(conflicts).join(', ')}`,
    );
  }
}

function actionMustShow(snapshot: VisualStateSnapshot): string[] {
  if (snapshot.action.visibility === 'ATTEMPTED') {
    return [`single primary action in progress: ${snapshot.action.primary.description}`];
  }
  if (snapshot.action.visibility === 'COMMITTED') {
    return [`completed result of the single primary action: ${snapshot.action.primary.description}`];
  }
  return [
    `target ${snapshot.action.target.id} remains ${snapshot.construction.targetState.toLowerCase()}`,
  ];
}

export function compileCanonicalImagePromptSpec(
  snapshot?: VisualStateSnapshot,
): CanonicalImagePromptSpec | undefined {
  if (!snapshot) return undefined;

  assertNoTemporalConflict(snapshot);

  const presentComponents = uniqueSorted(snapshot.construction.visibleComponents);
  const futureComponents = uniqueSorted([
    ...snapshot.construction.pendingComponents,
    ...snapshot.continuity.futureForbidden,
  ]);
  const visualElements = uniqueSorted(snapshot.continuity.forbiddenVisualElements);
  const completionEvidence = uniqueSorted([
    ...snapshot.evidence.actionEvidence,
    `target ${snapshot.evidence.target.id} is ${snapshot.evidence.target.status.toLowerCase()}`,
    ...snapshot.evidence.completedComponents.map(component => `component ${component} is complete`),
    ...snapshot.evidence.partialComponents.map(component => `component ${component} is partial`),
  ]);

  return {
    id: `canonical-image-prompt:${snapshot.id}`,
    identity: {
      snapshotId: snapshot.id,
      projectId: snapshot.identity.projectId,
      sceneId: snapshot.identity.sceneId,
      stageId: snapshot.identity.stageId,
      operationId: snapshot.identity.operationId,
      temporalPoint: snapshot.temporalPoint,
      snapshotKind: snapshot.kind,
      stageOutcome: snapshot.stageOutcome,
      worldStateSource: snapshot.worldStateSource,
      progress: snapshot.identity.progress,
    },
    subject: { ...snapshot.actor },
    primaryAction: {
      physicalActionIRId: snapshot.action.physicalActionIRId,
      visibility: snapshot.action.visibility,
      type: snapshot.action.primary.type,
      verb: snapshot.action.primary.verb,
      description: snapshot.action.primary.description,
      target: {
        ...snapshot.action.target,
        elements: [...snapshot.action.target.elements],
      },
      tools: uniqueSorted(snapshot.action.tools),
      materials: uniqueSorted(snapshot.action.materials),
      expectedTargetStatus: snapshot.action.expectedTargetStatus,
    },
    currentConstruction: {
      type: snapshot.construction.type,
      status: snapshot.construction.status,
      progress: snapshot.construction.progress,
      presentComponents,
      completedComponents: uniqueSorted(snapshot.construction.completedComponents),
      partialComponents: uniqueSorted(snapshot.construction.partialComponents),
      activeTarget: snapshot.construction.activeComponent ?? snapshot.action.target.id,
      targetState: snapshot.construction.targetState,
      pendingComponents: futureComponents,
    },
    spatialContext: cloneSnapshotSpace(snapshot),
    materials: cloneSnapshotMaterials(snapshot),
    camera: cloneSnapshotCamera(snapshot),
    environment: cloneSnapshotEnvironment(snapshot),
    mustShow: {
      subject: uniqueSorted([
        `${snapshot.actor.name} (${snapshot.actor.characterId})`,
        snapshot.actor.appearance,
        snapshot.actor.clothing,
        `actor in zone ${snapshot.actor.zone}, oriented ${snapshot.actor.orientation}`,
      ]),
      action: actionMustShow(snapshot),
      construction: uniqueSorted([
        ...presentComponents.map(component => `present component: ${component}`),
        `target ${snapshot.action.target.id}: ${snapshot.construction.targetState.toLowerCase()}`,
      ]),
      toolsAndMaterials: uniqueSorted([
        ...snapshot.action.tools.map(tool => `tool required by the action: ${tool}`),
        ...snapshot.action.materials.map(material => `material required by the action: ${material}`),
      ]),
      evidence: completionEvidence,
    },
    mustPreserve: uniqueSorted([
      `exact actor identity: ${snapshot.continuity.preserveActorIdentity}`,
      `clothing: ${snapshot.continuity.preserveClothing}`,
      `camera anchor: ${snapshot.continuity.preserveCameraId}`,
      ...snapshot.continuity.preserveComponents.map(component => `existing component geometry: ${component}`),
      ...snapshot.continuity.preserveZones.map(zone => `zone layout: ${zone}`),
      ...snapshot.continuity.preserveMaterialPlacements.map(material => `material placement: ${material}`),
      ...snapshot.continuity.requiredVisualElements.map(element => `required visual element: ${element}`),
      snapshot.continuity.terrainOutsideActiveZoneUnchanged
        ? `terrain outside active zone ${snapshot.space.activeZone}`
        : undefined,
    ]),
    mustNotShow: {
      futureComponents,
      visualElements,
      prohibitedChanges: uniqueSorted([
        `no changes outside active zone ${snapshot.space.activeZone}`,
        'no changes to preserved actor identity',
        'no changes to existing structural geometry',
      ]),
    },
    completionEvidence,
    realismRequirements: [
      'coherent physical geometry and contact between objects',
      'correct human anatomy and plausible working posture',
      'physically plausible construction materials and tool use',
      'no duplicated, floating, intersecting, or unexplained objects',
      'no visual artifacts',
    ],
  };
}
