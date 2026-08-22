import { ErrorCode, ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

export class DependencyFiscal implements FiscalInspector {
  id = 'dependency-fiscal';
  name = 'Inspetor de Dependências';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { stage, dependencyGraph, worldStateAfter } = context;
    const componentId = stage.component;

    if (!componentId) return errors;

    const node = dependencyGraph.nodes.find(n => n.id === componentId);
    if (!node) return errors;

    // Check all dependencies are COMPLETE
    for (const depId of node.dependencies) {
      const depNode = dependencyGraph.nodes.find(n => n.id === depId);
      if (depNode && depNode.status !== 'COMPLETE') {
        errors.push({
          code: ErrorCode.E_DP01,
          severity: ErrorSeverity.ERROR,
          message: `Dependência '${depNode.name}' não está completa para construir '${node.name}'.`,
          sceneId: context.scene.id,
          stageId: context.stage.percentage.toString(),
          details: { componentId, depId }
        });
      }
    }

    // Check if operation is BLOCKED
    if (node.status === 'BLOCKED') {
      errors.push({
        code: ErrorCode.E_DP01,
        severity: ErrorSeverity.ERROR,
        message: `Componente '${node.name}' está bloqueado.`,
        sceneId: context.scene.id,
        stageId: context.stage.percentage.toString(),
        details: { componentId }
      });
    }

    return errors;
  }
}
