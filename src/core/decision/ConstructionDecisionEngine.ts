import { ConstructionDecision, DecisionContext, OperationDependency } from './ConstructionDecision';

export class ConstructionDecisionEngine {
  decide(context: DecisionContext): ConstructionDecision {
    const { constructionState, availableOperations, inventory, dependencies } = context;

    // Filter out completed operations
    const pendingOperations = availableOperations.filter(op =>
      !op.elements.every(el => constructionState.completedElements.includes(el))
    );

    // Check each pending operation
    for (const operation of pendingOperations) {
      // Check dependencies
      if (!this.dependenciesMet(operation, dependencies, constructionState.completedElements, availableOperations)) {
        continue;
      }

      // Check materials
      const materialCheck = this.checkMaterials(operation, inventory.materials);
      if (!materialCheck.available) {
        return {
          action: 'REQUEST_MATERIAL',
          operationId: operation.id,
          reason: `Materiais insuficientes: ${materialCheck.missing.join(', ')}`,
          confidence: 0.9,
        };
      }

      // Check tools
      const toolCheck = this.checkTools(operation, inventory.tools);
      if (!toolCheck.available) {
        return {
          action: 'BLOCKED',
          operationId: operation.id,
          reason: `Ferramentas necessárias não disponíveis: ${toolCheck.missing.join(', ')}`,
          confidence: 0.8,
        };
      }

      // All checks passed - can execute
      return {
        action: 'EXECUTE_OPERATION',
        operationId: operation.id,
        reason: `Operação ${operation.name} pronta para execução`,
        confidence: 0.95,
      };
    }

    // No operations available
    return {
      action: 'WAIT',
      reason: 'Nenhuma operação disponível no momento',
      confidence: 0.5,
    };
  }

  private dependenciesMet(
    operation: { id: string; elements: string[] },
    dependencies: OperationDependency[],
    completedElements: string[],
    availableOperations: Array<{ id: string; elements: string[] }>
  ): boolean {
    const dep = dependencies.find(d => d.operationId === operation.id);
    if (!dep) return true;

    // Check if all dependency operations have their elements completed
    return dep.dependsOn.every(depOpId => {
      const depOperation = availableOperations.find(op => op.id === depOpId);
      if (!depOperation) return false;
      return depOperation.elements.every(el => completedElements.includes(el));
    });
  }

  private checkMaterials(
    operation: { visualBasis?: { materials?: string[] } },
    inventory: Record<string, number>
  ): { available: boolean; missing: string[] } {
    const required = operation.visualBasis?.materials || [];
    const missing: string[] = [];

    for (const material of required) {
      const quantity = inventory[material] || 0;
      if (quantity <= 0) {
        missing.push(material);
      }
    }

    return {
      available: missing.length === 0,
      missing,
    };
  }

  private checkTools(
    operation: { visualBasis?: { tools?: string[] } },
    inventory: string[]
  ): { available: boolean; missing: string[] } {
    const required = operation.visualBasis?.tools || [];
    const missing = required.filter(tool => !inventory.includes(tool));

    return {
      available: missing.length === 0,
      missing,
    };
  }
}

export function createDecisionEngine(): ConstructionDecisionEngine {
  return new ConstructionDecisionEngine();
}