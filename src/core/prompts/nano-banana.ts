import { Scene, Stage, WorldState, ProjectDNA, SpatialMap, NanoBananaPrompt } from '../types';

/**
 * Gera prompt NanoBanana deterministicamente a partir dos dados do sistema.
 * Regra: MODIFICAR somente o necessário; PRESERVAR todo o restante.
 */
export function generateNanoBananaPrompt(
  scene: Scene,
  stage: Stage,
  worldState: WorldState,
  dna: ProjectDNA,
  spatialMap: SpatialMap,
  previousScene?: Scene
): NanoBananaPrompt {
  const previousReference = previousScene
    ? `CONTINUITY REFERENCE: use Scene ${previousScene.number} as the immutable visual baseline`
    : undefined;

  const zone = spatialMap.zones.find(candidate => candidate.id === stage.activeZone);
  const camera = dna.cameras[stage.cameraId.toLowerCase() as 'a' | 'b'];
  const afterState = stage.worldStateAfter;
  const dnaDesc = `LOCKED DNA: ${dna.aesthetics} ${dna.finalConstruction}, ${dna.form}, materials ${dna.materials.join(', ')}`;
  const envDesc = `LOCKED WORLD: ${dna.environment}; terrain ${worldState.terrain.type}, ${worldState.terrain.slope}; ${worldState.climate}; ${worldState.light}`;
  const charDesc = `LOCKED CHARACTER: ${dna.character.name}; ${dna.character.appearance}; ${dna.character.clothes}; ${dna.character.shoes}; keep identity, body, clothing and accessories unchanged`;
  const cameraDesc = `LOCKED CAMERA ${stage.cameraId}: ${camera?.framing ?? 'wide'} framing, ${camera?.conceptualHeight ?? 'media'} height, orientation ${camera?.orientation ?? 0} degrees`;
  const zoneDesc = `EDIT ONLY ZONE ${stage.activeZone}${zone ? ` (${zone.name}, ${zone.type})` : ''}`;
  const stateDesc = `START STATE: construction ${worldState.construction.progress}%; existing ${worldState.existingComponents.join(', ') || 'none'}; partial ${worldState.partialComponents.join(', ') || 'none'}`;
  const physicalDesc = stage.physicalState
    ? `ABSOLUTE PHYSICAL STATE OF THIS OPERATION: ${Object.entries(stage.physicalState.elementProgress).map(([element, progress]) => `${element}=${progress}%`).join(', ')}`
    : undefined;
  const inventoryDesc = `CONSERVATION LEDGER: available materials ${worldState.materials.map(material => `${material.materialId}:${material.quantity}@${material.location}`).join(', ') || 'none'}; residues ${worldState.residues.map(residue => `${residue.materialId}:${residue.quantity}@${residue.location}`).join(', ') || 'none'}; every tool and material keeps a traceable origin`;
  const actionDesc = `VISIBLE PHYSICAL ACTION: ${stage.physicalAction}${stage.tool ? ` using ${stage.tool}` : ''}`;
  const changeDesc = stage.allowedChanges.length > 0
    ? stage.allowedChanges.join('; ')
    : 'record the unchanged baseline; introduce no construction change';
  const preservedDesc = stage.preservedZones.length > 0
    ? `PRESERVE PIXEL-CONSISTENT: zones ${stage.preservedZones.join(', ')}, terrain, creek, vegetation outside the active zone, completed components and all permanent objects`
    : 'PRESERVE: every region outside the explicitly allowed change';
  const prohibitedDesc = dna.forbiddenElements.length > 0
    ? `PROHIBITED: ${dna.forbiddenElements.join(', ')}`
    : '';
  const futureDesc = stage.futureElements.length > 0
    ? `MUST NOT EXIST YET: ${stage.futureElements.join(', ')}`
    : '';
  const resultDesc = `END STATE: construction ${afterState?.construction.progress ?? stage.percentage}%; ${stage.visualEvidence.join('; ') || changeDesc}; show direct visual evidence of the action`;
  const editDirective = `Using the provided image, change only ${changeDesc} inside ${stage.activeZone}; keep every other element exactly the same`;

  const parts = [
    previousReference,
    editDirective,
    dnaDesc,
    envDesc,
    charDesc,
    cameraDesc,
    zoneDesc,
    stateDesc,
    physicalDesc,
    inventoryDesc,
    actionDesc,
    `ALLOWED CHANGE ONLY: ${changeDesc}`,
    preservedDesc,
    prohibitedDesc,
    futureDesc,
    resultDesc,
  ].filter(Boolean);

  return {
    previousReference,
    dna: dnaDesc,
    environment: envDesc,
    character: charDesc,
    camera: cameraDesc,
    activeZone: stage.activeZone,
    currentState: stateDesc,
    action: actionDesc,
    allowedChange: changeDesc,
    preservedRegions: stage.preservedZones,
    prohibitedRegions: dna.forbiddenElements,
    futureElements: stage.futureElements,
    result: resultDesc,
    fullText: `${parts.join('. ')}. Do not redesign, beautify, relocate, add or remove anything else.`,
  };
}
