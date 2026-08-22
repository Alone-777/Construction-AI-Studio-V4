/**
 * Tipos de zonas espaciais.
 */
export type ZoneType = 'AREA' | 'PERIMETER' | 'LINEAR' | 'POINTS' | 'SURFACE' | 'VOLUME' | 'FACES' | 'LAYERS' | 'LOCAL' | 'HYBRID' | 'CUSTOM';

/**
 * Formas geométricas das zonas.
 */
export type ZoneShape = 'rectangle' | 'circle' | 'line' | 'points' | 'polygon' | 'custom';

/**
 * Orientação direcional.
 */
export type Orientation = 'frente' | 'fundo' | 'esquerda' | 'direita' | 'centro';

/**
 * Status de progressão de uma zona.
 */
export type ZoneStatus = 'pristine' | 'active' | 'partial' | 'complete' | 'blocked';

/**
 * Ponto no espaço 2D.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Caixa delimitadora (bounding box).
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Representa uma zona espacial na cena.
 */
export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  shape: ZoneShape;
  bounds: Bounds;
  status: ZoneStatus;
  orientation?: Orientation;
  adjacentZones: string[];
  occluded: boolean;
}

/**
 * Mapa espacial global.
 */
export interface SpatialMap {
  id: string;
  zones: Zone[];
  width: number;
  height: number;
  orientation: {
    front: string;
    back: string;
    left: string;
    right: string;
    center: string;
  };
  gridSize: number;
}

/** Definição relativa (0..1) usada pelo gerador de zonas adaptativas. */
export interface AdaptiveZoneDefinition {
  id: string;
  name: string;
  type: ZoneType;
  shape?: ZoneShape;
  relativeBounds: Bounds;
  orientation?: Orientation;
  occluded?: boolean;
}

/**
 * Resultado de uma verificação de acessibilidade espacial.
 */
export interface AccessibilityResult {
  accessible: boolean;
  route: string[];
  blockedBy?: string;
}
