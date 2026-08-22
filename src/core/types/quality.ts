import { ZoneType } from './spatial';

export interface QualityScore {
  continuity: number; // 0-100
  causality: number; // 0-100
  progression: number; // 0-100
  space: number; // 0-100
  rhythm: number; // 0-100
  clarity: number; // 0-100
  camera: number; // 0-100
  jumpRisk: number; // 0-100
  overall: number; // 0-100
}

export type FeedbackType = 
  | 'salto' 
  | 'personagem_mudou' 
  | 'camera_mudou' 
  | 'obra_apareceu' 
  | 'material_surgiu' 
  | 'acao_pouco_clara' 
  | 'progresso_insuficiente' 
  | 'progresso_excessivo' 
  | 'outro';

export interface SceneFeedback {
  sceneId: string;
  approved: boolean;
  reasons: FeedbackType[];
  notes?: string;
  timestamp: number;
}

export interface ApprovedPattern {
  id: string;
  operationId: string;
  topology: ZoneType;
  duration: number;
  promptText: string;
  feedback: SceneFeedback;
  reusable: boolean;
}

export interface Suggestion {
  id: string;
  type: 'duration' | 'camera' | 'split' | 'merge' | 'route' | 'dependency' | 'material' | 'tool' | 'density';
  message: string;
  autoApplicable: boolean;
  affectedSceneIds: string[];
}
