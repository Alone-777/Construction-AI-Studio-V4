import { MaterialInstance, ToolInstance, Residue } from './materials';
import { CharacterState } from './character';

/**
 * Estado Global do Mundo (World State)
 */
export interface WorldState {
  terrain: {
    type: string;
    slope: string;
    vegetation: string;
    soil: string;
  };
  construction: {
    type: string;
    progress: number;
    status: string;
  };
  existingComponents: string[];
  partialComponents: string[];
  futureComponents: string[];
  materials: MaterialInstance[];
  consumedMaterials: MaterialInstance[];
  residues: Residue[];
  tools: ToolInstance[];
  character: CharacterState;
  activeZone: string;
  climate: string;
  light: string;
  vegetation: Record<string, string>; // zoneId -> state
  camera: string;
  temporaryObjects: string[];
  permanentObjects: string[];
  timestamp: number;
}

/**
 * Transformação atômica que ocorreu no mundo.
 */
export interface Transformation {
  id: string;
  sceneId: string;
  stageId: string;
  logicalTimestamp: number;
  zone: string;
  actor: string;
  tool?: string;
  material?: string;
  before: Record<string, any>;
  action: string;
  after: Record<string, any>;
  evidence: string[];
  consumption: string[];
  movement: string[];
}

export type TransformationLog = Transformation[];

/**
 * Evidência e prova de execução de uma tarefa.
 */
export interface ExecutionProof {
  characterArrived: boolean;
  actionStarted: boolean;
  materialManipulated: boolean;
  changeOccurred: boolean;
  finalStateVisible: boolean;
  valid: boolean;
}
