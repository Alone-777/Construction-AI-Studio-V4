import { ConstructionEpisode, PlannedEpisode } from '../types/construction-series';
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

/**
 * SceneDirectorAI - Transforma ConstructionEpisode em cenas cinematográficas para TikTok
 */
export class SceneDirectorAI {
  private config: SceneDirectorConfig;

  constructor(config: Partial<SceneDirectorConfig> = {}) {
    this.config = {
      targetDuration: 60,
      aspectRatio: '9:16',
      hookDuration: 3,
      climaxDuration: 30,
      satisfactionDuration: 10,
      ctaDuration: 5,
      shotsPerEpisode: 3,
      transitionStyle: 'match_cut',
      includeTimelapse: true,
      cameraMovementIntensity: 7,
      ...config,
    };
  }

  /**
   * Método principal: direciona um episódio em cenas cinematográficas
   */
  direct(episode: ConstructionEpisode): CinematicScene[] {
    const scenes: CinematicScene[] = [];
    const shotsPerEpisode = this.config.shotsPerEpisode;
    const totalDuration = this.config.targetDuration;

    // Analisar episódio para determinar tipos de plano e movimentos
    const shotPlan = this.analyzeEpisode(episode, shotsPerEpisode);

    // Gerar hook inicial
    const hook = this.generateHook(episode);

    // Planejar progressão visual
    const progression = this.planVisualProgression(episode, shotsPerEpisode);

    // Identificar momentos satisfatórios
    const satisfyingMoments = this.identifySatisfyingMoments(episode);

    // Criar estrutura vertical
    const verticalStructure = this.createVerticalStructure(totalDuration, hook, satisfyingMoments);

    // Distribuir duração entre shots
    const shotDuration = totalDuration / shotsPerEpisode;

    for (let i = 0; i < shotsPerEpisode; i++) {
      const shot = shotPlan[i];
      const phase = progression[i];

      const scene: CinematicScene = {
        id: `scene-${episode.id}-${i + 1}`,
        episodeId: episode.id,
        sequence: episode.sequence * shotsPerEpisode + i + 1,
        shotType: shot.shotType,
        cameraMovement: shot.cameraMovement,
        duration: shotDuration,
        hook: i === 0 ? hook : undefined,
        visualProgression: phase,
        satisfyingMoments: this.filterMomentsForShot(satisfyingMoments, i, shotsPerEpisode, shotDuration),
        prompt: this.generateScenePrompt(episode, shot, phase, i === 0 ? hook : undefined),
        verticalStructure: i === 0 ? verticalStructure : undefined,
        metadata: {
          objectiveType: episode.objective.type,
          actionType: episode.action.type,
          element: episode.objective.elements[0] || 'construction',
          zone: episode.action.zone,
          progress: episode.metadata.progress,
        },
      };

      scenes.push(scene);
    }

    return scenes;
  }

  /**
   * Analisa episódio e determina plano de shots
   */
  private analyzeEpisode(episode: ConstructionEpisode, shotCount: number): Array<{ shotType: ShotType; cameraMovement: CinematicCameraMovement }> {
    const plan: Array<{ shotType: ShotType; cameraMovement: CinematicCameraMovement }> = [];

    const objectiveType = episode.objective.type;
    const actionType = episode.action.type;
    const progress = episode.metadata.progress;

    // Shot 1: Always wide/establishing with hook
    plan.push({
      shotType: this.selectEstablishingShot(objectiveType, progress),
      cameraMovement: this.selectEstablishingMovement(objectiveType),
    });

    // Shot 2: Action/detail shot
    if (shotCount >= 2) {
      plan.push({
        shotType: this.selectActionShot(actionType, objectiveType),
        cameraMovement: this.selectActionMovement(actionType),
      });
    }

    // Shot 3: Climax/satisfaction shot
    if (shotCount >= 3) {
      plan.push({
        shotType: this.selectClimaxShot(objectiveType, progress),
        cameraMovement: this.selectClimaxMovement(objectiveType, progress),
      });
    }

    // Additional shots for longer episodes
    for (let i = 3; i < shotCount; i++) {
      plan.push({
        shotType: this.selectDetailShot(objectiveType, i),
        cameraMovement: this.selectDetailMovement(i),
      });
    }

    return plan;
  }

