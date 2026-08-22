import { ErrorCode, ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';
import { validateConservation } from '../engines/conservation';

/**
 * Fiscal de Conservação — NADA APARECE, SOME OU MUDA SEM MOTIVO.
 */
export class ConservationFiscal implements FiscalInspector {
  id = 'conservation-fiscal';
  name = 'Inspetor de Conservação';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage, worldStateBefore, worldStateAfter } = context;

    const allowedAppearances = stage.component ? [stage.component] : [];
    errors.push(...validateConservation(worldStateBefore, worldStateAfter, {
      appearedComponents: allowedAppearances,
    }).map(error => ({
      ...error,
      sceneId: scene.id,
      stageId: stage.percentage.toString(),
    })));

    // E_MT01: Materiais apareceram sem origem rastreável
    // MaterialInstance usa materialId+location como chave, não tem campo .id
    const beforeMaterialKeys = new Set(
      worldStateBefore.materials.map(m => `${m.materialId}@${m.location}`)
    );
    const newMaterials = worldStateAfter.materials.filter(
      m => !beforeMaterialKeys.has(`${m.materialId}@${m.location}`)
    );
    const materialsWithoutOrigin = newMaterials.filter(material => !material.origin.trim());
    if (materialsWithoutOrigin.length > 0) {
      errors.push({
        code: ErrorCode.E_MT01,
        severity: ErrorSeverity.WARNING,
        message: `Materiais apareceram sem origem: ${materialsWithoutOrigin.map(m => m.materialId).join(', ')}`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // E_WR01: Resíduos desapareceram sem ação
    const afterResidueIds = new Set(worldStateAfter.residues.map(r => r.id));
    const missingResidues = worldStateBefore.residues.filter(
      r => r.status === 'presente' && !afterResidueIds.has(r.id)
    );
    if (missingResidues.length > 0) {
      errors.push({
        code: ErrorCode.E_WR01,
        severity: ErrorSeverity.ERROR,
        message: `Resíduos desapareceram sem ação: ${missingResidues.map(r => r.id).join(', ')}`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    // Ferramentas podem mudar de localização, mas não desaparecer do inventário.
    const missingTools = worldStateBefore.tools.filter(
      t => !worldStateAfter.tools.some(a => a.toolId === t.toolId)
    );
    if (missingTools.length > 0) {
      errors.push({
        code: ErrorCode.E_WS01,
        severity: ErrorSeverity.WARNING,
        message: `Ferramentas desapareceram: ${missingTools.map(t => t.toolId).join(', ')}`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    return errors;
  }
}
