import { WorldState, ProjectDNA, SpatialMap, Transformation, ValidationError, ErrorCode, ErrorSeverity } from '../types';

/**
 * Cria o estado inicial do mundo baseado no DNA e mapa espacial.
 */
export function createInitialWorldState(dna: ProjectDNA, spatialMap: SpatialMap): WorldState {
  return {
    terrain: {
      type: dna.environment,
      slope: 'plano',
      vegetation: 'rasteira',
      soil: 'terra'
    },
    construction: {
      type: dna.finalConstruction,
      progress: 0,
      status: 'SETUP'
    },
    existingComponents: [],
    partialComponents: [],
    futureComponents: [],
    materials: [],
    consumedMaterials: [],
    residues: [],
    tools: [],
    character: {
      characterId: dna.character.id,
      currentZone: spatialMap.zones[0]?.id || 'Z1',
      orientation: 'frente',
      carriedObjects: [],
      movementRequired: false
    },
    activeZone: spatialMap.zones[0]?.id || 'Z1',
    climate: 'ensolarado',
    light: 'dia',
    vegetation: {},
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: [...dna.permanentObjects],
    timestamp: 0
  };
}

/**
 * Aplica uma transformação ao estado de forma imutável (cópia profunda).
 */
export function applyTransformation(state: WorldState, transformation: Transformation): WorldState {
  const newState: WorldState = JSON.parse(JSON.stringify(state));
  const after = JSON.parse(JSON.stringify(transformation.after)) as Partial<WorldState>;
  
  newState.timestamp = transformation.logicalTimestamp;
  newState.activeZone = transformation.zone;
  newState.character.currentZone = transformation.zone;
  
  if (after.terrain) newState.terrain = { ...newState.terrain, ...after.terrain };
  if (after.construction) newState.construction = { ...newState.construction, ...after.construction };
  if (after.character) newState.character = { ...newState.character, ...after.character };

  const replaceableKeys: (keyof WorldState)[] = [
    'existingComponents', 'partialComponents', 'futureComponents', 'materials',
    'consumedMaterials', 'residues', 'tools', 'climate', 'light', 'vegetation',
    'camera', 'temporaryObjects', 'permanentObjects',
  ];
  for (const key of replaceableKeys) {
    if (after[key] !== undefined) {
      (newState as unknown as Record<string, unknown>)[key] = after[key];
    }
  }

  if (transformation.action === 'CONSTRUIR' && after.construction?.progress === undefined) {
    newState.construction.progress = Math.min(100, newState.construction.progress + 10);
  }
  
  return newState;
}

/**
 * Tira um snapshot (cópia profunda) do estado atual.
 */
export function snapshotState(state: WorldState): WorldState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Compara dois estados e retorna as diferenças em arrays.
 */
export function diffStates(before: WorldState, after: WorldState): { appeared: string[], disappeared: string[], changed: string[], unchanged: string[] } {
  const appeared: string[] = [];
  const disappeared: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  const beforeComps = new Set(before.existingComponents);
  const afterComps = new Set(after.existingComponents);

  afterComps.forEach(c => {
    if (!beforeComps.has(c)) appeared.push(c);
    else unchanged.push(c);
  });

  beforeComps.forEach(c => {
    if (!afterComps.has(c)) disappeared.push(c);
  });

  if (before.construction.progress !== after.construction.progress) {
    changed.push('construction.progress');
  }

  return { appeared, disappeared, changed, unchanged };
}

/**
 * Valida a consistência do estado atual do mundo.
 */
export function validateWorldStateConsistency(state: WorldState): ValidationError[] {
  const errors: ValidationError[] = [];

  if (state.construction.progress < 0 || state.construction.progress > 100) {
    errors.push({
      code: ErrorCode.E_EX01,
      severity: ErrorSeverity.ERROR,
      message: 'Progresso da construção inválido.'
    });
  }

  if (!state.activeZone) {
    errors.push({
      code: ErrorCode.E_SP01,
      severity: ErrorSeverity.ERROR,
      message: 'Nenhuma zona ativa definida no estado do mundo.'
    });
  }

  return errors;
}
