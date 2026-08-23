export interface ConstructionStateSnapshot {
  sceneId: string;
  progress: number;
  completedElements: string[];
  activeElements: string[];
  pendingElements: string[];
  materialState: {
    available: string[];
    consumed: string[];
    remaining: string[];
  };
  workerState: {
    position: string;
    action: string;
    tools: string[];
  };
  environmentState: {
    terrain: string;
    weather: string;
    lighting: string;
  };
  createdAt: Date;
}