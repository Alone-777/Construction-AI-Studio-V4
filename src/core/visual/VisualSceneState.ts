import { CharacterState } from '../types/character';
import { Camera } from '../types/camera';
import { MaterialInstance, ToolInstance, Residue } from '../types/materials';
import { ConstructionComponent } from '../types/construction';
import { Point } from '../types/spatial';

export type { Point } from '../types/spatial';

/**
 * Elemento visual da cena (para composição)
 */
export interface VisualElement {
  id: string;
  type: 'character' | 'construction' | 'material' | 'tool' | 'prop' | 'effect';
  name: string;
  position: Point;
  rotation: number;
  scale: number;
  visible: boolean;
  layer: number;
  metadata?: Record<string, any>;
}

/**
 * Configuração de lente
 */
export interface LensConfig {
  focalLength: number; // mm
  aperture: string; // f-stop
  focusDistance: number;
  depthOfField: boolean;
}

/**
 * Configuração de iluminação
 */
export interface LightingConfig {
  type: 'natural' | 'artificial' | 'mixed';
  keyLight: {
    direction: Point;
    intensity: number;
    color: string;
    temperature: number; // Kelvin
  };
  fillLight?: {
    direction: Point;
    intensity: number;
    color: string;
  };
  ambientLight?: {
    intensity: number;
    color: string;
  };
  shadows: boolean;
  shadowSoftness: number;
}

/**
 * Configuração de câmera para composição
 */
export interface CameraConfig {
  position: Point;
  target: Point;
  up: Point;
  fov: number;
  aspectRatio: number;
  near: number;
  far: number;
  movement: 'FIXA' | 'FOLLOW' | 'CUT' | 'DOLLY' | 'PAN' | 'TILT' | 'CRANE';
  path?: Point[]; // para movimentos complexos
  duration?: number; // em segundos
}

/**
 * Metadados da cena
 */
export interface SceneMetadata {
  title: string;
  description: string;
  locationType: string;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
}

/**
 * Ação na cena
 */
export interface SceneAction {
  type: 'idle' | 'walk' | 'build' | 'craft' | 'inspect' | 'move_object' | 'custom';
  description: string;
  actorId?: string;
  targetId?: string;
  startTime: number;
  duration: number;
  keyframes?: Array<{ time: number; position: Point; rotation: number }>;
}

/**
 * Ambiente visual da cena
 */
export interface VisualEnvironment {
  terrain: {
    type: string;
    slope: string;
    vegetation: string;
    soil: string;
  };
  climate: string;
  light: string;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
}

/**
 * Estado visual da construção
 */
export interface VisualConstruction {
  type: string;
  progress: number; // 0-100
  status: string;
  existingComponents: string[];
  partialComponents: string[];
  futureComponents: string[];
  components: ConstructionComponent[];
}

/**
 * Materiais visuais
 */
export interface VisualMaterials {
  materials: MaterialInstance[];
  consumedMaterials: MaterialInstance[];
  residues: Residue[];
  tools: ToolInstance[];
}

/**
 * Estado da câmera
 */
export interface VisualCamera {
  current: Camera;
  previous?: Camera;
  transition?: {
    from: Camera;
    to: Camera;
    progress: number;
  };
}

/**
 * Estado visual do personagem
 */
export interface VisualCharacter {
  state: CharacterState;
  position: Point;
  targetPosition?: Point;
  isMoving: boolean;
}

/**
 * Status de renderização
 */
export interface RenderStatus {
  isRendering: boolean;
  progress: number; // 0-1
  currentFrame: number;
  totalFrames: number;
  errors: string[];
  lastRenderTime: number;
}

/**
 * Estado visual completo da cena para o Visual Engine
 */
export interface VisualSceneState {
  // Metadados da cena
  scene: SceneMetadata;
  // Configuração de câmera para composição
  cameraConfig: CameraConfig;
  // Configuração de lente
  lens: LensConfig;
  // Configuração de iluminação
  lighting: LightingConfig;
  // Elementos visuais da composição
  elements: VisualElement[];
  // Ação na cena
  action: SceneAction;
  // Estado original (mantido para compatibilidade)
  environment: VisualEnvironment;
  construction: VisualConstruction;
  materials: VisualMaterials;
  camera: VisualCamera;
  character: VisualCharacter;
  renderStatus: RenderStatus;
  activeZone: string;
  timestamp: number;
}

/**
 * Estado padrão vazio para inicialização
 */
