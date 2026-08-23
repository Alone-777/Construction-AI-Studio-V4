export interface ConstructionDecision {
  action: 'EXECUTE_OPERATION' | 'WAIT' | 'REQUEST_MATERIAL' | 'BLOCKED';
  operationId?: string;
  reason: string;
  confidence: number;
}

export interface OperationDependency {
  operationId: string;
  dependsOn: string[];
}

export interface DecisionContext {
  constructionState: {
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
  };
  availableOperations: Array<{
    id: string;
    name: string;
    elements: string[];
    zones: string[];
    visualBasis?: {
      materials?: string[];
      tools?: string[];
    };
  }>;
  inventory: {
    materials: Record<string, number>;
    tools: string[];
  };
  dependencies: OperationDependency[];
}