import { Character } from './character';
import { Camera } from './camera';
import { ConstructionComponent, ConstructionRule, DependencyEdge } from './construction';
import { SpatialMap } from './spatial';
import { WorldState } from './world-state';
import { Scene, StoryboardEntry, Operation } from './scene';
import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { ReviewedVisualInterpretation } from '../review/visual-review';
import type { VisualEvaluationRecord } from '../evaluation/visual-evaluation';

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

export interface DependencyGraph {
  nodes: ConstructionComponent[];
  edges: DependencyEdge[];
}

export interface Project {
  id: string;
  name: string;
  dna: ProjectDNA;
  worldState: WorldState;
  spatialMap: SpatialMap;
  dependencyGraph: DependencyGraph;
  operations: Operation[];
  scenes: Scene[];
  storyboard: StoryboardEntry[];
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
