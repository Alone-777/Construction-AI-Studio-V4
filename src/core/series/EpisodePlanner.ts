import {
  ConstructionSeries,
  ConstructionEpisode,
  EpisodeObjective,
  EpisodeAction,
  EpisodeEnvironment,
  EpisodeMetadata,
} from '../types/construction-series';
import {
  ShotType,
  CinematicCameraMovement,
  HookType,
  VisualProgressionPhase,
  SatisfyingMomentType,
  VerticalVideoStructure,
  SatisfyingMoment,
  CinematicScene,
  SceneDirectorConfig,
} from '../types/scene-director';
import { VisualPromptResult } from '../visual/VisualPromptCompiler';

/**
 * Configuração do EpisodePlanner
 */
export interface EpisodePlannerConfig {
  /** Duração alvo total do vídeo (segundos) */
  targetTotalDuration: number;
  /** Duração máxima por episódio (segundos) */
  maxEpisodeDuration: number;
  /** Número ideal de episódios */
  targetEpisodeCount: number;
  /** Incluir hook de abertura */
  includeOpeningHook: boolean;
  /** Incluir CTA final */
  includeClosingCTA: boolean;
  /** Estilo de transição entre episódios */
  transitionStyle: 'cut' | 'crossfade' | 'match_cut' | 'whip_pan' | 'morph';
  /** Intensidade de variação visual (1-10) */
  visualVarietyIntensity: number;
}

/**
 * Plano de episódio com metadados cinematográficos
 */
export interface PlannedEpisode {
  /** Episódio original */
  episode: ConstructionEpisode;
  /** Ordem cinematográfica (pode diferir da sequência original) */
  cinematicOrder: number;
  /** Shot types planejados para este episódio */
  plannedShots: Array<{
    shotType: ShotType;
    cameraMovement: CinematicCameraMovement;
    duration: number;
    hook?: HookType;
    visualProgression: VisualProgressionPhase;
    satisfyingMoments: SatisfyingMoment[];
  }>;
  /** Duração total planejada */
  plannedDuration: number;
  /** Prioridade cinematográfica (1-10) */
  cinematicPriority: number;
  /** Tags para busca/edição */
  tags: string[];
}

/**
 * Resultado do planejamento
 */
export interface EpisodePlan {
  /** Série original */
  series: ConstructionSeries;
  /** Episódios planejados em ordem cinematográfica */
  plannedEpisodes: PlannedEpisode[];
  /** Estrutura vertical do vídeo completo */
  verticalStructure: VerticalVideoStructure;
  /** Duração total planejada */
  totalPlannedDuration: number;
  /** Metadados do plano */
  metadata: {
    createdAt: number;
    configUsed: EpisodePlannerConfig;
    episodeCount: number;
    shotCount: number;
  };
}

/**
 * EpisodePlanner - Transforma ConstructionSeries em plano cinematográfico ordenado
 * para produção de vídeo TikTok
 */
export class EpisodePlanner {
  private config: EpisodePlannerConfig;

  constructor(config: Partial<EpisodePlannerConfig> = {}) {
    this.config = {
      targetTotalDuration: 60,
      maxEpisodeDuration: 20,
      targetEpisodeCount: 5,
      includeOpeningHook: true,
      includeClosingCTA: true,
      transitionStyle: 'match_cut',
      visualVarietyIntensity: 7,
      ...config,
    };
  }

  /**
   * Método principal: planeja episódios cinematográficos a partir de uma série
   */
  plan(series: ConstructionSeries): EpisodePlan {
    // 1. Filtrar e priorizar episódios
    const prioritizedEpisodes = this.prioritizeEpisodes(series.episodes);

    // 2. Selecionar episódios para o target count
    const selectedEpisodes = this.selectEpisodes(prioritizedEpisodes);

    // 3. Planejar shots para cada episódio
    const plannedEpisodes = this.planShotsForEpisodes(selectedEpisodes);

    // 4. Ajustar durações para caber no target total
    const adjustedEpisodes = this.adjustDurations(plannedEpisodes);

    // 5. Criar estrutura vertical
    const verticalStructure = this.createVerticalStructure(adjustedEpisodes);

    // 6. Calcular totais
    const totalPlannedDuration = adjustedEpisodes.reduce((sum, ep) => sum + ep.plannedDuration, 0);
    const totalShotCount = adjustedEpisodes.reduce((sum, ep) => sum + ep.plannedShots.length, 0);

    return {
      series,
      plannedEpisodes: adjustedEpisodes,
      verticalStructure,
      totalPlannedDuration,
      metadata: {
        createdAt: Date.now(),
        configUsed: { ...this.config },
        episodeCount: adjustedEpisodes.length,
        shotCount: totalShotCount,
      },
    };
  }

