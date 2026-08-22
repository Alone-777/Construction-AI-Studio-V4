import { ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

export class CharacterFiscal implements FiscalInspector {
  id = 'character-fiscal';
  name = 'Inspetor de Personagem';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage, character, worldStateBefore, worldStateAfter, projectDNA } = context;

    if (worldStateBefore.character.characterId !== worldStateAfter.character.characterId) {
      errors.push({
        code: 'E_CH01',
        severity: ErrorSeverity.ERROR,
        message: `Identidade do personagem alterada no stage. Esperado ${worldStateBefore.character.characterId}.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    if (stage.tool && character.currentTool !== stage.tool) {
      errors.push({
        code: 'E_CH02',
        severity: ErrorSeverity.WARNING,
        message: `Ferramenta em uso incompatível com a ação do stage.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    return errors;
  }
}
