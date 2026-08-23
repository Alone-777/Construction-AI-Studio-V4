import { Scene, Stage, WorldState } from '../types';
import { ConstructionStateSnapshot } from '../types/construction-state';

/**
 * Cria um snapshot temporal do estado da construção
 * Gera automaticamente:
 * - completedElements baseado nos elementos finalizados
 * - activeElements baseado no stage atual
 * - pendingElements baseado nas próximas operações
 */
export function createConstructionSnapshot(
  scene: Scene,
  stage: Stage,
  worldState: WorldState,
  materials: WorldState['materials'] = []
): ConstructionStateSnapshot {
  // completedElements: elementos finalizados do stage atual e anteriores
  const completedElements = stage.physicalState?.completedElements || [];

  // activeElements: elementos em execução no stage atual
  const activeElements = stage.physicalState?.partialElements || [];

  // pendingElements: futuros elementos do stage + próximas operações
  const pendingElements = stage.futureElements || [];

  // Material state
  const available = materials
    .filter(m => m.quantity > 0 && m.status !== 'incorporado' && m.status !== 'descartado')
    .map(m => `${m.materialId} (${m.quantity} ${m.status})`);

  const consumed = materials
    .filter(m => m.status === 'incorporado' || m.status === 'descartado')
    .map(m => `${m.materialId} (${m.quantity})`);

  const remaining = materials
    .filter(m => m.quantity > 0 && m.status === 'disponivel')
    .map(m => `${m.materialId} (${m.quantity})`);

  // Worker state
  const workerState = {
    position: stage.characterPosition,
    action: stage.physicalAction,
    tools: stage.tool ? [stage.tool] : [],
  };

  // Environment state
  const environmentState = {
    terrain: worldState.terrain?.type || 'terreno_plano',
    weather: worldState.climate || 'clear',
    lighting: worldState.light || 'dia',
  };

  return {
    sceneId: scene.id,
    progress: worldState.construction?.progress || 0,
    completedElements,
    activeElements,
    pendingElements,
    materialState: {
      available,
      consumed,
      remaining,
    },
    workerState,
    environmentState,
    createdAt: new Date(),
  };
}

/**
 * Cria snapshot para o projeto todo (agregado de todas as cenas)
 */
export function createProjectConstructionSnapshot(
  scenes: Scene[],
  worldState: WorldState,
  materials: WorldState['materials'] = []
): ConstructionStateSnapshot {
  const allCompleted: string[] = [];
  const allActive: string[] = [];
  const allPending: string[] = [];

  for (const scene of scenes) {
    for (const stage of scene.stages) {
      if (stage.physicalState?.completedElements) {
        allCompleted.push(...stage.physicalState.completedElements);
      }
      if (stage.physicalState?.partialElements) {
        allActive.push(...stage.physicalState.partialElements);
      }
      if (stage.futureElements) {
        allPending.push(...stage.futureElements);
      }
    }
  }

  // Remove duplicatas
  const completedElements = [...new Set(allCompleted)];
  const activeElements = [...new Set(allActive)];
  const pendingElements = [...new Set(allPending)];

  const available = materials
    .filter(m => m.quantity > 0 && m.status !== 'incorporado' && m.status !== 'descartado')
    .map(m => `${m.materialId} (${m.quantity} ${m.status})`);

  const consumed = materials
    .filter(m => m.status === 'incorporado' || m.status === 'descartado')
    .map(m => `${m.materialId} (${m.quantity})`);

  const remaining = materials
    .filter(m => m.quantity > 0 && m.status === 'disponivel')
    .map(m => `${m.materialId} (${m.quantity})`);

  const lastStage = scenes.flatMap(s => s.stages).pop();

  return {
    sceneId: scenes.map(s => s.id).join(','),
    progress: worldState.construction?.progress || 0,
    completedElements,
    activeElements,
    pendingElements,
    materialState: {
      available,
      consumed,
      remaining,
    },
    workerState: lastStage ? {
      position: lastStage.characterPosition,
      action: lastStage.physicalAction,
      tools: lastStage.tool ? [lastStage.tool] : [],
    } : {
      position: '',
      action: '',
      tools: [],
    },
    environmentState: {
      terrain: worldState.terrain?.type || 'terreno_plano',
      weather: worldState.climate || 'clear',
      lighting: worldState.light || 'dia',
    },
    createdAt: new Date(),
  };
}