  /**
   * Prioriza episódios baseado em valor cinematográfico
   */
  private prioritizeEpisodes(episodes: ConstructionEpisode[]): Array<ConstructionEpisode & { cinematicScore: number }> {
    return episodes.map(episode => {
      let score = 0;

      // Priorizar por tipo de objetivo (foundation/structure mais visual)
      const objectiveScores: Record<EpisodeObjective['type'], number> = {
        foundation: 9,
        structure: 8,
        enclosure: 7,
        finishing: 6,
        inspection: 5,
        material_delivery: 3,
        tool_preparation: 2,
      };
      score += objectiveScores[episode.objective.type] || 5;

      // Priorizar ações visuais
      const actionScores: Record<EpisodeAction['type'], number> = {
        build: 9,
        craft: 7,
        inspect: 6,
        move: 5,
        deliver: 4,
        prepare: 3,
        wait: 1,
      };
      score += actionScores[episode.action.type] || 5;

      // Bonus por elementos completados (progresso visível)
      score += Math.min(episode.metadata.completedElements.length, 5);

      // Bonus por variedade de ferramentas
      score += Math.min(episode.action.tools.length, 3);

      // Penalizar episódios muito longos
      if (episode.estimatedDuration > this.config.maxEpisodeDuration) {
        score -= 2;
      }

      return { ...episode, cinematicScore: score };
    }).sort((a, b) => b.cinematicScore - a.cinematicScore);
  }

