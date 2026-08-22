// This file exports the types needed by fiscals and prompts so they don't break.
export interface Scene {
  id?: string;
  type?: string;
  duration?: number;
  actionZone?: string;
  affectedZones?: string[];
  action?: string;
  expectedResult?: string;
  allowedChanges?: string[];
  requiresDisplacement?: boolean;
  expectedWorkers?: number;
  characters?: CharacterState[];
  camera?: {
    position: string;
    framing: string;
    movement: string;
  };
  transition?: boolean;
  requires360?: boolean;
  events?: any[];
}

export interface Stage {
  id?: string;
  materials?: string[];
}

export interface WorldState {
  stageId?: string;
  materials: string[];
  residues: string[];
  elements: any[];
  progression: number;
  description?: string;
}

export interface Transformation {
  zone: string;
  targetId: string;
  addsMaterials?: boolean;
  removesResidues?: boolean;
}

export interface SpatialMap {
  zones: Record<string, { status: string }>;
}

export interface DependencyGraph {
  nodes: { id: string; name?: string; status: string }[];
  edges: { source: string; target: string }[];
}

export interface CharacterState {
  name: string;
  appearance: string;
  clothes: string;
  accessories?: string[];
  position: { zone: string };
  tool?: string;
}

export interface ProjectDNA {
  environment: string;
  style: string;
}

export interface ValidationError {
  id: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  category: string;
  suggestion?: string;
  status?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface QualityScore {
  technical: number;
  visual: number;
  temporal: number;
  overall: number;
}

export interface JumpRisk {
  level: 'low' | 'medium' | 'high';
  score: number;
  suggestion?: string;
}
