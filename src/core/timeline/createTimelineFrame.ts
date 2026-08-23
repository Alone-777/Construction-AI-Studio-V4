import { Scene, Stage, WorldState } from '../types';
import { ConstructionStateSnapshot } from '../types/construction-state';
import { ConstructionTimelineFrame } from '../types/construction-timeline';
import { createConstructionSnapshot } from '../state/createConstructionSnapshot';

/**
 * Cria um frame da timeline comparando com o frame anterior
 */
export function createTimelineFrame(
  scene: Scene,
  constructionState: ConstructionStateSnapshot,
  previousFrame?: ConstructionTimelineFrame,
  frameIndex?: number
): ConstructionTimelineFrame {
  const frameId = `${scene.id}_frame_${frameIndex ?? 0}`;

  let added: string[] = [];
  let removed: string[] = [];
  let modified: string[] = [];

  if (previousFrame) {
    const prevState = previousFrame.state;
    const currState = constructionState;

    // Elementos adicionados (estão no atual mas não no anterior)
    added = [
      ...currState.completedElements.filter(e => !prevState.completedElements.includes(e)),
      ...currState.activeElements.filter(e => !prevState.activeElements.includes(e) && !prevState.completedElements.includes(e)),
      ...currState.pendingElements.filter(e => !prevState.pendingElements.includes(e)),
    ].filter((e, i, arr) => arr.indexOf(e) === i); // remover duplicatas

    // Elementos removidos (estavam no anterior mas não no atual)
    removed = [
      ...prevState.completedElements.filter(e => !currState.completedElements.includes(e) && !currState.activeElements.includes(e)),
      ...prevState.activeElements.filter(e => !currState.activeElements.includes(e) && !currState.completedElements.includes(e)),
      ...prevState.pendingElements.filter(e => !currState.pendingElements.includes(e)),
    ].filter((e, i, arr) => arr.indexOf(e) === i);

    // Elementos modificados (mudaram de estado)
    modified = [
      // De pendente para ativo
      ...currState.activeElements.filter(e => prevState.pendingElements.includes(e)),
      // De ativo para completo
      ...currState.completedElements.filter(e => prevState.activeElements.includes(e)),
      // De pendente para completo (pular ativo)
      ...currState.completedElements.filter(e => prevState.pendingElements.includes(e) && !prevState.activeElements.includes(e)),
    ].filter((e, i, arr) => arr.indexOf(e) === i);
  } else {
    // Primeiro frame - tudo é "adicionado"
    added = [
      ...constructionState.completedElements,
      ...constructionState.activeElements,
      ...constructionState.pendingElements,
    ].filter((e, i, arr) => arr.indexOf(e) === i);
  }

  return {
    id: frameId,
    sceneId: scene.id,
    progress: constructionState.progress,
    state: constructionState,
    visualChanges: {
      added,
      removed,
      modified,
    },
    previousFrameId: previousFrame?.id,
    createdAt: new Date(),
  };
}

/**
 * Cria frames para todos os stages de uma cena
 */
export function createSceneFrames(
  scene: Scene,
  worldState: WorldState
): ConstructionTimelineFrame[] {
  const frames: ConstructionTimelineFrame[] = [];

  for (let i = 0; i < scene.stages.length; i++) {
    const stage = scene.stages[i];
    const snapshot = createConstructionSnapshot(scene, stage, worldState, worldState.materials);
    const previousFrame = frames[frames.length - 1];
    const frame = createTimelineFrame(scene, snapshot, previousFrame, i);
    frames.push(frame);
  }

  // Ligar nextFrameId
  for (let i = 0; i < frames.length - 1; i++) {
    frames[i].nextFrameId = frames[i + 1].id;
  }

  return frames;
}