  /**
   * Seleciona shot de estabelecimento baseado no tipo de objetivo
   */
  private selectEstablishingShot(objectiveType: string, progress: number): ShotType {
    if (progress < 20) return 'wide'; // Início: mostra o local vazio
    if (progress < 50) return 'aerial'; // Meio: visão aérea da estrutura
    return 'wide'; // Final: mostra a construção completa
  }

  /**
   * Seleciona movimento para shot de estabelecimento (determinístico)
   */
  private selectEstablishingMovement(objectiveType: string): CinematicCameraMovement {
    const movements: CinematicCameraMovement[] = ['crane_up', 'dolly_in', 'orbit', 'push_in'];
    // Deterministic selection based on objectiveType hash
    const hash = this.hashString(objectiveType);
    return movements[hash % movements.length];
  }

  /**
   * Seleciona shot de ação baseado no tipo de ação e objetivo
   */
  private selectActionShot(actionType: string, objectiveType: string): ShotType {
    if (actionType === 'build' || actionType === 'craft') return 'closeup';
    if (actionType === 'move') return 'medium';
    if (actionType === 'inspect') return 'extreme_closeup';
    if (actionType === 'deliver') return 'medium';
    if (objectiveType === 'finishing') return 'detail';
    return 'medium';
  }

  /**
   * Seleciona movimento para shot de ação (determinístico)
   */
  private selectActionMovement(actionType: string): CinematicCameraMovement {
    const actionMovements: Record<string, CinematicCameraMovement[]> = {
      build: ['push_in', 'tilt_up', 'pan_right', 'smooth'],
      move: ['truck_left', 'truck_right', 'pan_left', 'pan_right'],
      inspect: ['push_in', 'orbit', 'tilt_down', 'static'],
      craft: ['push_in', 'tilt_up', 'smooth', 'static'],
      deliver: ['truck_left', 'pan_right', 'dolly_in', 'smooth'],
      wait: ['static', 'shake', 'pan_left'],
      prepare: ['pan_left', 'tilt_up', 'smooth', 'static'],
    };
    const movements = actionMovements[actionType] || ['smooth', 'pan_right'];
    // Deterministic selection based on actionType hash
    const hash = this.hashString(actionType);
    return movements[hash % movements.length];
  }

  /**
   * Seleciona shot de clímax
   */
  private selectClimaxShot(objectiveType: string, progress: number): ShotType {
    if (progress >= 80) return 'extreme_closeup'; // Detalhe final
    if (objectiveType === 'finishing') return 'detail';
    if (objectiveType === 'foundation') return 'detail';
    if (objectiveType === 'structure') return 'closeup';
    if (objectiveType === 'enclosure') return 'medium';
    return 'closeup';
  }

  /**
   * Seleciona movimento para clímax (determinístico)
   */
  private selectClimaxMovement(objectiveType: string, progress: number): CinematicCameraMovement {
    if (progress >= 90) return 'static'; // Parado no resultado final
    const movements: CinematicCameraMovement[] = ['push_in', 'orbit', 'crane_up', 'smooth'];
    // Deterministic selection based on objectiveType + progress hash
    const hash = this.hashString(objectiveType + progress.toString());
    return movements[hash % movements.length];
  }

  /**
   * Seleciona shot de detalhe para shots adicionais
   */
  private selectDetailShot(objectiveType: string, index: number): ShotType {
    const shots: ShotType[] = ['detail', 'extreme_closeup', 'pov', 'timelapse'];
    return shots[index % shots.length];
  }

  /**
   * Seleciona movimento para shot de detalhe
   */
  private selectDetailMovement(index: number): CinematicCameraMovement {
    const movements: CinematicCameraMovement[] = ['orbit', 'push_in', 'tilt_up', 'smooth', 'shake'];
    return movements[index % movements.length];
  }

