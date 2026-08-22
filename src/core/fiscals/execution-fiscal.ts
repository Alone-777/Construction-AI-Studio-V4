import { ErrorSeverity, ValidationError } from '../types';
import { generateExecutionProof, validateExecutionProof } from '../engines/execution-proof';
import { FiscalContext, FiscalInspector } from './types';

export class ExecutionFiscal implements FiscalInspector {
  id = 'execution-fiscal';
  name = 'Inspetor de Prova de Execução';

  inspect(context: FiscalContext): ValidationError[] {
    // O estágio 0% é a referência causal, não uma transformação física.
    if (context.stage.percentage === 0) return [];
    const proof = context.stage.executionProof ?? generateExecutionProof(context.stage);
    return validateExecutionProof(proof).map(error => ({
      ...error,
      severity: ErrorSeverity.ERROR,
      sceneId: context.scene.id,
      stageId: context.stage.percentage.toString(),
    }));
  }
}
