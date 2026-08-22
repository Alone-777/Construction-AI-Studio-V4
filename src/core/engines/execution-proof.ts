import { ExecutionProof, Stage, ValidationError, ErrorCode, ErrorSeverity } from '../types';

export function generateExecutionProof(stage: Stage): ExecutionProof {
  const isBaseline = stage.percentage === 0;
  const arrived = !!stage.displacement || !!stage.characterPosition;
  const actionStarted = !!stage.physicalAction;
  const manipulated = !isBaseline && (!!stage.tool || !!stage.component);
  const change = !isBaseline && stage.visualEvidence && stage.visualEvidence.length > 0;
  
  return {
    characterArrived: arrived,
    actionStarted,
    materialManipulated: manipulated,
    changeOccurred: change,
    finalStateVisible: true,
    valid: isBaseline
      ? arrived && actionStarted
      : arrived && actionStarted && manipulated && change
  };
}

export function validateExecutionProof(proof: ExecutionProof): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!proof.valid) {
    let detail = '';
    if (!proof.characterArrived) detail = 'Personagem não chegou ao local.';
    else if (!proof.actionStarted) detail = 'Ação física não iniciada.';
    else if (!proof.materialManipulated) detail = 'Nenhum item manipulado.';
    else if (!proof.changeOccurred) detail = 'Sem mudança visível.';

    errors.push({
      code: ErrorCode.E_EX01,
      severity: ErrorSeverity.ERROR,
      message: `Prova de execução insuficiente: ${detail}`
    });
  }

  return errors;
}
