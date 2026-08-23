import { ConstructionStateSnapshot } from './construction-state';

export interface SimulationEvent {
  id: string;
  operationId: string;
  timestamp: Date;
  type: 'START' | 'PROGRESS' | 'MATERIAL_USED' | 'ELEMENT_CREATED' | 'ELEMENT_COMPLETED' | 'TOOL_VALIDATION';
  payload: {
    operationName?: string;
    zones?: string[];
    elements?: string[];
    type?: string;
    tool?: string;
    available?: boolean;
    success?: boolean;
    consumed?: Record<string, number>;
    missing?: string[];
    error?: string;
    progress?: number;
    stage?: string;
    status?: string;
    [key: string]: unknown;
  };
}

export interface SimulationResult {
  success: boolean;
  state: ConstructionStateSnapshot;
  events: SimulationEvent[];
  timelineFrameId: string;
}