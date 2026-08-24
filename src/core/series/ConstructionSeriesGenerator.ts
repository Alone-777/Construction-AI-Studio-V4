import { Project } from '../types/project';
import { ConstructionTimeline, ConstructionTimelineFrame } from '../types/construction-timeline';
import { ConstructionStateSnapshot } from '../types/construction-state';
import { ConstructionDecision } from '../decision';
import { VisualDNA } from '../types/project';
import { VisualPromptResult, compileVisualScene } from '../visual/VisualPromptCompiler';
import { worldStateToVisualSceneState } from '../visual/VisualSceneState';
import { ConstructionSimulationEngine, createSimulationEngine } from '../simulation/ConstructionSimulationEngine';
import { SimulationResult, SimulationEvent } from '../types/construction-simulation';
import { ConstructionDecisionEngine, createDecisionEngine } from '../decision/ConstructionDecisionEngine';
import { DecisionContext } from '../decision/ConstructionDecision';
import {
  ConstructionEpisode,
  ConstructionSeries,
  EpisodeObjective,
  EpisodeAction,
  EpisodeEnvironment,
  EpisodeMetadata,
  SeriesGenerationConfig,
} from '../types/construction-series';

/**
 * Mapeia tipo de elemento para tipo de objetivo
 */
function mapElementToObjectiveType(element: string): EpisodeObjective['type'] {
  const foundationTypes = ['foundation', 'base', 'footings', 'slab'];
  const structureTypes = ['walls', 'columns', 'beams', 'structure', 'framing'];
  const enclosureTypes = ['roof', 'windows', 'doors', 'enclosure', 'cladding'];
  const finishingTypes = ['paint', 'flooring', 'finishing', 'trim', 'fixtures'];

  const lower = element.toLowerCase();
  if (foundationTypes.some(t => lower.includes(t))) return 'foundation';
  if (structureTypes.some(t => lower.includes(t))) return 'structure';
  if (enclosureTypes.some(t => lower.includes(t))) return 'enclosure';
  if (finishingTypes.some(t => lower.includes(t))) return 'finishing';
  return 'structure';
}

/**
 * Gera objetivo baseado no estado da construção
 */
function generateObjective(frame: ConstructionTimelineFrame, prevFrame?: ConstructionTimelineFrame): EpisodeObjective {
  const completed = frame.state.completedElements.filter(
    el => !prevFrame?.state.completedElements.includes(el)
  );
  const active = frame.state.activeElements.filter(
    el => !prevFrame?.state.activeElements.includes(el)
  );

  // Prioritize active elements (what's being worked on now) over newly completed
  const newElements = [...active, ...completed];
  const elements = newElements.length > 0 ? newElements : frame.state.activeElements;

  const primaryElement = elements[0] || 'construction';
  const type = mapElementToObjectiveType(primaryElement);

  const descriptions: Record<EpisodeObjective['type'], string> = {
    foundation: 'Estabelecer fundação e base da construção',
    structure: 'Erguer estrutura principal',
    enclosure: 'Fechar a construção com cobertura e aberturas',
    finishing: 'Aplicar acabamentos finais',
    inspection: 'Inspecionar qualidade da construção',
    material_delivery: 'Receber e organizar materiais',
    tool_preparation: 'Preparar ferramentas e equipamentos',
  };

  return {
    type,
    description: descriptions[type] || `Trabalhar em ${primaryElement}`,
    elements,
    priority: type === 'foundation' ? 10 : type === 'structure' ? 8 : type === 'enclosure' ? 6 : 4,
  };
}

/**
 * Gera ação baseada no estado do worker e decisão
 */
