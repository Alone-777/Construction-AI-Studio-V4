import { ErrorSeverity, type ValidationError } from '../types';
import type { FiscalContext, FiscalInspector } from './types';

/** Mantém explícita a fronteira entre pixel visível e sequência construtiva inferida. */
export class VisualSourceFiscal implements FiscalInspector {
  id = 'visual-source-fiscal';
  name = 'Inspetor de Origem Visual';

  inspect(context: FiscalContext): ValidationError[] {
    const basis = context.operation?.visualBasis;
    if (!basis) return [];
    const location = {
      sceneId: context.scene.id,
      stageId: String(context.stage.percentage),
      details: {
        sourceField: basis.sourceField,
        sourceClassification: basis.sourceClassification,
        sourceOrigin: basis.sourceOrigin ?? 'PROVIDER',
        editedByUser: basis.editedByUser ?? false,
        humanConfirmed: basis.humanConfirmed ?? false,
      },
    };
    if (basis.humanConfirmed) {
      return [{
        code: 'V-SRC04',
        severity: ErrorSeverity.INFO,
        message: `Informação ${basis.sourceClassification} confirmada pelo usuário para ${basis.sourceField}: ${basis.evidence}`,
        ...location,
      }];
    }
    if (basis.sourceOrigin === 'USER_EDITED' || basis.editedByUser) {
      return [{
        code: 'V-SRC03',
        severity: ErrorSeverity.WARNING,
        message: `Informação editada pelo usuário, ainda não confirmada, sustenta ${context.operation?.name}: ${basis.evidence}`,
        ...location,
      }];
    }
    if (basis.sourceClassification === 'FACT') {
      return [{
        code: 'V-SRC00',
        severity: ErrorSeverity.INFO,
        message: `Operação rastreada a FACT do provider em ${basis.sourceField}: ${basis.evidence}`,
        ...location,
      }];
    }
    if (basis.sourceClassification === 'UNKNOWN') {
      return [{
        code: 'V-SRC02',
        severity: ErrorSeverity.WARNING,
        message: `${basis.sourceField} não é visível na imagem. ${context.operation?.name} foi inferida como hipótese construtiva: ${basis.evidence}`,
        ...location,
      }];
    }
    return [{
      code: 'V-SRC01',
      severity: ErrorSeverity.WARNING,
      message: `Operação derivada de HYPOTHESIS não confirmada do provider em ${basis.sourceField}: ${basis.evidence}`,
      ...location,
    }];
  }
}
