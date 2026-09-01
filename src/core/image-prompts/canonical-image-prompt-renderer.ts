import type { CanonicalImagePromptSpec } from './canonical-image-prompt-spec';

function list(values: string[]): string {
  return values.length > 0 ? values.map(value => `- ${value}`).join('\n') : '- none specified';
}

function section(title: string, lines: string[]): string {
  return `[${title}]\n${list(lines)}`;
}

export function renderCanonicalImagePrompt(spec: CanonicalImagePromptSpec): string {
  const temporalAuthority = [
    `project: ${spec.identity.projectId}`,
    `scene: ${spec.identity.sceneId}`,
    `stage: ${spec.identity.stageId}`,
    `operation: ${spec.identity.operationId}`,
    `temporal point: ${spec.identity.temporalPoint}`,
    `snapshot authority: ${spec.identity.snapshotKind}`,
    `stage outcome: ${spec.identity.stageOutcome}`,
    `world state source: ${spec.identity.worldStateSource}`,
    `construction progress: ${spec.identity.progress}%`,
  ];
  const currentScene = [
    `subject: ${spec.subject.name} (${spec.subject.characterId})`,
    `appearance: ${spec.subject.appearance}`,
    `clothing: ${spec.subject.clothing}`,
    `location: ${spec.subject.zone}`,
    `orientation: ${spec.subject.orientation}`,
    ...(spec.subject.toolInUse ? [`tool in use: ${spec.subject.toolInUse}`] : []),
    `active zone: ${spec.spatialContext.activeZone}`,
    ...spec.spatialContext.relevantZones.map(zone =>
      `spatial zone ${zone.id}: ${zone.name}, ${zone.type}${zone.orientation ? `, ${zone.orientation}` : ''}`
    ),
  ];
  const primaryAction = [
    `exactly one primary action: ${spec.primaryAction.type} / ${spec.primaryAction.verb}`,
    `action state: ${spec.primaryAction.visibility}`,
    `description: ${spec.primaryAction.description}`,
    `target: ${spec.primaryAction.target.label} (${spec.primaryAction.target.id})`,
    `target state: ${spec.currentConstruction.targetState}`,
    `expected target state: ${spec.primaryAction.expectedTargetStatus}`,
    ...spec.primaryAction.tools.map(tool => `tool: ${tool}`),
    ...spec.primaryAction.materials.map(material => `material: ${material}`),
  ];
  const visibleConstruction = [
    `construction: ${spec.currentConstruction.type}`,
    `status: ${spec.currentConstruction.status}`,
    `progress: ${spec.currentConstruction.progress}%`,
    ...spec.currentConstruction.presentComponents.map(component => `present: ${component}`),
    ...spec.currentConstruction.completedComponents.map(component => `complete: ${component}`),
    ...spec.currentConstruction.partialComponents.map(component => `partial: ${component}`),
    ...(spec.currentConstruction.activeTarget ? [`active target: ${spec.currentConstruction.activeTarget}`] : []),
  ];
  const visibleMaterials = [
    ...spec.materials.visible.map(material =>
      `visible: ${material.materialId}, quantity ${material.quantity}, ${material.status}, at ${material.location}`
    ),
    ...spec.materials.active.map(material => `active in primary action: ${material}`),
    ...spec.materials.incorporated.map(material =>
      `incorporated: ${material.materialId}, quantity ${material.quantity}${material.location ? `, at ${material.location}` : ''}`
    ),
  ];
  const camera = [
    `camera: ${spec.camera.id}`,
    `framing: ${spec.camera.framing}`,
    `orientation: ${spec.camera.orientation}`,
    `conceptual height: ${spec.camera.conceptualHeight}`,
    `allowed movement: ${spec.camera.allowedMovement}`,
    `visible zones: ${spec.camera.visibleZones.join(', ') || 'none specified'}`,
    `partially visible zones: ${spec.camera.partiallyVisibleZones.join(', ') || 'none specified'}`,
    `hidden zones: ${spec.camera.hiddenZones.join(', ') || 'none specified'}`,
    `viewpoint position: ${spec.camera.viewpoint.position.x}, ${spec.camera.viewpoint.position.y}`,
    `viewpoint target: ${spec.camera.viewpoint.target.x}, ${spec.camera.viewpoint.target.y}`,
    `field of view: ${spec.camera.viewpoint.fov}`,
    `aspect ratio: ${spec.camera.viewpoint.aspectRatio}`,
    `viewpoint movement: ${spec.camera.viewpoint.movement}`,
    `lens: ${spec.camera.lens.focalLength}mm, ${spec.camera.lens.aperture}, focus ${spec.camera.lens.focusDistance}, depth of field ${spec.camera.lens.depthOfField}`,
  ];
  const environment = [
    `preset: ${spec.environment.preset}`,
    `terrain: ${Object.entries(spec.environment.terrain)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ')}`,
    `climate: ${spec.environment.climate}`,
    `light: ${spec.environment.light}`,
    `time of day: ${spec.environment.timeOfDay}`,
    `weather: ${spec.environment.weather}`,
    ...spec.environment.permanentObjects.map(object => `permanent object: ${object}`),
    ...spec.environment.zoneVegetation.map(entry => `vegetation ${entry.zoneId}: ${entry.state}`),
  ];
  const mustNotShow = [
    ...spec.mustNotShow.futureComponents.map(component => `future component: ${component}`),
    ...spec.mustNotShow.visualElements.map(element => `forbidden visual element: ${element}`),
    ...spec.mustNotShow.prohibitedChanges,
  ];

  return [
    section('TEMPORAL AUTHORITY', temporalAuthority),
    section('CURRENT SCENE', currentScene),
    section('PRIMARY ACTION', primaryAction),
    section('VISIBLE CONSTRUCTION', visibleConstruction),
    section('VISIBLE MATERIALS', visibleMaterials),
    section('CAMERA', camera),
    section('ENVIRONMENT', environment),
    section('MUST PRESERVE', spec.mustPreserve),
    section('MUST SHOW', [
      ...spec.mustShow.subject,
      ...spec.mustShow.action,
      ...spec.mustShow.construction,
      ...spec.mustShow.toolsAndMaterials,
      ...spec.mustShow.evidence,
    ]),
    section('MUST NOT SHOW', mustNotShow),
    section('COMPLETION EVIDENCE', spec.completionEvidence),
    section('REALISM REQUIREMENTS', spec.realismRequirements),
  ].join('\n\n');
}
