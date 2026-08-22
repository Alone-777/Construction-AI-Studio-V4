import { ProjectDNA, ProjectConfig, Stage, ValidationError, ErrorCode, ErrorSeverity, Character, Camera } from '../types';

/**
 * Cria a configuração padrão de um projeto.
 */
export function createDefaultProjectConfig(): ProjectConfig {
  const defaultCamera: Camera = {
    id: 'A',
    relativePosition: { x: 0, y: 0 },
    orientation: 0,
    conceptualHeight: 'media',
    framing: 'medium',
    allowedMovement: 'FIXA',
    visibleZones: [],
    partiallyVisibleZones: [],
    hiddenZones: []
  };

  const defaultCharacter: Character = {
    id: 'char_1',
    name: 'Trabalhador Padrão',
    appearance: 'Normal',
    apparentAge: 35,
    hair: 'Curto',
    beard: 'Feita',
    clothes: 'Uniforme de obra',
    shoes: 'Botas de segurança',
    accessories: ['Capacete'],
    tools: []
  };

  return {
    name: 'Novo Projeto',
    environment: 'terreno_plano',
    construction: 'Cabana Básica',
    approximateForm: 'Retangular',
    materials: ['Madeira', 'Pregos'],
    workerCount: 1,
    character: defaultCharacter,
    tools: ['Martelo', 'Serra'],
    cameraA: { ...defaultCamera, id: 'A' },
    cameraB: { ...defaultCamera, id: 'B' },
    visualStyle: 'realista',
    totalDuration: 3600,
    sceneDuration: 15,
    detailLevel: 'medio',
    visualReferences: [],
    preserveTerrain: true
  };
}

/**
 * Cria o DNA do projeto a partir de uma configuração.
 */
export function createProjectDNA(config: ProjectConfig): ProjectDNA {
  return {
    id: `dna_${Date.now()}`,
    config,
    environment: config.environment,
    finalConstruction: config.construction,
    form: config.approximateForm,
    materials: [...config.materials],
    character: { ...config.character },
    clothes: config.character.clothes,
    cameras: { a: config.cameraA, b: config.cameraB },
    aesthetics: config.visualStyle,
    restrictions: [],
    permanentObjects: [],
    rules: [],
    references: [...config.visualReferences],
    forbiddenElements: []
  };
}

/**
 * Valida o DNA do projeto buscando por inconsistências.
 */
export function validateDNA(dna: ProjectDNA): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!dna.finalConstruction) {
    errors.push({
      code: ErrorCode.E_DP01,
      severity: ErrorSeverity.ERROR,
      message: 'DNA do projeto deve ter uma construção final definida.'
    });
  }

  if (dna.materials.length === 0) {
    errors.push({
      code: ErrorCode.E_MT01,
      severity: ErrorSeverity.WARNING,
      message: 'Nenhum material definido no DNA do projeto.'
    });
  }

  return errors;
}

/**
 * Herda características do DNA para um estado inicial/final de uma etapa.
 */
export function inheritDNA(dna: ProjectDNA, stage: Stage): Record<string, any> {
  const state = { ...stage.initialState };
  state.environment = dna.environment;
  state.aesthetics = dna.aesthetics;
  state.characterClothes = dna.clothes;
  return state;
}
