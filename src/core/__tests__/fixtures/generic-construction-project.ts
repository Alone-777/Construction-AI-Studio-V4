import { createProjectFromDescription } from '../../blueprints/description-blueprint';
import type { Project } from '../../types';

/**
 * Generic deterministic project fixture for core/pipeline tests.
 * It intentionally carries no real project identity and no cabana-specific state.
 */
export function createGenericConstructionProject(): Project {
  return createProjectFromDescription({
    description: 'Abrigo simples de madeira em uma clareira de floresta tropical, com base de pedra, estrutura de madeira e cobertura leve. Preservar o terreno e a vegetação fora da implantação.',
    name: 'Projeto Genérico de Teste',
    environment: 'clareira',
    construction: 'abrigo',
    materials: ['madeira', 'pedra', 'palha'],
    workerCount: 1,
    sceneDuration: 15,
    detailLevel: 'alto',
    visualStyle: 'cinematografico',
  });
}
