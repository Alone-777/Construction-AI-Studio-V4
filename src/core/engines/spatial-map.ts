import {
  SpatialMap, Zone, ZoneStatus, Orientation, AccessibilityResult,
  AdaptiveZoneDefinition,
} from '../types';

/**
 * Cria um mapa espacial em branco.
 */
export function createSpatialMap(id: string, width: number, height: number): SpatialMap {
  return {
    id,
    zones: [],
    width,
    height,
    orientation: { front: 'N', back: 'S', left: 'W', right: 'E', center: 'C' },
    gridSize: 10
  };
}

/**
 * Adiciona uma zona ao mapa.
 */
export function addZone(map: SpatialMap, zone: Zone): void {
  map.zones.push(zone);
}

/**
 * Remove uma zona pelo seu ID.
 */
export function removeZone(map: SpatialMap, zoneId: string): void {
  map.zones = map.zones.filter(z => z.id !== zoneId);
  map.zones.forEach(z => {
    z.adjacentZones = z.adjacentZones.filter(id => id !== zoneId);
  });
}

/**
 * Cria zonas padrão (2x2 grid Z1-Z4 com adjacências).
 */
export function createDefaultZones(map: SpatialMap): SpatialMap {
  const hw = map.width / 2;
  const hh = map.height / 2;
  
  const z1: Zone = { id: 'Z1', name: 'Noroeste', type: 'AREA', shape: 'rectangle', bounds: { x: 0, y: 0, width: hw, height: hh }, status: 'pristine', orientation: 'esquerda', adjacentZones: ['Z2', 'Z3'], occluded: false };
  const z2: Zone = { id: 'Z2', name: 'Nordeste', type: 'AREA', shape: 'rectangle', bounds: { x: hw, y: 0, width: hw, height: hh }, status: 'pristine', orientation: 'direita', adjacentZones: ['Z1', 'Z4'], occluded: false };
  const z3: Zone = { id: 'Z3', name: 'Sudoeste', type: 'AREA', shape: 'rectangle', bounds: { x: 0, y: hh, width: hw, height: hh }, status: 'pristine', orientation: 'esquerda', adjacentZones: ['Z1', 'Z4'], occluded: false };
  const z4: Zone = { id: 'Z4', name: 'Sudeste', type: 'AREA', shape: 'rectangle', bounds: { x: hw, y: hh, width: hw, height: hh }, status: 'pristine', orientation: 'direita', adjacentZones: ['Z2', 'Z3'], occluded: false };
  
  map.zones = [z1, z2, z3, z4];
  return map;
}

/**
 * Constrói zonas proporcionais ao terreno e deriva adjacências pela geometria.
 * As definições são independentes de resolução, portanto o mesmo blueprint pode
 * ser aplicado a mapas com dimensões diferentes sem coordenadas hardcoded.
 */
export function createAdaptiveZones(
  map: SpatialMap,
  definitions: AdaptiveZoneDefinition[],
): SpatialMap {
  const ids = new Set<string>();
  const zones = definitions.map((definition): Zone => {
    if (ids.has(definition.id)) {
      throw new Error(`Zona adaptativa duplicada: ${definition.id}`);
    }
    ids.add(definition.id);

    const { x, y, width, height } = definition.relativeBounds;
    const values = [x, y, width, height];
    if (values.some(value => !Number.isFinite(value)) || width <= 0 || height <= 0 ||
        x < 0 || y < 0 || x + width > 1 || y + height > 1) {
      throw new Error(`Limites relativos inválidos para a zona ${definition.id}`);
    }

    return {
      id: definition.id,
      name: definition.name,
      type: definition.type,
      shape: definition.shape ?? 'rectangle',
      bounds: {
        x: x * map.width,
        y: y * map.height,
        width: width * map.width,
        height: height * map.height,
      },
      status: 'pristine',
      orientation: definition.orientation,
      adjacentZones: [],
      occluded: definition.occluded ?? false,
    };
  });

  const tolerance = Math.max(1, map.gridSize / 2);
  const overlaps = (a1: number, a2: number, b1: number, b2: number) =>
    Math.min(a2, b2) - Math.max(a1, b1) >= -tolerance;

  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i].bounds;
      const b = zones[j].bounds;
      const horizontalGap = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
      const verticalGap = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
      const horizontallyAligned = overlaps(a.y, a.y + a.height, b.y, b.y + b.height);
      const verticallyAligned = overlaps(a.x, a.x + a.width, b.x, b.x + b.width);

      if ((horizontalGap <= tolerance && horizontallyAligned) ||
          (verticalGap <= tolerance && verticallyAligned)) {
        zones[i].adjacentZones.push(zones[j].id);
        zones[j].adjacentZones.push(zones[i].id);
      }
    }
  }

  // Uma zona isolada recebe ligação com a zona geometricamente mais próxima.
  for (const zone of zones) {
    if (zone.adjacentZones.length > 0 || zones.length < 2) continue;
    const centerX = zone.bounds.x + zone.bounds.width / 2;
    const centerY = zone.bounds.y + zone.bounds.height / 2;
    const nearest = zones
      .filter(candidate => candidate.id !== zone.id)
      .map(candidate => {
        const x = candidate.bounds.x + candidate.bounds.width / 2;
        const y = candidate.bounds.y + candidate.bounds.height / 2;
        return { candidate, distance: Math.hypot(x - centerX, y - centerY) };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;

    if (nearest) {
      zone.adjacentZones.push(nearest.id);
      if (!nearest.adjacentZones.includes(zone.id)) nearest.adjacentZones.push(zone.id);
    }
  }

  map.zones = zones;
  return map;
}

/**
 * Retorna IDs das zonas adjacentes à zona requisitada.
 */
export function getAdjacentZones(map: SpatialMap, zoneId: string): string[] {
  const zone = map.zones.find(z => z.id === zoneId);
  return zone ? zone.adjacentZones : [];
}

/**
 * Retorna zonas com status específico.
 */
export function getZonesByStatus(map: SpatialMap, status: ZoneStatus): Zone[] {
  return map.zones.filter(z => z.status === status);
}

/**
 * Verifica acessibilidade usando busca em largura (BFS).
 */
export function checkAccessibility(map: SpatialMap, startZoneId: string, endZoneId: string): AccessibilityResult {
  if (startZoneId === endZoneId) {
    return { accessible: true, route: [startZoneId] };
  }

  const queue: string[][] = [[startZoneId]];
  const visited = new Set<string>([startZoneId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    
    if (current === endZoneId) {
      return { accessible: true, route: path };
    }

    const currentZone = map.zones.find(z => z.id === current);
    if (!currentZone) continue;

    for (const adjId of currentZone.adjacentZones) {
      const adjZone = map.zones.find(z => z.id === adjId);
      if (adjZone && adjZone.status !== 'blocked' && !visited.has(adjId)) {
        visited.add(adjId);
        queue.push([...path, adjId]);
      } else if (adjZone?.status === 'blocked' && adjId === endZoneId) {
        return { accessible: false, route: [], blockedBy: adjId };
      }
    }
  }

  return { accessible: false, route: [] };
}

/**
 * Retorna zonas visíveis.
 */
export function getVisibleZones(map: SpatialMap): Zone[] {
  return map.zones.filter(z => !z.occluded);
}

/**
 * Define orientação da zona.
 */
export function setOrientation(map: SpatialMap, zoneId: string, orientation: Orientation): void {
  const zone = map.zones.find(z => z.id === zoneId);
  if (zone) {
    zone.orientation = orientation;
  }
}