  /**
   * Gera hook inicial para TikTok (primeiros 3 segundos)
   */
  generateHook(episode: ConstructionEpisode): HookType {
    const objectiveType = episode.objective.type;
    const actionType = episode.action.type;
    const progress = episode.metadata.progress;
    const isFirstEpisode = episode.sequence === 1;

    // Primeiro episódio: visual_reveal ou before_after
    if (isFirstEpisode) {
      if (progress === 0) return 'visual_reveal';
      return 'before_after';
    }

    // Episódio de fundação: action_start
    if (objectiveType === 'foundation') return 'action_start';

    // Episódio de inspeção: curiosity_gap
    if (actionType === 'inspect') return 'curiosity_gap';

    // Episódio de acabamento: satisfying_completion
    if (objectiveType === 'finishing') return 'satisfying_completion';

    // Transformação visual clara: transformation
    if (episode.metadata.completedElements.length > episode.metadata.activeElements.length) {
      return 'transformation';
    }

    // Padrão: problem_solution
    return 'problem_solution';
  }

  /**
   * Planeja progressão visual através dos shots
   */
  planVisualProgression(episode: ConstructionEpisode, shotCount: number): VisualProgressionPhase[] {
    const progression: VisualProgressionPhase[] = [];
    const phases: VisualProgressionPhase[] = ['setup', 'build_up', 'climax', 'resolution', 'satisfaction'];

    for (let i = 0; i < shotCount; i++) {
      const phaseIndex = Math.min(i, phases.length - 1);
      progression.push(phases[phaseIndex]);
    }

    return progression;
  }

  /**
   * Identifica momentos satisfatórios no episódio
   */
  identifySatisfyingMoments(episode: ConstructionEpisode): SatisfyingMoment[] {
    const moments: SatisfyingMoment[] = [];
    const objectiveType = episode.objective.type;
    const actionType = episode.action.type;
    const completedCount = episode.metadata.completedElements.length;
    const shotDuration = this.config.targetDuration / this.config.shotsPerEpisode;

    // Momento 1: Perfect fit - quando elemento se encaixa perfeitamente
    if (actionType === 'build' && completedCount > 0) {
      moments.push({
        type: 'perfect_fit',
        timestamp: shotDuration * 0.6,
        duration: 2,
        description: 'Elemento se encaixa perfeitamente na estrutura',
        shotType: 'closeup',
        cameraMovement: 'push_in',
      });
    }

    // Momento 2: Smooth operation - ação fluida
    if (actionType === 'build' || actionType === 'craft') {
      moments.push({
        type: 'smooth_operation',
        timestamp: shotDuration * 0.3,
        duration: 3,
        description: 'Movimento fluido e rítmico da construção',
        shotType: 'medium',
        cameraMovement: 'smooth',
      });
    }

    // Momento 3: Transformation reveal - revelação da transformação
    if (completedCount > 0 && episode.metadata.activeElements.length > 0) {
      moments.push({
        type: 'transformation_reveal',
        timestamp: shotDuration * 0.8,
        duration: 2,
        description: 'Revelação da transformação visual',
        shotType: 'wide',
        cameraMovement: 'crane_up',
      });
    }

    // Momento 4: Completion click - som satisfatório de conclusão
    if (completedCount > 0) {
      moments.push({
        type: 'completion_click',
        timestamp: shotDuration * 0.9,
        duration: 1,
        description: 'Click satisfatório de elemento completado',
        shotType: 'extreme_closeup',
        cameraMovement: 'static',
      });
    }

    // Momento 5: Rhythmic action - ação rítmica
    if (actionType === 'build') {
      moments.push({
        type: 'rhythmic_action',
        timestamp: shotDuration * 0.4,
        duration: 2.5,
        description: 'Ação rítmica e hipnótica',
        shotType: 'closeup',
        cameraMovement: 'smooth',
      });
    }

    // Momento 6: Clean resultado - resultado limpo
    if (objectiveType === 'finishing' || episode.metadata.progress >= 90) {
      moments.push({
        type: 'clean_result',
        timestamp: shotDuration * 0.95,
        duration: 1.5,
        description: 'Resultado final limpo e polido',
        shotType: 'detail',
        cameraMovement: 'static',
      });
    }

    // Momento 7: Precision moment - momento de precisão
    if (actionType === 'inspect' || objectiveType === 'structure') {
      moments.push({
        type: 'precision_moment',
        timestamp: shotDuration * 0.5,
        duration: 2,
        description: 'Momento de precisão milimétrica',
        shotType: 'extreme_closeup',
        cameraMovement: 'push_in',
      });
    }

    // Momento 8: Organic growth - crescimento orgânico (timelapse)
    if (this.config.includeTimelapse && (objectiveType === 'structure' || objectiveType === 'enclosure')) {
      moments.push({
        type: 'organic_growth',
        timestamp: shotDuration * 0.7,
        duration: 4,
        description: 'Crescimento orgânico da estrutura (timelapse)',
        shotType: 'timelapse',
        cameraMovement: 'crane_up',
      });
    }

    return moments;
  }

