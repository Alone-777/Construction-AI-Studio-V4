import { ErrorSeverity, type ValidationError } from '../types';
import { analyzeTopology } from '../engines/topology';
import type { FiscalContext, FiscalInspector } from './types';

export class TopologyFiscal implements FiscalInspector {
  id = 'topology-fiscal';
  name = 'Inspetor de Topologia e Estado Físico';

  inspect(context: FiscalContext): ValidationError[] {
    const operation = context.operation;
    if (!operation?.elements?.length || !operation.zones?.length) return [];

    const errors: ValidationError[] = [];
    const expected = analyzeTopology(operation.elements, operation.type, operation.zones);
    if (operation.topology !== expected.recommendedType) {
      errors.push({
        code: 'E-TP01',
        severity: ErrorSeverity.ERROR,
        message: `Topologia ${operation.topology} diverge da análise ${expected.recommendedType}: ${expected.reasoning}`,
        sceneId: context.scene.id,
        stageId: String(context.stage.percentage),
      });
    }
    if (!operation.zones.includes(context.stage.activeZone)) {
      errors.push({
        code: 'E-TP02',
        severity: ErrorSeverity.ERROR,
        message: `Zona ativa ${context.stage.activeZone} não pertence às zonas da operação.`,
        sceneId: context.scene.id,
        stageId: String(context.stage.percentage),
      });
    }
    const unexpected = context.stage.allowedChanges.filter(element => !operation.elements?.includes(element));
    if (unexpected.length > 0) {
      errors.push({
        code: 'E-TP03',
        severity: ErrorSeverity.ERROR,
        message: `Mudanças fora da topologia declarada: ${unexpected.join(', ')}.`,
        sceneId: context.scene.id,
        stageId: String(context.stage.percentage),
      });
    }
    const physical = context.stage.physicalState;
    if (!physical || operation.elements.some(element => physical.elementProgress[element] === undefined)) {
      errors.push({
        code: 'E-TP04',
        severity: ErrorSeverity.ERROR,
        message: 'Estado físico absoluto incompleto para os elementos da operação.',
        sceneId: context.scene.id,
        stageId: String(context.stage.percentage),
      });
    }
    return errors;
  }
}
