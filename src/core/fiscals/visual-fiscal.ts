import { ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

export class VisualFiscal implements FiscalInspector {
  id = 'visual-fiscal';
  name = 'Inspetor Visual';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage } = context;

    // Manual checklist items for visual review
    errors.push({
      code: 'V_INFO01',
      severity: ErrorSeverity.INFO,
      message: `Revisão visual manual: Verifique se a iluminação condiz com as texturas de ${stage.activeZone}.`,
      sceneId: scene.id,
      stageId: stage.percentage.toString(),
    });

    errors.push({
      code: 'V_INFO02',
      severity: ErrorSeverity.INFO,
      message: `Revisão visual manual: Confirmar se evidências visuais [${stage.visualEvidence.join(', ')}] estão nítidas.`,
      sceneId: scene.id,
      stageId: stage.percentage.toString(),
    });

    return errors;
  }
}