  /**
   * Filtra momentos satisfatórios para um shot específico
   */
  private filterMomentsForShot(
    moments: SatisfyingMoment[],
    shotIndex: number,
    totalShots: number,
    shotDuration: number
  ): SatisfyingMoment[] {
    const shotStart = shotIndex * shotDuration;
    const shotEnd = shotStart + shotDuration;

    return moments.filter(m => m.timestamp >= shotStart && m.timestamp < shotEnd)
      .map(m => ({ ...m, timestamp: m.timestamp - shotStart }));
  }

  /**
   * Cria estrutura de vídeo vertical para TikTok
   */
  createVerticalStructure(
    totalDuration: number,
    hook: HookType,
    satisfyingMoments: SatisfyingMoment[]
  ): VerticalVideoStructure {
    const hookEnd = this.config.hookDuration;
    const developmentEnd = 15;
    const climaxEnd = developmentEnd + this.config.climaxDuration;
    const satisfactionEnd = climaxEnd + this.config.satisfactionDuration;
    const ctaEnd = totalDuration;

    // Filtrar momentos de satisfação para a fase de satisfação
    const satisfactionMoments = satisfyingMoments
      .filter(m => m.timestamp >= climaxEnd && m.timestamp < satisfactionEnd)
      .map(m => m.type);

    return {
      hook: {
        startTime: 0,
        endTime: hookEnd,
        type: hook,
        description: this.getHookDescription(hook),
      },
      development: {
        startTime: hookEnd,
        endTime: developmentEnd,
        description: 'Desenvolvimento da ação principal, mostrando o processo',
      },
      climax: {
        startTime: developmentEnd,
        endTime: climaxEnd,
        description: 'Momento de maior tensão visual e transformação',
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
   * Descrição do hook para prompt
   */
  private getHookDescription(hook: HookType): string {
    const descriptions: Record<HookType, string> = {
      visual_reveal: 'Revelação visual impactante do local/início',
      action_start: 'Início da ação com movimento dinâmico',
      problem_solution: 'Problema apresentado e solução iniciada',
      before_after: 'Comparação antes/depois imediata',
      curiosity_gap: 'Gap de curiosidade - o que vai acontecer?',
      satisfying_completion: 'Conclusão satisfatória antecipada',
      transformation: 'Transformação visual dramática',
      sound_sync: 'Sincronização com som/batida',
    };
    return descriptions[hook];
  }

  /**
   * Gera prompt para a cena
   */
  private generateScenePrompt(
    episode: ConstructionEpisode,
    shot: { shotType: ShotType; cameraMovement: CinematicCameraMovement },
    phase: VisualProgressionPhase,
    hook?: HookType
  ): string {
    const parts: string[] = [];

    // Shot type e camera movement
    parts.push(`${shot.shotType} shot`);
    parts.push(`${shot.cameraMovement} camera movement`);

    // Hook description
    if (hook) {
      parts.push(`hook: ${this.getHookDescription(hook)}`);
    }

    // Visual progression
    parts.push(`phase: ${phase}`);

    // Episode context
    parts.push(`construction: ${episode.objective.description}`);
    parts.push(`action: ${episode.action.description}`);
    parts.push(`zone: ${episode.action.zone}`);
    parts.push(`progress: ${episode.metadata.progress}%`);

    // Elements
    if (episode.objective.elements.length > 0) {
      parts.push(`focus on: ${episode.objective.elements.join(', ')}`);
    }

    // Tools
    if (episode.action.tools.length > 0) {
      parts.push(`tools: ${episode.action.tools.join(', ')}`);
    }

    // Environment
    parts.push(`lighting: ${episode.environment.lighting}`);
    parts.push(`time: ${episode.environment.timeOfDay}`);
    parts.push(`weather: ${episode.environment.weather}`);

    // Aspect ratio
    parts.push(`aspect ratio: ${this.config.aspectRatio}`);

    // Style
    parts.push('cinematic, high quality, TikTok vertical video style');

    return parts.join(', ');
  }

  /**
   * Direciona múltiplos episódios em sequência
   */
  directSeries(episodes: ConstructionEpisode[]): CinematicScene[] {
    const allScenes: CinematicScene[] = [];

    for (const episode of episodes) {
      const scenes = this.direct(episode);
      allScenes.push(...scenes);
    }

    // Ajustar sequência global
    allScenes.forEach((scene, index) => {
      scene.sequence = index + 1;
    });

    return allScenes;
  }

  /**
   * Direciona episódios já planejados (do EpisodePlanner) em cenas cinematográficas
   * Usa plannedShots, plannedDuration, verticalStructure do plano - NÃO recalcula
   */
  directFromPlan(plannedEpisodes: PlannedEpisode[], episodePlan?: { verticalStructure: any }): CinematicScene[] {
    const allScenes: CinematicScene[] = [];
    const globalVerticalStructure = episodePlan?.verticalStructure;

    for (const plannedEp of plannedEpisodes) {
      const episode = plannedEp.episode;

      for (let i = 0; i < plannedEp.plannedShots.length; i++) {
        const shot = plannedEp.plannedShots[i];
        const isFirstShot = i === 0 && plannedEp.cinematicOrder === 1;

        const scene: CinematicScene = {
          id: `scene-${episode.id}-${i + 1}`,
          episodeId: episode.id,
          sequence: plannedEp.cinematicOrder * plannedEp.plannedShots.length + i + 1 - plannedEp.plannedShots.length,
          shotType: shot.shotType,
          cameraMovement: shot.cameraMovement,
          duration: shot.duration,
          hook: isFirstShot ? shot.hook : undefined,
          visualProgression: shot.visualProgression,
          satisfyingMoments: shot.satisfyingMoments.map(m => ({
            ...m,
            timestamp: m.timestamp,
          })),
          prompt: this.generateScenePrompt(episode, shot, shot.visualProgression, isFirstShot ? shot.hook : undefined),
          verticalStructure: isFirstShot ? globalVerticalStructure : undefined,
          metadata: {
            objectiveType: episode.objective.type,
            actionType: episode.action.type,
            element: episode.objective.elements[0] || 'construction',
            zone: episode.action.zone,
            progress: episode.metadata.progress,
          },
        };

        allScenes.push(scene);
      }
    }

    // Ajustar sequência global
    allScenes.forEach((scene, index) => {
      scene.sequence = index + 1;
    });

    return allScenes;
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

  /**
   * Atualiza configuração
   */
  updateConfig(config: Partial<SceneDirectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): SceneDirectorConfig {
    return { ...this.config };
  }
}

/**
 * Factory function
 */
export function createSceneDirectorAI(config?: Partial<SceneDirectorConfig>): SceneDirectorAI {
  return new SceneDirectorAI(config);
}