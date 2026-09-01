import { describe, expect, it } from 'vitest';
import type { Operation, Scene, Stage } from '../types/scene';
import type { WorldState } from '../types/world-state';
import { compilePhysicalActionIR } from './physical-action-ir';

function worldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'house', progress: 0, status: 'em andamento' },
    existingComponents: ['foundation'],
    partialComponents: [],
    futureComponents: ['component-wall', 'component-roof'],
    materials: [{
      materialId: 'wood',
      quantity: 10,
      status: 'disponivel',
      location: 'Z1',
      origin: 'supplied',
    }],
    consumedMaterials: [],
    residues: [],
    tools: [],
    character: {
      characterId: 'builder-1',
      currentZone: 'Z1',
      orientation: 'frente',
      currentAction: 'idle',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'Z1',
    climate: 'clear',
    light: 'day',
    vegetation: {},
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: 0,
    ...overrides,
  };
}

function input() {
  const before = worldState();
  const candidate = worldState({
    construction: { type: 'house', progress: 25, status: 'em andamento' },
    partialComponents: ['component-wall'],
    futureComponents: ['component-roof'],
    materials: [{
      materialId: 'wood',
      quantity: 8,
      status: 'disponivel',
      location: 'Z1',
      origin: 'supplied',
    }],
    character: {
      ...before.character,
      currentZone: 'Z2',
      currentAction: 'fastening beam',
    },
    activeZone: 'Z2',
    timestamp: 1,
  });
  const operation = {
    id: 'operation-wall',
    name: 'Horizontal wall beam',
    type: 'beam',
    componentId: 'component-wall',
    elements: ['beam-A-B'],
    zones: ['Z2'],
    visualBasis: {
      classification: 'FACT',
      sourceClassification: 'FACT',
      sourceField: 'blueprint',
      evidence: 'Wall beam specification',
      materials: ['wood'],
      tools: ['hammer'],
    },
    stages: [0, 25, 50, 75, 100],
    topology: 'LINEAR',
    estimatedDuration: 10,
    scenes: ['scene-wall'],
  } as Operation;
  const stage = {
    percentage: 25,
    initialState: {},
    characterPosition: 'Z2',
    activeZone: 'Z2',
    physicalAction: 'Fixar viga horizontal entre postes A e B',
    tool: 'hammer',
    component: 'component-wall',
    allowedChanges: ['beam-A-B'],
    finalState: {},
    visualEvidence: ['beam visibly fastened between posts A and B'],
    preservedZones: ['Z1', 'Z3'],
    futureElements: ['window-future'],
    cameraId: 'A',
    validations: {
      dependencies: true,
      temporal: true,
      spatial: true,
      causality: true,
      conservation: true,
      character: true,
      tools: true,
      visibility: true,
      progression: true,
      approved: true,
      errors: [],
    },
  } as Stage;
  const scene = { id: 'scene-wall', operationId: operation.id } as Scene;

  return { scene, stage, operation, worldStateBefore: before, candidateState: candidate };
}

describe('compilePhysicalActionIR', () => {
  it('produces the same IR for the same input', () => {
    const source = input();

    expect(compilePhysicalActionIR(source)).toEqual(compilePhysicalActionIR(source));
  });

  it('identifies the actor', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.actor).toEqual({ characterId: 'builder-1' });
  });

  it('identifies the affected target', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.target).toEqual({
      id: 'component-wall',
      label: 'Horizontal wall beam',
      elements: ['beam-A-B'],
    });
  });

  it('identifies the work zone', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.zone).toBe('Z2');
  });

  it('includes only the tool used by the stage', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.tools).toEqual(['hammer']);
  });

  it('includes operation materials relevant to the physical action', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.materials).toEqual(['wood']);
  });

  it('represents the real compact before and after physical delta', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.before).toEqual({
      targetStatus: 'FUTURE',
      constructionProgress: 0,
      actorZone: 'Z1',
      materialQuantities: { wood: 10 },
    });
    expect(ir.after).toEqual({
      targetStatus: 'PARTIAL',
      constructionProgress: 25,
      actorZone: 'Z2',
      materialQuantities: { wood: 8 },
    });
  });

  it('derives expected effects from the candidate state', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.expectedEffects).toMatchObject({
      constructionProgress: { before: 0, after: 25 },
      targetStatus: { before: 'FUTURE', after: 'PARTIAL' },
      actorZone: { before: 'Z1', after: 'Z2' },
      materialQuantityChanges: [{ materialId: 'wood', before: 10, after: 8 }],
      newlyPartialComponents: ['component-wall'],
    });
  });

  it('keeps future elements out of the set of present preserved components', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.constraints.preserveComponents).toEqual(['foundation']);
    expect(ir.constraints.preserveComponents).not.toContain('component-roof');
    expect(ir.constraints.forbiddenFutureComponents).toContain('component-roof');
    expect(ir.constraints.preventPrematureElements).toContain('window-future');
  });

  it('provides non-empty observable evidence', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.evidence).toHaveLength(1);
    expect(ir.evidence[0]).toContain('Horizontal wall beam');
    expect(ir.evidence[0]).toContain('zone Z2');
  });

  it('contains exactly one primary action', () => {
    const ir = compilePhysicalActionIR(input());

    expect(ir.primaryAction).toEqual({
      type: 'FASTEN',
      verb: 'fixar',
      description: 'fixar Horizontal wall beam',
    });
    expect(ir).not.toHaveProperty('actions');
  });

  it('does not mutate WorldState inputs', () => {
    const source = input();
    const beforeSnapshot = structuredClone(source.worldStateBefore);
    const candidateSnapshot = structuredClone(source.candidateState);

    compilePhysicalActionIR(source);

    expect(source.worldStateBefore).toEqual(beforeSnapshot);
    expect(source.candidateState).toEqual(candidateSnapshot);
  });
});
