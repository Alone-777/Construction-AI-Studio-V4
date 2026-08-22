import { ErrorCode, ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';
import { checkAccessibility } from '../engines/spatial-map';

export class SpatialFiscal implements FiscalInspector {
  id = 'spatial-fiscal';
  name = 'Inspetor Espacial';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage, character, spatialMap, worldStateBefore, worldStateAfter } = context;

    // E_SP01 / E_SP02: Character location vs active zone
    if (character.currentZone !== stage.activeZone) {
      errors.push({
        code: ErrorCode.E_SP01,
        severity: ErrorSeverity.ERROR,
        message: `Personagem está na zona '${character.currentZone}', mas a zona ativa é '${stage.activeZone}'.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // E_SP03: Future components appearing prematurely
    const premature = worldStateAfter.existingComponents.filter(c =>
      worldStateBefore.futureComponents.includes(c) && stage.component !== c
    );
    if (premature.length > 0) {
      errors.push({
        code: ErrorCode.E_SP03,
        severity: ErrorSeverity.ERROR,
        message: `Componentes futuros apareceram antes do tempo: ${premature.join(', ')}`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // E_SP04: Displacement needed but missing
    if (character.movementRequired && !stage.displacement) {
      errors.push({
        code: ErrorCode.E_SP04,
        severity: ErrorSeverity.ERROR,
        message: `Deslocamento necessário, mas não definido no stage.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // E_SP08: a rota pode conter zonas intermediárias, mas deve ser acessível.
    if (stage.displacement) {
      const accessibility = checkAccessibility(
        spatialMap,
        stage.displacement.from,
        stage.displacement.to,
      );
      if (!accessibility.accessible) {
        errors.push({
          code: ErrorCode.E_SP08,
          severity: ErrorSeverity.ERROR,
          message: `Não existe rota acessível entre ${stage.displacement.from} e ${stage.displacement.to}.`,
          sceneId: scene.id,
          stageId: stage.percentage.toString(),
        });
      }
    }

    return errors;
  }
}
