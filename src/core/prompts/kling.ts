import { Scene, Stage, WorldState, ProjectDNA, KlingPrompt } from '../types';
import {
  ANIMATION_PROMPT_MAX_CHARS,
  assertAnimationPromptWithinLimit,
  compactAnimationPromptField,
  compactAnimationPromptList,
} from '../video-generation/animation-prompt-budget';

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

  const compactText = [
    compactAnimationPromptField(start, 220),
    `Camera ${compactAnimationPromptField(stage.cameraId, 30)}: ` +
      `${compactAnimationPromptField(camera?.framing ?? 'wide', 40)} ` +
      `${compactAnimationPromptField(camera?.allowedMovement ?? 'FOLLOW', 40)}; preserve orientation`,
    displacement ? compactAnimationPromptField(displacement, 180) : undefined,
    `Action: ${compactAnimationPromptField(action, 220)}`,
    compactAnimationPromptField(transformation, 180),
    physicalState ? compactAnimationPromptField(physicalState, 160) : undefined,
    compactAnimationPromptField(conservation, 190),
    compactAnimationPromptField(final, 180),
    'Negative: no teleportation, no morphing, no disappearing tools/materials, no camera jump; ' +
      `project/future: ${compactAnimationPromptList(
        [...dna.forbiddenElements, ...stage.futureElements.map(element => `no premature ${element}`)],
        { maxItems: 6, itemChars: 38 },
      )}`,
  ].filter(Boolean).join('. ');

  const text = assertAnimationPromptWithinLimit(
    compactText,
    ANIMATION_PROMPT_MAX_CHARS,
  );

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
