import { ConstructionStateSnapshot } from './construction-state';
import { ConstructionDecision } from '../decision';
import { VisualPromptResult } from '../visual/VisualPromptCompiler';

/**
 * Objetivo de um episódio na série de construção
 */
export interface EpisodeObjective {
  /** Tipo de objetivo */
  type: 'foundation' | 'structure' | 'enclosure' | 'finishing' | 'inspection' | 'material_delivery' | 'tool_preparation';
  /** Descrição legível do objetivo */
  description: string;
  /** Elementos de construção relacionados */
  elements: string[];
  /** Prioridade (1-10) */
  priority: number;
}

/**
 * Ação do trabalhador no episódio
 */
export interface EpisodeAction {
  /** Tipo de ação */
  type: 'build' | 'move' | 'inspect' | 'craft' | 'deliver' | 'prepare' | 'wait';
  /** Descrição da ação */
  description: string;
  /** Ferramentas necessárias */
  tools: string[];
  /** Materiais consumidos */
  materials: string[];
  /** Duração estimada em segundos */
  estimatedDuration: number;
  /** Zona onde ocorre */
  zone: string;
}

/**
 * Ambiente do episódio
 */
export interface EpisodeEnvironment {
  /** Tipo de terreno */
  terrain: string;
  /** Inclinação */
  slope: string;
  /** Vegetação */
  vegetation: string;
  /** Solo */
  soil: string;
  /** Clima */
  climate: string;
  /** Iluminação */
  lighting: string;
  /** Hora do dia */
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  /** Clima atmosférico */
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
  /** Zona ativa */
  activeZone: string;
}

/**
 * Metadados do episódio
 */
export interface EpisodeMetadata {
  /** ID do frame da timeline */
  frameId: string;
  /** Progresso da construção (0-100) */
  progress: number;
  /** Elementos completados neste frame */
  completedElements: string[];
  /** Elementos ativos neste frame */
  activeElements: string[];
  /** Elementos pendentes */
  pendingElements: string[];
  /** Decisão associada (se houver) */
  decision?: ConstructionDecision;
  /** Confiança da decisão */
  decisionConfidence?: number;
  /** Timestamp de criação */
  createdAt: number;
}

/**
 * Episódio individual da série de construção
 */
export interface ConstructionEpisode {
  /** ID único do episódio */
  id: string;
  /** Número de sequência (1-based) */
  sequence: number;
  /** Título do episódio */
  title: string;
  /** Objetivo do episódio */
  objective: EpisodeObjective;
  /** Ação do trabalhador */
  action: EpisodeAction;
  /** Ambiente */
  environment: EpisodeEnvironment;
  /** Prompt visual compilado */
  visualPrompt: VisualPromptResult;
  /** Duração estimada total do episódio (segundos) */
  estimatedDuration: number;
  /** Metadados */
  metadata: EpisodeMetadata;
}

/**
 * Série completa de construção
 */
export interface ConstructionSeries {
  /** ID da série */
  id: string;
  /** ID do projeto */
  projectId: string;
  /** Nome da série */
  name: string;
  /** Episódios ordenados */
  episodes: ConstructionEpisode[];
  /** Duração total estimada (segundos) */
  totalEstimatedDuration: number;
  /** Progresso total (0-100) */
  totalProgress: number;
  /** Timestamp de criação */
  createdAt: number;
}

/**
 * Configuração para geração da série
 */
export interface SeriesGenerationConfig {
  /** Duração base por episódio (segundos) */
  baseEpisodeDuration: number;
  /** Incluir episódios de decisão WAIT */
  includeWaitEpisodes: boolean;
  /** Incluir episódios de decisão REQUEST_MATERIAL */
  includeMaterialRequestEpisodes: boolean;
  /** Número máximo de episódios */
  maxEpisodes?: number;
  /** Callback para personalizar prompt visual */
  visualPromptCustomizer?: (episode: ConstructionEpisode, project: any) => VisualPromptResult;
}

// Re-export types from EpisodePlanner for cross-module usage
export type { PlannedEpisode, EpisodePlan } from '../series/EpisodePlanner';