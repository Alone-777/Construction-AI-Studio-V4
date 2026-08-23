import { Character } from './character';
import { Camera } from './camera';
import { ConstructionComponent, ConstructionRule, DependencyEdge } from './construction';
import { SpatialMap } from './spatial';
import { WorldState } from './world-state';
import { Scene, StoryboardEntry, Operation } from './scene';
import { VisualSceneState, VisualElement, LensConfig, LightingConfig, CameraConfig, SceneMetadata, VisualEnvironment, VisualConstruction, VisualMaterials } from '../visual/VisualSceneState';
import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { ReviewedVisualInterpretation } from '../review/visual-review';
import type { VisualEvaluationRecord } from '../evaluation/visual-evaluation';
import { ConstructionStateSnapshot } from './construction-state';
import { ConstructionTimeline } from './construction-timeline';
import type { SimulationEvent, SimulationResult } from './construction-simulation';
import type { ConstructionDecision } from '../decision';

export type EnvironmentPreset = 'floresta_tropical' | 'floresta_temperada' | 'floresta_umida' | 'pinheiros' | 'clareira' | 'montanha' | 'margem_rio' | 'riacho' | 'vale' | 'area_rochosa' | 'terreno_plano' | 'terreno_inclinado' | 'personalizado';
export type VisualStyle = 'cinematografico' | 'documental' | 'realista' | 'artistico' | 'personalizado';
export type DetailLevel = 'baixo' | 'medio' | 'alto' | 'ultra';

export interface ProjectConfig {
  name: string;
  environment: EnvironmentPreset;
  environmentImage?: string;
  construction: string;
  approximateForm: string;
  materials: string[];
  workerCount: number;
  character: Character;
  tools: string[];
  cameraA: Camera;
  cameraB: Camera;
  visualStyle: VisualStyle;
  totalDuration: number;
  sceneDuration: number;
  detailLevel: DetailLevel;
  visualReferences: string[];
  preserveTerrain: boolean;
}

export interface ProjectDNA {
  id: string;
  config: ProjectConfig;
  environment: EnvironmentPreset;
  finalConstruction: string;
  form: string;
  materials: string[];
  character: Character;
  clothes: string;
  cameras: { a: Camera; b: Camera };
  aesthetics: VisualStyle;
  restrictions: string[];
  permanentObjects: string[];
  rules: ConstructionRule[];
  references: string[];
  forbiddenElements: string[];
}

/**
 * Visual DNA - Camada persistente de configuração visual por projeto
 * Armazena: personagem, ambiente, câmera, materiais, regras de consistência visual
 */
export interface VisualDNA {
  id: string;
  // Personagem visual
  character: {
    id: string;
    name: string;
    appearance: string;
    clothing: string;
    physicalTraits: string[];
    defaultPose: string;
    animationStyle: string;
  };
  // Ambiente visual
  environment: {
    preset: EnvironmentPreset;
    customTerrain?: {
      type: string;
      slope: string;
      vegetation: string;
      soil: string;
    };
    climate: string;
    light: string;
    timeOfDay: SceneMetadata['timeOfDay'];
    weather: SceneMetadata['weather'];
    lightingBase: LightingConfig;
  };
  // Câmera base
  camera: {
    defaultConfig: CameraConfig;
    lensDefaults: LensConfig;
    cameraA: CameraConfig;
    cameraB: CameraConfig;
    movementPreferences: CameraConfig['movement'][];
  };
  // Materiais visuais
  materials: {
    palette: Array<{
      materialId: string;
      displayName: string;
      color: string;
      texture: string;
      roughness: number;
      metallic: number;
    }>;
    defaultQuantities: Record<string, number>;
    residueRules: Array<{
      sourceMaterial: string;
      producesResidue: string;
      quantityRatio: number;
    }>;
  };
  // Regras de consistência visual
  consistencyRules: {
    colorPalette: string[];
    lightingStyle: 'natural' | 'cinematic' | 'stylized' | 'documentary';
    cameraStyle: 'static' | 'dynamic' | 'cinematic';
    depthOfFieldDefault: boolean;
    aspectRatio: number;
    forbiddenVisualElements: string[];
    requiredVisualElements: string[];
    compositionRules: string[];
  };
  // Estilo visual global
  visualStyle: VisualStyle;
  detailLevel: DetailLevel;
  // Referências visuais
  references: Array<{
    type: 'image' | 'video' | 'concept';
    url: string;
    description: string;
    weight: number;
  }>;
  updatedAt: number;
}

