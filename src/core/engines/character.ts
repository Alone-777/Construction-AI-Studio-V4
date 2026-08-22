import { CharacterState, Orientation, SpatialMap, ValidationError, ErrorCode, ErrorSeverity } from '../types';
import { checkAccessibility } from './spatial-map';

export function createCharacterState(characterId: string, startZone: string, orientation: Orientation): CharacterState {
  return {
    characterId,
    currentZone: startZone,
    orientation,
    carriedObjects: [],
    movementRequired: false
  };
}

export function moveCharacter(state: CharacterState, targetZone: string, spatialMap: SpatialMap): { newState: CharacterState, route: string[], error?: ValidationError } {
  const result = checkAccessibility(spatialMap, state.currentZone, targetZone);
  
  if (!result.accessible) {
    return {
      newState: state,
      route: [],
      error: {
        code: ErrorCode.E_SP08,
        severity: ErrorSeverity.ERROR,
        message: `Teleporte/Bloqueio da zona ${state.currentZone} para ${targetZone}.`
      }
    };
  }

  const newState: CharacterState = {
    ...state,
    previousZone: state.currentZone,
    currentZone: targetZone,
    movementRequired: result.route.length > 1
  };

  return { newState, route: result.route };
}

export function changeTool(state: CharacterState, newTool: string | undefined): { newState: CharacterState, error?: ValidationError } {
  let error: ValidationError | undefined;
  
  if (state.currentTool && newTool) {
    error = {
      code: ErrorCode.E_TL01,
      severity: ErrorSeverity.WARNING,
      message: `Mudança de ferramenta de ${state.currentTool} para ${newTool} sem transição.`
    };
  }

  return {
    newState: { ...state, currentTool: newTool },
    error
  };
}

export function validateCharacterPosition(state: CharacterState, map: SpatialMap): ValidationError[] {
  const errors: ValidationError[] = [];
  const zoneExists = map.zones.some(z => z.id === state.currentZone);
  
  if (!zoneExists) {
    errors.push({
      code: ErrorCode.E_SP02,
      severity: ErrorSeverity.ERROR,
      message: `Personagem em zona inválida: ${state.currentZone}`
    });
  }
  
  return errors;
}

export function validateCharacterConsistency(state: CharacterState): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (state.carriedObjects.length > 2) {
    errors.push({
      code: ErrorCode.E_EX01,
      severity: ErrorSeverity.WARNING,
      message: 'Personagem carregando excesso de objetos.'
    });
  }
  
  return errors;
}
