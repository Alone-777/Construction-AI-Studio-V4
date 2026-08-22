import { ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

const EXPECTED_STAGES = [0, 25, 50, 75, 100];

export class ProgressionFiscal implements FiscalInspector {
  id = 'progression-fiscal';
  name = 'Inspetor de Progressão';

  inspect(context: FiscalContext): ValidationError[] {
    const actual = context.scene.stages.map(stage => stage.percentage);
    if (actual.length === EXPECTED_STAGES.length &&
        actual.every((percentage, index) => percentage === EXPECTED_STAGES[index])) {
      return [];
    }

    return [{
      code: 'E-PR01',
      severity: ErrorSeverity.ERROR,
      message: `Progressão inválida: esperado 0/25/50/75/100, recebido ${actual.join('/')}.`,
      sceneId: context.scene.id,
      stageId: context.stage.percentage.toString(),
    }];
  }
}