  /**
   * Seleciona episódios para atingir target count
   */
  private selectEpisodes(
    prioritized: Array<ConstructionEpisode & { cinematicScore: number }>
  ): ConstructionEpisode[] {
    const selected: ConstructionEpisode[] = [];
    let totalDuration = 0;

    for (const ep of prioritized) {
      if (selected.length >= this.config.targetEpisodeCount) break;
      if (totalDuration + ep.estimatedDuration > this.config.targetTotalDuration) break;

      selected.push(ep);
      totalDuration += ep.estimatedDuration;
    }

    // Garantir pelo menos 1 episódio
    if (selected.length === 0 && prioritized.length > 0) {
      selected.push(prioritized[0]);
    }

    // Reordenar por sequência original para manter cronologia
    return selected.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Planeja shots para cada episódio selecionado
   */
  private planShotsForEpisodes(episodes: ConstructionEpisode[]): PlannedEpisode[] {
    return episodes.map((episode, index) => {
      const shotCount = this.calculateShotCount(episode);
      const shots = this.generateShotPlan(episode, shotCount, index === 0, index === episodes.length - 1);

      const plannedDuration = shots.reduce((sum, s) => sum + s.duration, 0);
      const cinematicPriority = this.calculateCinematicPriority(episode, index, episodes.length);

      return {
        episode,
        cinematicOrder: index + 1,
        plannedShots: shots,
        plannedDuration,
        cinematicPriority,
        tags: this.generateTags(episode),
      };
    });
  }

  /**
   * Calcula número de shots baseado no episódio
   */
  private calculateShotCount(episode: ConstructionEpisode): number {
    let count = 3; // base

    // Mais shots para ações complexas
    if (episode.action.type === 'build' || episode.action.type === 'craft') count += 1;
    if (episode.objective.type === 'finishing') count += 1;
    if (episode.metadata.completedElements.length > 2) count += 1;

    // Limitar
    return Math.min(count, 5);
  }

  /**
   * Gera plano de shots para um episódio
   */
  private generateShotPlan(
    episode: ConstructionEpisode,
    shotCount: number,
    isFirst: boolean,
    isLast: boolean
  ): PlannedEpisode['plannedShots'] {
    const shots: PlannedEpisode['plannedShots'] = [];
    const shotDuration = Math.min(episode.estimatedDuration / shotCount, 10);

    for (let i = 0; i < shotCount; i++) {
      const isOpeningShot = isFirst && i === 0;
      const isClosingShot = isLast && i === shotCount - 1;

      const shotType = this.selectShotType(episode, i, shotCount, isOpeningShot, isClosingShot);
      const cameraMovement = this.selectCameraMovement(episode, i, shotCount, isOpeningShot, isClosingShot);
      const visualProgression = this.selectVisualProgression(i, shotCount, isOpeningShot, isClosingShot);
      const hook = isOpeningShot ? this.selectHook(episode) : undefined;
      const satisfyingMoments = this.identifySatisfyingMoments(episode, i, shotCount, shotDuration);

      shots.push({
        shotType,
        cameraMovement,
        duration: shotDuration,
        hook,
        visualProgression,
        satisfyingMoments,
      });
    }

    return shots;
  }

  /**
   * Seleciona tipo de shot baseado no episódio e posição
   */
  private selectShotType(
    episode: ConstructionEpisode,
    shotIndex: number,
    totalShots: number,
    isOpening: boolean,
    isClosing: boolean
  ): ShotType {
    if (isOpening) {
      // Shot de abertura: wide ou aerial para estabelecer
      if (episode.objective.type === 'foundation') return 'wide';
      return 'aerial';
    }

    if (isClosing) {
      // Shot de fechamento: detail ou extreme_closeup para satisfação
      if (episode.objective.type === 'finishing') return 'detail';
      return 'extreme_closeup';
    }

    // Shots do meio baseados na ação
    const actionShots: Record<EpisodeAction['type'], ShotType[]> = {
      build: ['closeup', 'medium', 'detail'],
      craft: ['closeup', 'extreme_closeup', 'detail'],
      inspect: ['extreme_closeup', 'closeup', 'medium'],
      move: ['medium', 'wide', 'medium'],
      deliver: ['medium', 'closeup', 'medium'],
      prepare: ['medium', 'closeup', 'wide'],
      wait: ['medium', 'wide', 'medium'],
    };

    const shots = actionShots[episode.action.type] || ['medium', 'closeup', 'wide'];
    return shots[shotIndex % shots.length];
  }

  /**
   * Seleciona movimento de câmera (determinístico)
   */
  private selectCameraMovement(
    episode: ConstructionEpisode,
    shotIndex: number,
    totalShots: number,
    isOpening: boolean,
    isClosing: boolean
  ): CinematicCameraMovement {
    if (isOpening) {
      const openingMovements: CinematicCameraMovement[] = ['crane_up', 'dolly_in', 'orbit', 'push_in'];
      const hash = this.hashString(episode.id + 'opening');
      return openingMovements[hash % openingMovements.length];
    }

    if (isClosing) {
      const closingMovements: CinematicCameraMovement[] = ['static', 'push_in', 'orbit', 'smooth'];
      const hash = this.hashString(episode.id + 'closing');
      return closingMovements[hash % closingMovements.length];
    }

    const actionMovements: Record<EpisodeAction['type'], CinematicCameraMovement[]> = {
      build: ['push_in', 'tilt_up', 'pan_right', 'smooth'],
      move: ['truck_left', 'truck_right', 'pan_left', 'pan_right'],
      inspect: ['push_in', 'orbit', 'tilt_down', 'static'],
      craft: ['push_in', 'tilt_up', 'smooth', 'static'],
      deliver: ['truck_left', 'pan_right', 'dolly_in', 'smooth'],
      prepare: ['pan_left', 'tilt_up', 'smooth', 'static'],
      wait: ['static', 'shake', 'pan_left'],
    };

    const movements = actionMovements[episode.action.type] || ['smooth', 'pan_right'];
    return movements[shotIndex % movements.length];
  }

  /**
   * Seleciona fase de progressão visual
   */
  private selectVisualProgression(
    shotIndex: number,
    totalShots: number,
    isOpening: boolean,
    isClosing: boolean
  ): VisualProgressionPhase {
    if (isOpening || shotIndex === 0) return 'setup';
    if (isClosing || shotIndex === totalShots - 1) return 'satisfaction';

    const phases: VisualProgressionPhase[] = ['build_up', 'climax', 'resolution'];
    const phaseIndex = Math.min(shotIndex - 1, phases.length - 1);
    return phases[Math.max(0, phaseIndex)];
  }

  /**
   * Seleciona hook para abertura
   */
  private selectHook(episode: ConstructionEpisode): HookType {
    if (episode.sequence === 1) {
      if (episode.metadata.progress === 0) return 'visual_reveal';
      return 'before_after';
    }
    if (episode.objective.type === 'foundation') return 'action_start';
    if (episode.action.type === 'inspect') return 'curiosity_gap';
    if (episode.objective.type === 'finishing') return 'satisfying_completion';
    if (episode.metadata.completedElements.length > episode.metadata.activeElements.length) {
      return 'transformation';
    }
    return 'problem_solution';
  }

  /**
   * Identifica momentos satisfatórios para um shot
   */
  private identifySatisfyingMoments(
    episode: ConstructionEpisode,
    shotIndex: number,
    totalShots: number,
    shotDuration: number
  ): SatisfyingMoment[] {
    const moments: SatisfyingMoment[] = [];
    const shotStart = shotIndex * shotDuration;
    const shotEnd = shotStart + shotDuration;
    const objectiveType = episode.objective.type;
    const actionType = episode.action.type;
    const completedCount = episode.metadata.completedElements.length;

    // Perfect fit
    if (actionType === 'build' && completedCount > 0 && shotIndex === Math.floor(totalShots * 0.6)) {
      moments.push({
        type: 'perfect_fit',
        timestamp: shotDuration * 0.6,
        duration: 2,
        description: 'Elemento se encaixa perfeitamente na estrutura',
        shotType: 'closeup',
        cameraMovement: 'push_in',
      });
    }

    // Smooth operation
    if ((actionType === 'build' || actionType === 'craft') && shotIndex === Math.floor(totalShots * 0.3)) {
      moments.push({
        type: 'smooth_operation',
        timestamp: shotDuration * 0.3,
        duration: 3,
        description: 'Movimento fluido e rítmico da construção',
        shotType: 'medium',
        cameraMovement: 'smooth',
      });
    }

    // Transformation reveal
    if (completedCount > 0 && episode.metadata.activeElements.length > 0 && shotIndex === Math.floor(totalShots * 0.8)) {
      moments.push({
        type: 'transformation_reveal',
        timestamp: shotDuration * 0.8,
        duration: 2,
        description: 'Revelação da transformação visual',
        shotType: 'wide',
        cameraMovement: 'crane_up',
      });
    }

    // Completion click
    if (completedCount > 0 && shotIndex === totalShots - 1) {
      moments.push({
        type: 'completion_click',
        timestamp: shotDuration * 0.9,
        duration: 1,
        description: 'Click satisfatório de elemento completado',
        shotType: 'extreme_closeup',
        cameraMovement: 'static',
      });
    }

    // Rhythmic action
    if (actionType === 'build' && shotIndex === Math.floor(totalShots * 0.4)) {
      moments.push({
        type: 'rhythmic_action',
        timestamp: shotDuration * 0.4,
        duration: 2.5,
        description: 'Ação rítmica e hipnótica',
        shotType: 'closeup',
        cameraMovement: 'smooth',
      });
    }

    // Clean result
    if ((objectiveType === 'finishing' || episode.metadata.progress >= 90) && shotIndex === totalShots - 1) {
      moments.push({
        type: 'clean_result',
        timestamp: shotDuration * 0.95,
        duration: 1.5,
        description: 'Resultado final limpo e polido',
        shotType: 'detail',
        cameraMovement: 'static',
      });
    }

    // Precision moment
    if ((actionType === 'inspect' || objectiveType === 'structure') && shotIndex === Math.floor(totalShots * 0.5)) {
      moments.push({
        type: 'precision_moment',
        timestamp: shotDuration * 0.5,
        duration: 2,
        description: 'Momento de precisão milimétrica',
        shotType: 'extreme_closeup',
        cameraMovement: 'push_in',
      });
    }

    // Organic growth (timelapse)
    if (this.config.visualVarietyIntensity > 5 && (objectiveType === 'structure' || objectiveType === 'enclosure')) {
      moments.push({
        type: 'organic_growth',
        timestamp: shotDuration * 0.7,
        duration: 4,
        description: 'Crescimento orgânico da estrutura (timelapse)',
        shotType: 'timelapse',
        cameraMovement: 'crane_up',
      });
    }

    // Filtrar apenas momentos dentro deste shot
    return moments.filter(m => m.timestamp >= 0 && m.timestamp < shotDuration);
  }

  /**
   * Calcula prioridade cinematográfica
   */
  private calculateCinematicPriority(episode: ConstructionEpisode, index: number, total: number): number {
    let priority = episode.metadata.progress / 10; // 0-10 baseado no progresso

    // Bonus para primeiro e último
    if (index === 0) priority += 3;
    if (index === total - 1) priority += 3;

    // Bonus para tipos visuais
    if (episode.objective.type === 'finishing') priority += 2;
    if (episode.objective.type === 'foundation') priority += 1;

    return Math.min(10, Math.max(1, Math.round(priority)));
  }

  /**
   * Gera tags para o episódio
   */
  private generateTags(episode: ConstructionEpisode): string[] {
    const tags: string[] = [
      episode.objective.type,
      episode.action.type,
      episode.action.zone,
      ...episode.objective.elements,
      ...episode.action.tools,
    ];
    return [...new Set(tags)];
  }

  /**
   * Ajusta durações para caber no target total
   */
  private adjustDurations(plannedEpisodes: PlannedEpisode[]): PlannedEpisode[] {
    const totalDuration = plannedEpisodes.reduce((sum, ep) => sum + ep.plannedDuration, 0);

    if (totalDuration <= this.config.targetTotalDuration) {
      return plannedEpisodes;
    }

    // Reduzir proporcionalmente
    const scale = this.config.targetTotalDuration / totalDuration;

    return plannedEpisodes.map(ep => ({
      ...ep,
      plannedShots: ep.plannedShots.map(shot => ({
        ...shot,
        duration: Math.round(shot.duration * scale * 100) / 100,
      })),
      plannedDuration: Math.round(ep.plannedDuration * scale * 100) / 100,
    }));
  }

  /**
   * Cria estrutura vertical do vídeo (60s TikTok)
   */
  private createVerticalStructure(plannedEpisodes: PlannedEpisode[]): VerticalVideoStructure {
    const hookDuration = this.config.includeOpeningHook ? 3 : 0;
    const developmentEnd = hookDuration + 12;
    const climaxEnd = developmentEnd + 30;
    const satisfactionEnd = climaxEnd + 10;
    const ctaEnd = this.config.includeClosingCTA ? this.config.targetTotalDuration : satisfactionEnd;

    // Coletar todos os momentos de satisfação
    const allMoments = plannedEpisodes.flatMap(ep => ep.plannedShots.flatMap(s => s.satisfyingMoments));
    const satisfactionMoments = allMoments
      .filter(m => m.timestamp >= climaxEnd && m.timestamp < satisfactionEnd)
      .map(m => m.type);

    return {
      hook: {
        startTime: 0,
        endTime: hookDuration,
        type: plannedEpisodes[0]?.plannedShots[0]?.hook || 'visual_reveal',
        description: this.getHookDescription(plannedEpisodes[0]?.plannedShots[0]?.hook || 'visual_reveal'),
      },
      development: {
        startTime: hookDuration,
        endTime: developmentEnd,
        description: 'Desenvolvimento da ação principal, mostrando o processo de construção',
      },
      climax: {
        startTime: developmentEnd,
        endTime: climaxEnd,
        description: 'Momento de maior tensão visual e transformação da estrutura',
      },
      satisfaction: {
        startTime: climaxEnd,
        endTime: satisfactionEnd,
        moments: satisfactionMoments.length > 0 ? satisfactionMoments : ['clean_result', 'completion_click'],
        description: 'Momentos satisfatórios de conclusão e perfeição',
      },
      cta: {
        startTime: satisfactionEnd,
        endTime: ctaEnd,
        description: 'Call to action: seguir, comentar, compartilhar',
      },
    };
  }

  /**
   * Descrição do hook
   */
  private getHookDescription(hook: HookType): string {
    const descriptions: Record<HookType, string> = {
      visual_reveal: 'Revelação visual impactante do local/início da construção',
      action_start: 'Início da ação com movimento dinâmico de construção',
      problem_solution: 'Problema construtivo apresentado e solução iniciada',
      before_after: 'Comparação antes/depois imediata da obra',
      curiosity_gap: 'Gap de curiosidade - o que será construído?',
      satisfying_completion: 'Conclusão satisfatória antecipada do acabamento',
      transformation: 'Transformação visual dramática da estrutura',
      sound_sync: 'Sincronização com som/batida da construção',
    };
    return descriptions[hook];
  }

  /**
   * Atualiza configuração
   */
  updateConfig(config: Partial<EpisodePlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): EpisodePlannerConfig {
    return { ...this.config };
  }

  /**
   * Simple deterministic hash for string-based selection
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Factory function
 */
export function createEpisodePlanner(config?: Partial<EpisodePlannerConfig>): EpisodePlanner {
  return new EpisodePlanner(config);
}