function generateAction(
  frame: ConstructionTimelineFrame,
  decision?: ConstructionDecision,
  operationId?: string
): EpisodeAction {
  const workerAction = frame.state.workerState.action;
  const tools = frame.state.workerState.tools;
  const materials = frame.state.materialState.consumed.filter(
    m => !frame.state.materialState.available.includes(m)
  );

  let actionType: EpisodeAction['type'] = 'build';
  if (workerAction.includes('move') || workerAction.includes('walk')) actionType = 'move';
  else if (workerAction.includes('inspect')) actionType = 'inspect';
  else if (workerAction.includes('craft') || workerAction.includes('prepare')) actionType = 'craft';
  else if (decision?.action === 'REQUEST_MATERIAL') actionType = 'deliver';
  else if (decision?.action === 'WAIT') actionType = 'wait';

  const descriptions: Record<EpisodeAction['type'], string> = {
    build: `Construir ${frame.state.activeElements.join(', ') || 'estrutura'}`,
    move: `Mover para zona ${frame.state.workerState.position}`,
    inspect: `Inspecionar ${frame.state.activeElements.join(', ') || 'construção'}`,
    craft: 'Preparar materiais e ferramentas',
    deliver: 'Entregar materiais solicitados',
    prepare: 'Preparar área de trabalho',
    wait: 'Aguardar liberação',
  };

  return {
    type: actionType,
    description: descriptions[actionType] || 'Executar tarefa de construção',
    tools,
    materials,
    estimatedDuration: frame.state.workerState.action.includes('move') ? 5 : 15,
    zone: frame.state.workerState.position,
  };
}

/**
 * Gera ambiente a partir do estado da construção
 */
function generateEnvironment(frame: ConstructionTimelineFrame): EpisodeEnvironment {
  return {
    terrain: frame.state.environmentState.terrain,
    slope: 'none',
    vegetation: frame.state.environmentState.terrain === 'flat' ? 'grass' : 'trees',
    soil: 'dirt',
    climate: frame.state.environmentState.terrain,
    lighting: frame.state.environmentState.lighting,
    timeOfDay: frame.state.environmentState.lighting as EpisodeEnvironment['timeOfDay'],
    weather: frame.state.environmentState.weather as EpisodeEnvironment['weather'],
    activeZone: frame.state.workerState.position,
  };
}

/**
 * Gera prompt visual para o episódio
 */
function generateVisualPrompt(
  frame: ConstructionTimelineFrame,
  visualDNA: VisualDNA,
  project: Project,
  simulation?: {
    lastOperationId: string;
    lastResult: SimulationResult;
    lastEvents: SimulationEvent[];
    currentOperationId: string | null;
    pendingOperations: string[];
    completedOperations: string[];
    failedOperations: string[];
  },
  decision?: ConstructionDecision
): VisualPromptResult {
  // Converter frame para WorldState-like para o conversor
  const worldStateLike = {
    character: {
      characterId: 'builder_01',
      currentZone: frame.state.workerState.position,
      orientation: 'NORTH' as const,
      currentAction: frame.state.workerState.action,
      carriedObjects: [],
      movementRequired: frame.state.workerState.action.includes('move'),
    },
    activeZone: frame.state.workerState.position,
    climate: frame.state.environmentState.terrain,
    light: frame.state.environmentState.lighting,
    vegetation: {},
    camera: 'cameraA',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: frame.createdAt.getTime(),
    materials: frame.state.materialState.available.map(id => ({
      materialId: id,
      quantity: 10,
      status: 'disponivel' as const,
      location: 'site',
      origin: 'supplied',
    })),
    tools: frame.state.workerState.tools.map(id => ({
      toolId: id,
      status: 'em_uso' as const,
      location: 'site',
    })),
    residues: [],
    terrain: {
      type: frame.state.environmentState.terrain,
      slope: 'none',
      vegetation: 'grass',
      soil: 'dirt',
    },
    construction: {
      type: 'house',
      progress: frame.state.progress,
      status: frame.state.progress === 100 ? 'complete' : 'in_progress',
    },
    existingComponents: frame.state.completedElements,
    partialComponents: frame.state.activeElements,
    futureComponents: frame.state.pendingElements,
    consumedMaterials: frame.state.materialState.consumed.map(id => ({
      materialId: id,
      quantity: 1,
    })),
  };

  const visualSceneState = worldStateToVisualSceneState(worldStateLike);

  return compileVisualScene(
    visualSceneState,
    visualDNA,
    frame.state
  );
}

