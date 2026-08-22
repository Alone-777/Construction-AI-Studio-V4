import { Scene, Stage, WorldState, ProjectDNA, KlingPrompt } from '../types';

export function generateKlingPrompt(
  scene: Scene,
  stage: Stage,
  worldState: WorldState,
  dna: ProjectDNA
): KlingPrompt {
  const displacement = stage.displacement
    ? `The same worker walks continuously from ${stage.displacement.from} to ${stage.displacement.to} via ${(stage.workRoute ?? [stage.displacement.from, stage.displacement.to]).join(' -> ')}; no cut or teleport`
    : undefined;
  const camera = dna.cameras[stage.cameraId.toLowerCase() as 'a' | 'b'];
  const start = `Start from the exact prior state at ${worldState.construction.progress}%: worker ${dna.character.name} in ${stage.characterPosition}, ${dna.character.clothes}, existing components ${worldState.existingComponents.join(', ') || 'none'}`;
  const action = `${stage.physicalAction}${stage.tool ? ` with ${stage.tool}` : ''} in zone ${stage.activeZone}`;
  const transformation = stage.allowedChanges.length > 0
    ? `Only these physical changes evolve on screen: ${stage.allowedChanges.join(', ')}`
    : 'No construction element changes; establish the baseline';
  const physicalState = stage.physicalState
    ? `Absolute state for this same operation: ${Object.entries(stage.physicalState.elementProgress).map(([element, progress]) => `${element} ${progress}%`).join(', ')}`
    : undefined;
  const conservation = `Maintain ledger continuity for ${worldState.materials.map(material => `${material.materialId} ${material.quantity}`).join(', ') || 'no loose material'} and ${worldState.residues.length} residue records; tools move only with the worker`;
  const final = `End with ${stage.visualEvidence.join(', ')}; all completed work, creek, terrain, character identity and untouched zones remain continuous`;
  const prohibitions = [
    ...dna.forbiddenElements,
    ...stage.futureElements.map(element => `no premature ${element}`),
    'no teleportation',
    'no morphing',
    'no disappearing tools or materials',
    'no camera jump',
  ];

  const text = [
    start,
    `Camera ${stage.cameraId}: ${camera?.framing ?? 'wide'} ${camera?.allowedMovement ?? 'FOLLOW'}, keep spatial orientation stable`,
    displacement,
    `Action: ${action}`,
    transformation,
    physicalState,
    conservation,
    final,
    `Negative constraints: ${prohibitions.join(', ')}`,
  ].filter(Boolean).join('. ');

  return {
    start,
    displacement,
    action,
    transformation,
    final,
    prohibitions,
    fullText: text
  };
}
