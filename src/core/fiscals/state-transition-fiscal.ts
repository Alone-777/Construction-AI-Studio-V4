import { ErrorSeverity, type ValidationError } from '../types';
import type { FiscalContext, FiscalInspector } from './types';

export class StateTransitionFiscal implements FiscalInspector {
  id = 'state-transition-fiscal';
  name = 'Inspetor de Transição do World State';

  inspect(context: FiscalContext): ValidationError[] {
    const { scene, stage, worldStateBefore: before, worldStateAfter: after } = context;
    const errors: ValidationError[] = [];
    if (after.timestamp < before.timestamp) {
      errors.push({
        code: 'E-WS02', severity: ErrorSeverity.ERROR,
        message: `Timestamp regrediu de ${before.timestamp} para ${after.timestamp}.`,
        sceneId: scene.id, stageId: String(stage.percentage),
      });
    }
    if (after.construction.progress < before.construction.progress) {
      errors.push({
        code: 'E-WS03', severity: ErrorSeverity.ERROR,
        message: `Progresso global regrediu de ${before.construction.progress}% para ${after.construction.progress}%.`,
        sceneId: scene.id, stageId: String(stage.percentage),
      });
    }
    if (after.activeZone !== stage.activeZone || after.character.currentZone !== stage.activeZone) {
      errors.push({
        code: 'E-WS04', severity: ErrorSeverity.ERROR,
        message: `World State/personagem não convergem para a zona ativa ${stage.activeZone}.`,
        sceneId: scene.id, stageId: String(stage.percentage),
      });
    }
    const disappeared = before.existingComponents.filter(component => !after.existingComponents.includes(component));
    if (disappeared.length > 0) {
      errors.push({
        code: 'E-WS05', severity: ErrorSeverity.ERROR,
        message: `Componentes existentes desapareceram sem operação de remoção: ${disappeared.join(', ')}.`,
        sceneId: scene.id, stageId: String(stage.percentage),
      });
    }
    return errors;
  }
}
