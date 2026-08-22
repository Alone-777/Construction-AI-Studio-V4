import { SpatialMap, AccessibilityResult } from '../types';
import { checkAccessibility } from './spatial-map';

export interface WorkRouteStep {
  fromZone: string;
  toZone: string;
  route: string[];
  operation: string;
  reason: string;
}

export interface WorkRoute {
  sequence: WorkRouteStep[];
  totalDisplacements: number;
  estimatedTransitTime: number;
}

/**
 * Planeja a rota de trabalho — sequência espacial coerente.
 * Prefere caminhos contínuos. Evita saltos aleatórios.
 */
export function planWorkRoute(
  map: SpatialMap,
  startZone: string,
  targetZones: string[],
  operationDesc: string
): WorkRoute {
  const sequence: WorkRouteStep[] = [];
  let currentZone = startZone;
  let displacements = 0;

  for (const target of targetZones) {
    if (currentZone !== target) {
      const access = checkAccessibility(map, currentZone, target);
      if (access.accessible) {
        sequence.push({
          fromZone: currentZone,
          toZone: target,
          route: access.route,
          operation: operationDesc,
          reason: `Deslocamento de ${currentZone} para ${target}`,
        });
        displacements++;
        currentZone = target;
      } else {
        sequence.push({
          fromZone: currentZone,
          toZone: target,
          route: [],
          operation: operationDesc,
          reason: `⚠ ACESSO NÃO CONFIRMÁVEL para ${target}${access.blockedBy ? ` (bloqueado por ${access.blockedBy})` : ''}`,
        });
      }
    }
  }

  return {
    sequence,
    totalDisplacements: displacements,
    estimatedTransitTime: displacements * 5,
  };
}
