/**
 * Scene Director AI - Types for transforming ConstructionEpisode into cinematic TikTok scenes
 */

/** Tipos de plano cinematográfico */
export type ShotType =
  | 'wide'
  | 'medium'
  | 'closeup'
  | 'extreme_closeup'
  | 'detail'
  | 'aerial'
  | 'pov'
  | 'timelapse';

/** Movimentos de câmera cinematográficos */
export type CinematicCameraMovement =
  | 'static'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'dolly_in'
  | 'dolly_out'
  | 'truck_left'
  | 'truck_right'
  | 'crane_up'
  | 'crane_down'
  | 'orbit'
  | 'push_in'
  | 'pull_out'
  | 'shake'
  | 'smooth';

/** Tipos de hook inicial para TikTok */
export type HookType =
  | 'visual_reveal'
  | 'action_start'
  | 'problem_solution'
  | 'before_after'
  | 'curiosity_gap'
  | 'satisfying_completion'
  | 'transformation'
  | 'sound_sync';

/** Fases de progressão visual */
export type VisualProgressionPhase =
  | 'setup'
  | 'build_up'
  | 'climax'
  | 'resolution'
  | 'satisfaction';

/** Tipos de momentos satisfatórios */
export type SatisfyingMomentType =
  | 'perfect_fit'
  | 'smooth_operation'
  | 'transformation_reveal'
  | 'completion_click'
  | 'rhythmic_action'
  | 'clean_result'
  | 'precision_moment'
  | 'organic_growth';

/** Estrutura de vídeo vertical para TikTok (60s) */
export interface VerticalVideoStructure {
  /** Hook inicial: 0-3 segundos */
  hook: {
    startTime: number;
    endTime: number;
    type: HookType;
    description: string;
  };
  /** Desenvolvimento: 3-15 segundos */
  development: {
    startTime: number;
    endTime: number;
    description: string;
  };
  /** Clímax: 15-45 segundos */
  climax: {
    startTime: number;
    endTime: number;
    description: string;
  };
  /** Satisfação: 45-55 segundos */
  satisfaction: {
    startTime: number;
    endTime: number;
    moments: SatisfyingMomentType[];
    description: string;
  };
  /** Call to action: 55-60 segundos */
  cta: {
    startTime: number;
    endTime: number;
    description: string;
  };
}

/** Momento satisfatório individual */
export interface SatisfyingMoment {
  type: SatisfyingMomentType;
  timestamp: number;
  duration: number;
  description: string;
  shotType: ShotType;
  cameraMovement: CinematicCameraMovement;
}

/** Cena cinematográfica individual */
export interface CinematicScene {
  /** ID único da cena */
  id: string;
  /** ID do episódio de origem */
  episodeId: string;
  /** Número de sequência na série */
  sequence: number;
  /** Tipo de plano */
  shotType: ShotType;
  /** Movimento de câmera */
  cameraMovement: CinematicCameraMovement;
  /** Duração em segundos */
  duration: number;
  /** Hook aplicado (se for cena de abertura) */
  hook?: HookType;
  /** Fase de progressão visual */
  visualProgression: VisualProgressionPhase;
  /** Momentos satisfatórios nesta cena */
  satisfyingMoments: SatisfyingMoment[];
  /** Prompt visual compilado para geração de vídeo */
  prompt: string;
  /** Estrutura de vídeo vertical (apenas na cena principal) */
  verticalStructure?: VerticalVideoStructure;
  /** Metadados adicionais */
  metadata: {
    objectiveType: string;
    actionType: string;
    element: string;
    zone: string;
    progress: number;
  };
}

/** Configuração do SceneDirectorAI */
export interface SceneDirectorConfig {
  /** Duração alvo total do vídeo (segundos) */
  targetDuration: number;
  /** Proporção de aspecto (vertical TikTok = 9:16) */
  aspectRatio: '9:16' | '16:9' | '1:1';
  /** Duração do hook (segundos) */
  hookDuration: number;
  /** Duração do clímax (segundos) */
  climaxDuration: number;
  /** Duração da satisfação (segundos) */
  satisfactionDuration: number;
  /** Duração do CTA (segundos) */
  ctaDuration: number;
  /** Número de shots por episódio */
  shotsPerEpisode: number;
  /** Estilo de transição entre cenas */
  transitionStyle: 'cut' | 'crossfade' | 'match_cut' | 'whip_pan' | 'morph';
  /** Incluir timelapse para operações longas */
  includeTimelapse: boolean;
  /** Intensidade de movimentos de câmera (1-10) */
  cameraMovementIntensity: number;
}