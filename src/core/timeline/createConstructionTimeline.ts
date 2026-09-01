import { Scene, WorldState, Project } from '../types';
import { ConstructionTimeline, ConstructionTimelineFrame } from '../types/construction-timeline';
import { ConstructionStateSnapshot } from '../types/construction-state';
import { createSceneFrames } from './createTimelineFrame';

/**
 * Cria uma timeline completa de construção a partir das cenas do projeto
 */
export function createConstructionTimeline(
  projectId: string,
  scenes: Scene[],
  _legacyFinalWorldState?: WorldState
): ConstructionTimeline {
  const allFrames: ConstructionTimelineFrame[] = [];

  // Gerar frames para cada cena na ordem
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex];
    const previousFrame = allFrames[allFrames.length - 1];
    const sceneFrames = createSceneFrames(scene, previousFrame);

    if (previousFrame && sceneFrames.length > 0) {
      previousFrame.nextFrameId = sceneFrames[0].id;
    }
    allFrames.push(...sceneFrames);
  }

  // Se não há frames, criar um frame vazio inicial
  if (allFrames.length === 0) {
    const emptyFrame: ConstructionTimelineFrame = {
      id: `${projectId}_initial_frame_0`,
      sceneId: '',
      progress: 0,
      state: {
        sceneId: '',
        progress: 0,
        completedElements: [],
        activeElements: [],
        pendingElements: [],
        materialState: { available: [], consumed: [], remaining: [] },
        workerState: { position: '', action: '', tools: [] },
        environmentState: { terrain: '', weather: '', lighting: '' },
        createdAt: new Date(),
      },
      visualChanges: { added: [], removed: [], modified: [] },
      createdAt: new Date(),
    };
    allFrames.push(emptyFrame);
  }

  // Current frame é o último frame
  const currentFrameId = allFrames[allFrames.length - 1].id;

  return {
    id: `${projectId}_timeline`,
    projectId,
    frames: allFrames,
    currentFrameId,
    createdAt: new Date(),
  };
}

/**
 * Obtém o frame atual da timeline
 */
export function getCurrentFrame(timeline: ConstructionTimeline): ConstructionTimelineFrame | undefined {
  return timeline.frames.find(f => f.id === timeline.currentFrameId);
}

/**
 * Obtém o frame anterior ao atual
 */
export function getPreviousFrame(timeline: ConstructionTimeline): ConstructionTimelineFrame | undefined {
  const currentFrame = getCurrentFrame(timeline);
  if (!currentFrame?.previousFrameId) return undefined;
  return timeline.frames.find(f => f.id === currentFrame.previousFrameId);
}

/**
 * Obtém o próximo frame após o atual
 */
export function getNextFrame(timeline: ConstructionTimeline): ConstructionTimelineFrame | undefined {
  const currentFrame = getCurrentFrame(timeline);
  if (!currentFrame?.nextFrameId) return undefined;
  return timeline.frames.find(f => f.id === currentFrame.nextFrameId);
}

/**
 * Avança para o próximo frame
 */
export function advanceTimeline(timeline: ConstructionTimeline): ConstructionTimeline {
  const nextFrame = getNextFrame(timeline);
  if (!nextFrame) return timeline;

  return {
    ...timeline,
    currentFrameId: nextFrame.id,
  };
}

/**
 * Retrocede para o frame anterior
 */
export function rewindTimeline(timeline: ConstructionTimeline): ConstructionTimeline {
  const previousFrame = getPreviousFrame(timeline);
  if (!previousFrame) return timeline;

  return {
    ...timeline,
    currentFrameId: previousFrame.id,
  };
}

/**
 * Adiciona um novo frame de simulação à timeline
 */
export function addSimulationFrame(
  timeline: ConstructionTimeline,
  state: ConstructionStateSnapshot,
  operationId: string,
  visualChanges: { added: string[]; removed: string[]; modified: string[] }
): ConstructionTimeline {
  const currentFrame = getCurrentFrame(timeline);
  const frameIndex = timeline.frames.length;

  const newFrame: ConstructionTimelineFrame = {
    id: `${timeline.projectId}_sim_${operationId}_${frameIndex}`,
    sceneId: operationId,
    progress: state.progress,
    state,
    visualChanges,
    previousFrameId: currentFrame?.id,
    createdAt: new Date(),
  };

  if (currentFrame) {
    currentFrame.nextFrameId = newFrame.id;
  }

  const updatedFrames = [...timeline.frames, newFrame];

  return {
    ...timeline,
    frames: updatedFrames,
    currentFrameId: newFrame.id,
  };
}
