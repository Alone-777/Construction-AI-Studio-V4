import type { WorldState } from '../../types/world-state';
import type { Operation, Scene, Stage } from '../../types/scene';
import type { SpatialMap } from '../../types/spatial';
import type { HandlingProfile, LogisticsEquipment } from '../../types/materials';
import type { LogisticsPlanningContext, LogisticsSourceEvidence } from './logistics-types';
import { deriveOfficialRevision } from './simulator';

/** Deterministic synthetic examples; never a production workspace or visual observation. */
export function logisticsExample(options: {
  profile?: HandlingProfile; workerCount?: number; equipment?: boolean; observed?: boolean;
} = {}) {
  const profile = options.profile ?? { loadClass: 'LIGHT', sizeClass: 'COMPACT', massKg: 8, targetHeightM: 0.5, evidence: 'DECLARED' };
  const world: WorldState = {
    terrain: { type: 'forest', slope: 'flat', vegetation: 'grass', soil: 'terra' },
    construction: { type: 'cabin', progress: 0, status: 'in progress' },
    existingComponents: ['foundation'], partialComponents: [], futureComponents: ['wall', 'roof'],
    materials: [{ materialId: 'madeira', quantity: 10, status: 'armazenado', location: 'STOCK', origin: 'recorded delivery', handling: profile }],
    consumedMaterials: [], residues: [],
    tools: [{ toolId: 'martelo', status: 'armazenada', location: 'STOCK', inUse: false }],
    character: { characterId: 'builder-1', currentZone: 'STOCK', orientation: 'frente', carriedObjects: [], movementRequired: false },
    activeZone: 'WORK', climate: 'clear', light: 'day', vegetation: {}, camera: 'A',
    temporaryObjects: [], permanentObjects: [], timestamp: 1,
  };
  if (options.equipment) {
    // Heavy examples start already staged beside the anchored hoist, not magically
    // loaded at a remote stock point by equipment located at the destination.
    if ((profile.massKg ?? 0) > 40 || profile.loadClass === 'HEAVY') world.materials[0].location = 'WORK';
    for (const kind of ['HOIST', 'RIGGING', 'WORK_PLATFORM', 'CART'] as LogisticsEquipment['kind'][]) {
      world.tools.push({ toolId: kind.toLowerCase(), status: 'armazenada', location: 'WORK', inUse: false,
        equipment: { kind, ready: true, anchored: true, capacityKg: 150, reachM: 5 } });
    }
  }
  const map: SpatialMap = {
    id: 'logistics-map', width: 100, height: 100, gridSize: 10,
    orientation: { front: 'N', back: 'S', left: 'W', right: 'E', center: 'C' },
    zones: ['STOCK', 'WORK'].map((id, index) => ({ id, name: id, type: 'AREA', shape: 'rectangle',
      bounds: { x: index * 50, y: 0, width: 50, height: 100 }, status: 'pristine',
      adjacentZones: [index ? 'STOCK' : 'WORK'], occluded: false })),
  };
  const operation: Operation = {
    id: 'wall', name: 'Montar parede', type: 'parede', componentId: 'wall',
    stages: [0, 25, 50, 75, 100], topology: 'AREA', estimatedDuration: 15, scenes: [],
  };
  const stage: Stage = {
    percentage: 25, initialState: {}, finalState: {}, characterPosition: 'WORK', activeZone: 'WORK',
    physicalAction: 'montar e fixar', tool: 'martelo', allowedChanges: [], visualEvidence: ['visible fixed piece'],
    preservedZones: [], futureElements: ['roof'], cameraId: 'A',
    validations: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true,
      character: true, tools: true, visibility: true, progression: true, approved: true, errors: [] },
  };
  const scene: Scene = { id: 'wall-scene', number: 1, timecodeStart: 0, timecodeEnd: 15, duration: 15,
    operationId: 'wall', stages: [stage], camera: 'A', activeZones: ['WORK'], characterId: 'builder-1',
    status: 'draft', riskLevel: 'LOW', microTimeline: [] };
  const workerCount = options.workerCount ?? 1;
  const sourceEvidence: LogisticsSourceEvidence = {
    frameId: 'official-source:fixture', frameHash: 'a'.repeat(64), officialRevision: deriveOfficialRevision(world),
    observations: [
      { resourceKey: 'tool:hammer', zoneId: 'STOCK', visibility: 'VISIBLE', evidenceId: 'fixture-tool' },
      { resourceKey: 'material:madeira', zoneId: world.materials[0].location, visibility: 'VISIBLE', evidenceId: 'fixture-wood' },
      ...world.tools.filter(tool => tool.equipment).map(tool => ({ resourceKey: 'equipment:' + tool.toolId,
        zoneId: tool.location, visibility: 'VISIBLE' as const, evidenceId: 'fixture-' + tool.toolId })),
    ],
    workers: Array.from({ length: workerCount }, (_, i) => ({ id: 'builder-' + (i + 1), zoneId: 'STOCK', evidenceId: 'fixture-worker-' + i })),
  };
  const logisticsContext: LogisticsPlanningContext = {
    workerCount, spatialMap: map,
    area: { zoneId: 'STOCK', layout: 'COMPACT_STAGING_POINT', description: 'Small stock and tool rack.' },
    ...(options.observed === false ? {} : {
      sourceFrameId: sourceEvidence.frameId, sourceFrameHash: sourceEvidence.frameHash, sourceEvidence,
    }),
  };
  return { world, input: { scene, stage, operation, worldStateBefore: world, beforePercentage: 0,
    materialUse: { madeira: 4 }, logisticsContext } };
}