/**
 * Visual DNA padrão para inicialização
 */
export const DEFAULT_VISUAL_DNA: VisualDNA = {
  id: '',
  character: {
    id: '',
    name: '',
    appearance: '',
    clothing: '',
    physicalTraits: [],
    defaultPose: 'standing',
    animationStyle: 'realistic',
  },
  environment: {
    preset: 'terreno_plano',
    climate: '',
    light: 'dia',
    timeOfDay: 'day',
    weather: 'clear',
    lightingBase: {
      type: 'natural',
      keyLight: { direction: { x: 1, y: -1 }, intensity: 1, color: '#ffffff', temperature: 5600 },
      fillLight: { direction: { x: -1, y: -0.5 }, intensity: 0.3, color: '#ffffff' },
      ambientLight: { intensity: 0.2, color: '#ffffff' },
      shadows: true,
      shadowSoftness: 0.5,
    },
  },
  camera: {
    defaultConfig: {
      position: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      up: { x: 0, y: -1 },
      fov: 60,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      movement: 'FIXA',
    },
    lensDefaults: {
      focalLength: 35,
      aperture: 'f/2.8',
      focusDistance: 10,
      depthOfField: false,
    },
    cameraA: {
      position: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      up: { x: 0, y: -1 },
      fov: 60,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      movement: 'FIXA',
    },
    cameraB: {
      position: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      up: { x: 0, y: -1 },
      fov: 60,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      movement: 'FIXA',
    },
    movementPreferences: ['FIXA', 'FOLLOW', 'PAN'],
  },
  materials: {
    palette: [],
    defaultQuantities: {},
    residueRules: [],
  },
  consistencyRules: {
    colorPalette: [],
    lightingStyle: 'natural',
    cameraStyle: 'static',
    depthOfFieldDefault: false,
    aspectRatio: 16 / 9,
    forbiddenVisualElements: [],
    requiredVisualElements: [],
    compositionRules: [],
  },
  visualStyle: 'cinematografico',
  detailLevel: 'medio',
  references: [],
  updatedAt: Date.now(),
};

export interface DependencyGraph {
  nodes: ConstructionComponent[];
  edges: DependencyEdge[];
}

export interface Project {
  id: string;
  name: string;
  dna: ProjectDNA;
  visualDNA: VisualDNA;
  constructionState: ConstructionStateSnapshot;
  worldState: WorldState;
  spatialMap: SpatialMap;
  dependencyGraph: DependencyGraph;
  operations: Operation[];
  scenes: Scene[];
  storyboard: StoryboardEntry[];
  timeline: ConstructionTimeline;
  simulation?: {
    lastOperationId: string;
    lastResult: SimulationResult;
    lastEvents: SimulationEvent[];
    currentOperationId: string | null;
    pendingOperations: string[];
    completedOperations: string[];
    failedOperations: string[];
  };
  decision?: ConstructionDecision;
  planning?: {
    source: 'description' | 'visual' | 'demo' | 'manual';
    sourceDescription?: string;
    blueprintId: string;
    providerId?: string;
    interpretation: string[];
    assumptions: string[];
  };
  visualReconstruction?: {
    referenceImage: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    };
    /** Compatibilidade: interpretação efetiva usada pelo orquestrador. */
    analysis: NormalizedVisualAnalysis;
    /** Resposta validada do provider, preservada sem edição. */
    providerOriginal?: NormalizedVisualAnalysis;
    /** Revisão humana separada, com valor original, atual e proveniência. */
    reviewedInterpretation?: ReviewedVisualInterpretation;
    operationEvidence: Record<string, NonNullable<Operation['visualBasis']>>;
    providerModel?: string;
    evaluation?: VisualEvaluationRecord;
  };
  createdAt: number;
  updatedAt: number;
  status: 'setup' | 'planning' | 'active' | 'complete';
}