/**
 * Generator principal da série de construção
 */
export class ConstructionSeriesGenerator {
  private config: SeriesGenerationConfig;
  private decisionEngine: ConstructionDecisionEngine;
  private simulationEngine: ConstructionSimulationEngine;

  constructor(config: Partial<SeriesGenerationConfig> = {}) {
    this.config = {
      baseEpisodeDuration: 10,
      includeWaitEpisodes: true,
      includeMaterialRequestEpisodes: true,
      maxEpisodes: 50,
      ...config,
    };
    this.decisionEngine = createDecisionEngine();
    this.simulationEngine = createSimulationEngine();
  }

  /**
   * Gera série de construção a partir de um projeto
   */
  generate(project: Project): ConstructionSeries {
    if (!project.timeline || project.timeline.frames.length === 0) {
      throw new Error('Projeto deve ter timeline com frames para gerar série');
    }

    // Ordenar frames por progresso
    const sortedFrames = [...project.timeline.frames].sort((a, b) => a.progress - b.progress);

    const episodes: ConstructionEpisode[] = [];
    let sequence = 0;

    for (let i = 0; i < sortedFrames.length; i++) {
      if (this.config.maxEpisodes && sequence >= this.config.maxEpisodes) break;

      const frame = sortedFrames[i];
      const prevFrame = i > 0 ? sortedFrames[i - 1] : undefined;

      // Verificar se deve pular frame baseado na decisão
      const decision = this.getDecisionForFrame(frame, project);

      if (!this.shouldIncludeEpisode(decision)) {
        continue;
      }

      sequence++;
      const episode = this.createEpisode(frame, prevFrame, sequence, project, decision);
      episodes.push(episode);
    }

    const totalDuration = episodes.reduce((sum, ep) => sum + ep.estimatedDuration, 0);
    const totalProgress = episodes.length > 0
      ? episodes[episodes.length - 1].metadata.progress
      : 0;

    return {
      id: `series-${project.id}-${Date.now()}`,
      projectId: project.id,
      name: `${project.name} - Série de Construção`,
      episodes,
      totalEstimatedDuration: totalDuration,
      totalProgress,
      createdAt: Date.now(),
    };
  }

  /**
   * Obtém decisão para um frame específico
   */
  private getDecisionForFrame(frame: ConstructionTimelineFrame, project: Project): ConstructionDecision | undefined {
    // Se já há decisão no projeto, usar
    if (project.decision) return project.decision;

    // Tentar inferir do simulation
    if (project.simulation?.currentOperationId) {
      return {
        action: 'EXECUTE_OPERATION',
        operationId: project.simulation.currentOperationId,
        reason: 'Continuar operação em andamento',
        confidence: 0.8,
      };
    }

    return undefined;
  }

  /**
   * Verifica se episódio deve ser incluído baseado na decisão
   */
  private shouldIncludeEpisode(decision?: ConstructionDecision): boolean {
    if (!decision) return true;
    if (decision.action === 'WAIT' && !this.config.includeWaitEpisodes) return false;
    if (decision.action === 'REQUEST_MATERIAL' && !this.config.includeMaterialRequestEpisodes) return false;
    if (decision.action === 'BLOCKED') return false;
    return true;
  }

