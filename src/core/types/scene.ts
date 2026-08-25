import { ZoneType } from './spatial';
import { ValidationError } from './errors';
import type { WorldState, ExecutionProof } from './world-state';
import type { QualityScore } from './quality';
import type { ConstructionDecision } from '../decision/ConstructionDecision';

export type StagePercentage = 0 | 25 | 50 | 75 | 100;
export type JumpRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FiscalCheck {
  ruleId: string;
  rule: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  explanation: string;
}

export interface ValidationResult {
  dependencies: boolean;
  temporal: boolean;
  spatial: boolean;
  causality: boolean;
  conservation: boolean;
  character: boolean;
  tools: boolean;
  visibility: boolean;
  progression: boolean;
  approved: boolean;
  errors: ValidationError[];
  checks?: FiscalCheck[];
}

export interface Stage {
  percentage: StagePercentage;
  initialState: Record<string, any>;
  characterPosition: string; // zoneId
  displacement?: { from: string; to: string };
  activeZone: string;
  physicalAction: string;
  tool?: string;
  component?: string;
  allowedChanges: string[];
  finalState: Record<string, any>;
  visualEvidence: string[];
  preservedZones: string[];
  futureElements: string[];
  /** Estado físico absoluto dos elementos deste mesmo trabalho em cada marco. */
  physicalState?: {
    elementProgress: Record<string, StagePercentage>;
    completedElements: string[];
    partialElements: string[];
  };
  cameraId: string;
  validations: ValidationResult;
  /** Rota espacial efetivamente calculada para o personagem neste estágio. */
  workRoute?: string[];
  /** Snapshots persistidos para auditoria, simulação e geração de prompts. */
  worldStateBefore?: WorldState;
  worldStateAfter?: WorldState;
  /** Prova causal produzida pelo Execution Proof Engine. */
  executionProof?: ExecutionProof;
  qualityScore?: QualityScore;
  jumpRisk?: JumpRisk;
  /** Artefatos derivados do estágio real, nunca texto de demonstração isolado. */
  prompts?: {visual: string;
    nanoBanana: string;
    kling: string;
  };
  /** Status do estágio após fiscalização: 'approved' | 'rejected' | undefined */
  status?: 'approved' | 'rejected';
  /** Decisão temporal calculada após fiscalização deste estágio */
  decision?: ConstructionDecision;
}

export interface TimelineEvent {
  id: string;
  time: string; // T0..Tn
  description: string;
  type: 'state' | 'displacement' | 'preparation' | 'action' | 'transformation' | 'result';
}

export interface Scene {
  id: string;
  number: number;
  timecodeStart: number;
  timecodeEnd: number;
  duration: number;
  operationId: string;
  stages: Stage[];
  camera: string;
  activeZones: string[];
  characterId: string;
  status: 'draft' | 'validated' | 'approved' | 'locked';
  riskLevel: JumpRisk;
  microTimeline: TimelineEvent[];
}

export interface StoryboardEntry {
  sceneId: string;
  thumbnail?: string;
  description: string;
  locked: boolean;
  imageAttached: boolean;
}

export interface Operation {
  id: string;
  name: string;
  type: string;
  componentId?: string;
  elements?: string[];
  zones?: string[];
  visualBasis?: {
    classification: 'FACT' | 'HYPOTHESIS';
    sourceClassification: 'FACT' | 'HYPOTHESIS' | 'UNKNOWN';
    sourceField: string;
    evidence: string;
    sourceOrigin?: 'PROVIDER' | 'USER_EDITED' | 'USER_CONFIRMED';
    editedByUser?: boolean;
    humanConfirmed?: boolean;
    sourceChangedAt?: string;
    /** Materiais necessários para esta operação (opcional, vindo do blueprint) */
    materials?: string[];
    /** Ferramentas necessárias para esta operação (opcional, vindo do blueprint) */
    tools?: string[];
  };
  stages: StagePercentage[];
  topology: ZoneType;
  estimatedDuration: number;
  scenes: string[];
}
