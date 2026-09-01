import { Scene, Stage, WorldState } from '../types';
import { ConstructionStateSnapshot } from '../types/construction-state';

/** Creates a construction snapshot from one official temporal WorldState. */
export function createConstructionSnapshot(
  scene: Scene,
  _stage: Stage,
  worldState: WorldState,
  _legacyMaterials: WorldState['materials'] = []
): ConstructionStateSnapshot {
  const { completedElements, activeElements, pendingElements } = getOfficialElements(worldState);

  return {
    sceneId: scene.id,
    progress: worldState.construction?.progress || 0,
    completedElements,
    activeElements,
    pendingElements,
    materialState: getMaterialState(worldState),
    workerState: getWorkerState(worldState),
    environmentState: {
      terrain: worldState.terrain?.type || 'terreno_plano',
      weather: worldState.climate || 'clear',
      lighting: worldState.light || 'dia',
    },
    createdAt: new Date(),
  };
}

/** Creates the final project snapshot from the final official WorldState. */
export function createProjectConstructionSnapshot(
  scenes: Scene[],
  worldState: WorldState,
  _legacyMaterials: WorldState['materials'] = []
): ConstructionStateSnapshot {
  const { completedElements, activeElements, pendingElements } = getOfficialElements(worldState);

  return {
    sceneId: scenes.map(scene => scene.id).join(','),
    progress: worldState.construction?.progress || 0,
    completedElements,
    activeElements,
    pendingElements,
    materialState: getMaterialState(worldState),
    workerState: getWorkerState(worldState),
    environmentState: {
      terrain: worldState.terrain?.type || 'terreno_plano',
      weather: worldState.climate || 'clear',
      lighting: worldState.light || 'dia',
    },
    createdAt: new Date(),
  };
}

function getOfficialElements(worldState: WorldState): Pick<
  ConstructionStateSnapshot,
  'completedElements' | 'activeElements' | 'pendingElements'
> {
  const completedElements = unique(worldState.existingComponents);
  const activeElements = unique(worldState.partialComponents)
    .filter(element => !completedElements.includes(element));
  const pendingElements = unique(worldState.futureComponents)
    .filter(element => !completedElements.includes(element) && !activeElements.includes(element));

  return { completedElements, activeElements, pendingElements };
}

function getMaterialState(worldState: WorldState): ConstructionStateSnapshot['materialState'] {
  const materials = worldState.materials;
  const available = materials
    .filter(material => material.quantity > 0 && material.status !== 'incorporado' && material.status !== 'descartado')
    .map(material => `${material.materialId} (${material.quantity} ${material.status})`);

  const consumed = unique([
    ...materials
      .filter(material => material.status === 'incorporado' || material.status === 'descartado')
      .map(material => `${material.materialId} (${material.quantity})`),
    ...(worldState.consumedMaterials ?? [])
      .map(material => `${material.materialId} (${material.quantity})`),
  ]);

  const remaining = materials
    .filter(material => material.quantity > 0 && material.status === 'disponivel')
    .map(material => `${material.materialId} (${material.quantity})`);

  return { available, consumed, remaining };
}

function getWorkerState(worldState: WorldState): ConstructionStateSnapshot['workerState'] {
  return {
    position: worldState.character?.currentZone || '',
    action: worldState.character?.currentAction || '',
    tools: worldState.tools
      .filter(tool => tool.status === 'em_uso')
      .map(tool => tool.toolId),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
