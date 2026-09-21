import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../types/world-state';
import type { PhysicalActionIR } from '../physical-action-ir';
import {
  legacyPhysicalActionIRToV2Plan,
  simulatePhysicalExecution,
} from './index';

function world(): WorldState {
  return {
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'cabin', progress: 0, status: 'em andamento' },
    existingComponents: ['foundation'],
    partialComponents: [],
    futureComponents: ['wall', 'roof'],
    materials: [{
      materialId: 'wood',
      quantity: 10,
      status: 'disponivel',
      location: 'Z2',
      origin: 'supplied',
    }],
    consumedMaterials: [],
    residues: [],
    tools: [{
      toolId: 'martelo',
      status: 'armazenada',
      location: 'Z2',
      inUse: false,
    }],
    character: {
      characterId: 'builder-1',
      currentZone: 'Z2',
      orientation: 'frente',
      currentAction: 'idle',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'Z2',
    climate: 'clear',
    light: 'day',
    vegetation: {},
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: 4,
  };
}

function ir(): PhysicalActionIR {
  return {
    id: 'physical-action:scene-wall:operation-wall:25',
    sceneId: 'scene-wall',
    stageId: '25',
    operationId: 'operation-wall',
    primaryAction: {
      type: 'FASTEN',
      verb: 'fixar',
      description: 'Fixar viga horizontal entre postes A e B',
    },
    actor: { characterId: 'builder-1' },
    target: {
      id: 'wall',
      label: 'Horizontal wall beam',
      elements: ['beam-A-B'],
    },
    zone: 'Z2',
    tools: ['hammer'],
    materials: ['wood'],
    preconditions: [],
    expectedEffects: {
      constructionProgress: { before: 0, after: 25 },
      targetStatus: { before: 'FUTURE', after: 'PARTIAL' },
      actorZone: { before: 'Z2', after: 'Z2' },
      materialQuantityChanges: [],
      newlyCompletedComponents: [],
      newlyPartialComponents: ['wall'],
    },
    before: {
      targetStatus: 'FUTURE',
      constructionProgress: 0,
      actorZone: 'Z2',
      materialQuantities: { wood: 10 },
    },
    after: {
      targetStatus: 'PARTIAL',
      constructionProgress: 25,
      actorZone: 'Z2',
      materialQuantities: { wood: 10 },
    },
    constraints: {
      preserveActorId: 'builder-1',
      allowedZone: 'Z2',
      preserveComponents: ['foundation'],
      preserveZones: ['Z1'],
      forbiddenFutureComponents: ['wall', 'roof'],
      preventPrematureElements: [],
    },
    evidence: ['beam visibly fastened'],
  };
}

describe('legacy PhysicalActionIR V2 adapter', () => {
  it('creates a low-confidence compatibility plan without inventing a physical metric', () => {
    const plan = legacyPhysicalActionIRToV2Plan(ir(), world(), {
      beforePercentage: 0,
      targetPercentage: 25,
      authorizedZoneId: 'Z2',
    });

    expect(plan.metadata.source).toBe('LEGACY_PHYSICAL_ACTION_IR');
    expect(plan.metadata.confidence).toBe('LOW');
    expect(plan.intent.physicalProgress).toBeUndefined();
    expect(plan.intent.temporalConstraints.forbiddenFutureComponentIds)
      .not.toContain('wall');
    expect(plan.intent.temporalConstraints.forbiddenFutureComponentIds)
      .toContain('roof');
    expect(plan.nodes.some(node => node.kind === 'CONTACT')).toBe(true);
    expect(plan.nodes.some(node =>
      node.effects.some(effect => effect.type === 'CANONICAL_PROGRESS_ADVANCED'),
    )).toBe(true);
  });

  it('simulates the compatibility plan without mutating OFFICIAL or enabling commit', () => {
    const official = world();
    const snapshot = structuredClone(official);
    const plan = legacyPhysicalActionIRToV2Plan(ir(), official, {
      beforePercentage: 0,
      targetPercentage: 25,
      authorizedZoneId: 'Z2',
    });
    const receipt = simulatePhysicalExecution(official, plan);

    expect(receipt.validation.ok).toBe(true);
    expect(receipt.commitAvailable).toBe(false);
    expect(official).toEqual(snapshot);
    expect(receipt.projected?.canonicalProgressByTarget.wall).toBe(25);
    expect(receipt.projected?.worldState.partialComponents).toContain('wall');
  });
});