export const DEFAULT_VISUAL_SCENE_STATE: VisualSceneState = {
  scene: {
    title: '',
    description: '',
    locationType: '',
    timeOfDay: 'day',
    weather: 'clear'
  },
  cameraConfig: {
    position: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    up: { x: 0, y: -1 },
    fov: 60,
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 1000,
    movement: 'FIXA'
  },
  lens: {
    focalLength: 35,
    aperture: 'f/2.8',
    focusDistance: 10,
    depthOfField: false
  },
  lighting: {
    type: 'natural',
    keyLight: {
      direction: { x: 1, y: -1 },
      intensity: 1,
      color: '#ffffff',
      temperature: 5600
    },
    fillLight: {
      direction: { x: -1, y: -0.5 },
      intensity: 0.3,
      color: '#ffffff'
    },
    ambientLight: {
      intensity: 0.2,
      color: '#ffffff'
    },
    shadows: true,
    shadowSoftness: 0.5
  },
  elements: [],
  action: {
    type: 'idle',
    description: '',
    startTime: 0,
    duration: 0
  },
  environment: {
    terrain: { type: '', slope: '', vegetation: '', soil: '' },
    climate: '',
    light: '',
    timeOfDay: 'day',
    weather: 'clear'
  },
  construction: {
    type: '',
    progress: 0,
    status: '',
    existingComponents: [],
    partialComponents: [],
    futureComponents: [],
    components: []
  },
  materials: {
    materials: [],
    consumedMaterials: [],
    residues: [],
    tools: []
  },
  camera: {
    current: {
      id: 'A',
      relativePosition: { x: 0, y: 0 },
      orientation: 0,
      conceptualHeight: 'media',
      framing: 'medium',
      allowedMovement: 'FIXA',
      visibleZones: [],
      partiallyVisibleZones: [],
      hiddenZones: []
    }
  },
  character: {
    state: {
      characterId: '',
      currentZone: '',
      orientation: 'frente',
      carriedObjects: [],
      movementRequired: false
    },
    position: { x: 0, y: 0 },
    isMoving: false
  },
  renderStatus: {
    isRendering: false,
    progress: 0,
    currentFrame: 0,
    totalFrames: 0,
    errors: [],
    lastRenderTime: 0
  },
  activeZone: '',
  timestamp: Date.now()
};

/**
 * Conversor de WorldState para VisualSceneState
 */
export function worldStateToVisualSceneState(worldState: any): VisualSceneState {
  return {
    scene: {
      title: worldState.scene?.title || '',
      description: worldState.scene?.description || '',
      locationType: worldState.scene?.locationType || '',
      timeOfDay: worldState.scene?.timeOfDay || 'day',
      weather: worldState.scene?.weather || 'clear'
    },
    cameraConfig: worldState.cameraConfig || {
      position: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      up: { x: 0, y: -1 },
      fov: 60,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      movement: 'FIXA'
    },
    lens: worldState.lens || {
      focalLength: 35,
      aperture: 'f/2.8',
      focusDistance: 10,
      depthOfField: false
    },
    lighting: worldState.lighting || {
      type: 'natural',
      keyLight: {
        direction: { x: 1, y: -1 },
        intensity: 1,
        color: '#ffffff',
        temperature: 5600
      },
      fillLight: {
        direction: { x: -1, y: -0.5 },
        intensity: 0.3,
        color: '#ffffff'
      },
      ambientLight: {
        intensity: 0.2,
        color: '#ffffff'
      },
      shadows: true,
      shadowSoftness: 0.5
    },
    elements: worldState.elements || [],
    action: worldState.action || {
      type: 'idle',
      description: '',
      startTime: 0,
      duration: 0
    },
    environment: {
      terrain: worldState.terrain || { type: '', slope: '', vegetation: '', soil: '' },
      climate: worldState.climate || '',
      light: worldState.light || '',
      timeOfDay: 'day',
      weather: 'clear'
    },
    construction: {
      type: worldState.construction?.type || '',
      progress: worldState.construction?.progress || 0,
      status: worldState.construction?.status || '',
      existingComponents: worldState.existingComponents || [],
      partialComponents: worldState.partialComponents || [],
      futureComponents: worldState.futureComponents || [],
      components: []
    },
    materials: {
      materials: worldState.materials || [],
      consumedMaterials: worldState.consumedMaterials || [],
      residues: worldState.residues || [],
      tools: worldState.tools || []
    },
    camera: {
      current: worldState.camera ? {
        id: 'A',
        relativePosition: { x: 0, y: 0 },
        orientation: 0,
        conceptualHeight: 'media',
        framing: 'medium',
        allowedMovement: 'FIXA',
        visibleZones: [],
        partiallyVisibleZones: [],
        hiddenZones: []
      } : {
        id: 'A',
        relativePosition: { x: 0, y: 0 },
        orientation: 0,
        conceptualHeight: 'media',
        framing: 'medium',
        allowedMovement: 'FIXA',
        visibleZones: [],
        partiallyVisibleZones: [],
        hiddenZones: []
      }
    },
    character: {
      state: worldState.character || {
        characterId: '',
        currentZone: '',
        orientation: 'frente',
        carriedObjects: [],
        movementRequired: false
      },
      position: { x: 0, y: 0 },
      isMoving: false
    },
    renderStatus: {
      isRendering: false,
      progress: 0,
      currentFrame: 0,
      totalFrames: 0,
      errors: [],
      lastRenderTime: 0
    },
    activeZone: worldState.activeZone || '',
    timestamp: worldState.timestamp || Date.now()
  };
}