import { ErrorCode, ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

export class TemporalFiscal implements FiscalInspector {
  id = 'temporal-fiscal';
  name = 'Inspetor Temporal';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage } = context;

    // Check for overloaded scenes
    if (scene.stages.length > 5) {
      errors.push({
        code: ErrorCode.E_TM01,
        severity: ErrorSeverity.WARNING,
        message: `A cena tem muitos estágios, o que pode causar sobrecarga temporal.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // Check duration logic
    if (scene.duration <= 0) {
      errors.push({
        code: 'E_TM02',
        severity: ErrorSeverity.ERROR,
        message: `Duração da cena inválida.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    return errors;
  }
}
