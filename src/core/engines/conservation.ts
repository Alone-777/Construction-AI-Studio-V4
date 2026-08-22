import { WorldState, ValidationError, ErrorCode, ErrorSeverity } from '../types';

export interface ConservationAllowance {
  appearedComponents?: string[];
  disappearedComponents?: string[];
}

export function validateConservation(
  prevState: WorldState,
  currState: WorldState,
  allowance: ConservationAllowance = {},
): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateNoGhostAppearance(prevState, currState, allowance.appearedComponents));
  errors.push(...validateNoGhostDisappearance(prevState, currState, allowance.disappearedComponents));
  errors.push(...validateToolContinuity(prevState, currState));
  return errors;
}

export function trackMaterialOrigin(state: WorldState, materialId: string): string | undefined {
  const mat = state.materials.find(m => m.materialId === materialId);
  return mat ? mat.origin : undefined;
}

export function trackResidues(state: WorldState): number {
  return state.residues.filter(r => r.status === 'presente').length;
}

export function trackTools(state: WorldState): string[] {
  return state.tools.map(t => t.toolId);
}

export function validateNoGhostAppearance(
  prev: WorldState,
  curr: WorldState,
  allowedComponents: string[] = [],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prevComps = new Set(prev.existingComponents);
  curr.existingComponents.forEach(c => {
    if (!prevComps.has(c) && !allowedComponents.includes(c)) {
      errors.push({
        code: ErrorCode.E_MT01,
        severity: ErrorSeverity.WARNING,
        message: `Aparição fantasma do componente ${c}.`
      });
    }
  });
  return errors;
}

export function validateNoGhostDisappearance(
  prev: WorldState,
  curr: WorldState,
  allowedComponents: string[] = [],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const currComps = new Set(curr.existingComponents);
  prev.existingComponents.forEach(c => {
    if (!currComps.has(c) && !allowedComponents.includes(c)) {
      errors.push({
        code: ErrorCode.E_WR01,
        severity: ErrorSeverity.ERROR,
        message: `Desaparecimento do componente ${c}.`
      });
    }
  });
  return errors;
}

export function validateToolContinuity(prev: WorldState, curr: WorldState): ValidationError[] {
  const errors: ValidationError[] = [];
  const prevTool = prev.character.currentTool;
  const currTool = curr.character.currentTool;

  if (prevTool && !currTool) {
    const toolInstance = curr.tools.find(t => t.toolId === prevTool);
    if (!toolInstance || toolInstance.status === 'indisponivel') {
      errors.push({
        code: ErrorCode.E_TL01,
        severity: ErrorSeverity.ERROR,
        message: `Ferramenta ${prevTool} sumiu sem registro de armazenamento.`
      });
    }
  }
  return errors;
}