  /**
   * Cria episódio individual
   */
  private createEpisode(
    frame: ConstructionTimelineFrame,
    prevFrame: ConstructionTimelineFrame | undefined,
    sequence: number,
    project: Project,
    decision?: ConstructionDecision
  ): ConstructionEpisode {
    const objective = generateObjective(frame, prevFrame);
    const action = generateAction(frame, decision, project.simulation?.currentOperationId ?? undefined);
    const environment = generateEnvironment(frame);
    const visualPrompt = generateVisualPrompt(frame, project.visualDNA, project, project.simulation, decision);

    const metadata: EpisodeMetadata = {
      frameId: frame.id,
      progress: frame.state.progress,
      completedElements: frame.state.completedElements,
      activeElements: frame.state.activeElements,
      pendingElements: frame.state.pendingElements,
      decision,
      decisionConfidence: decision?.confidence,
      createdAt: Date.now(),
    };

    const estimatedDuration = this.config.baseEpisodeDuration + action.estimatedDuration;

    return {
      id: `episode-${sequence}-${frame.id}`,
      sequence,
      title: `Episódio ${sequence}: ${objective.description}`,
      objective,
      action,
      environment,
      visualPrompt,
      estimatedDuration,
      metadata,
    };
  }

  /**
   * Gera série a partir de operações simuladas (para projetos sem timeline completa)
   */
  generateFromOperations(project: Project, operations: any[]): ConstructionSeries {
    const episodes: ConstructionEpisode[] = [];
    let sequence = 0;

    for (const operation of operations) {
      if (this.config.maxEpisodes && sequence >= this.config.maxEpisodes) break;

      sequence++;

      // Criar frame simulado para a operação
      const frame: ConstructionTimelineFrame = {
        id: `frame-${operation.id}`,
        sceneId: operation.scenes?.[0] || 'scene-1',
        progress: (sequence / operations.length) * 100,
        state: {
          sceneId: operation.scenes?.[0] || 'scene-1',
          progress: (sequence / operations.length) * 100,
          completedElements: operations.slice(0, sequence).flatMap(op => op.elements || []),
          activeElements: operation.elements || [],
          pendingElements: operations.slice(sequence).flatMap(op => op.elements || []),
          materialState: {
            available: project.worldState?.materials
              ?.filter(m => m.status === 'disponivel')
              .map(m => m.materialId) || [],
            consumed: [],
            remaining: [],
          },
          workerState: {
            position: operation.zones?.[0] || 'site',
            action: `Executando ${operation.name}`,
            tools: operation.visualBasis?.tools || [],
          },
          environmentState: {
            terrain: project.worldState?.terrain?.type || 'flat',
            weather: project.worldState?.climate || 'clear',
            lighting: project.worldState?.light || 'day',
          },
          createdAt: new Date(),
        },
        visualChanges: {
          added: operation.elements || [],
          removed: [],
          modified: [],
        },
        previousFrameId: sequence > 1 ? `frame-${operations[sequence - 2].id}` : undefined,
        createdAt: new Date(),
      };

      const decision: ConstructionDecision = {
        action: 'EXECUTE_OPERATION',
        operationId: operation.id,
        reason: `Executar ${operation.name}`,
        confidence: 0.9,
      };

      const prevFrame = sequence > 1 ? {
        ...frame,
        id: `frame-${operations[sequence - 2].id}`,
        state: {
          ...frame.state,
          progress: ((sequence - 1) / operations.length) * 100,
          completedElements: operations.slice(0, sequence - 1).flatMap(op => op.elements || []),
          activeElements: operations[sequence - 2]?.elements || [],
          pendingElements: operations.slice(sequence - 1).flatMap(op => op.elements || []),
        },
      } : undefined;

      const episode = this.createEpisode(frame, prevFrame, sequence, project, decision);
      episodes.push(episode);
    }

    const totalDuration = episodes.reduce((sum, ep) => sum + ep.estimatedDuration, 0);

    return {
      id: `series-${project.id}-${Date.now()}`,
      projectId: project.id,
      name: `${project.name} - Série de Operações`,
      episodes,
      totalEstimatedDuration: totalDuration,
      totalProgress: 100,
      createdAt: Date.now(),
    };
  }
}

/**
 * Factory function
 */
export function createConstructionSeriesGenerator(config?: Partial<SeriesGenerationConfig>): ConstructionSeriesGenerator {
  return new ConstructionSeriesGenerator(config);
}