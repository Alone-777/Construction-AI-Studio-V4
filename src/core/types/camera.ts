import { Point } from './spatial';

/**
 * Tipos de movimentação de câmera permitidos.
 */
export type CameraMovement = 'FIXA' | 'FOLLOW' | 'CUT';

/**
 * Definição da Câmera na cena.
 */
export interface Camera {
  id: 'A' | 'B';
  relativePosition: Point;
  orientation: number; // Em graus
  conceptualHeight: 'baixa' | 'media' | 'alta' | 'aerea';
  framing: 'close' | 'medium' | 'wide' | 'panoramic';
  allowedMovement: CameraMovement;
  visibleZones: string[];
  partiallyVisibleZones: string[];
  hiddenZones: string[];
}

/**
 * Resultado da validação de regras de câmera.
 */
export interface CameraValidation {
  characterVisible: boolean;
  actionVisible: boolean;
  toolVisible: boolean;
  transformationVisible: boolean;
  resultVisible: boolean;
  adequate: boolean;
  alternativeSuggestion?: string;
}
