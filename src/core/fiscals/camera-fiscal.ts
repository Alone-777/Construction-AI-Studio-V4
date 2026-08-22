import { ErrorCode, ErrorSeverity, ValidationError } from '../types';
import { FiscalContext, FiscalInspector } from './types';

export class CameraFiscal implements FiscalInspector {
  id = 'camera-fiscal';
  name = 'Inspetor de Câmera';

  inspect(context: FiscalContext): ValidationError[] {
    const errors: ValidationError[] = [];
    const { scene, stage, projectDNA } = context;

    const camId = stage.cameraId.toLowerCase() as 'a'|'b';
    const camera = projectDNA.cameras[camId];

    if (!camera) {
       errors.push({
        code: 'E_CA01',
        severity: ErrorSeverity.ERROR,
        message: `Câmera '${stage.cameraId}' não encontrada no DNA do projeto.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
      return errors;
    }

    if (!camera.visibleZones.includes(stage.activeZone) && !camera.partiallyVisibleZones.includes(stage.activeZone)) {
      errors.push({
        code: ErrorCode.E_SP07,
        severity: ErrorSeverity.ERROR,
        message: `Zona ativa '${stage.activeZone}' não está visível para a Câmera '${stage.cameraId}'.`,
        sceneId: scene.id,
        stageId: stage.percentage.toString(),
      });
    }

    return errors;
  }
}
