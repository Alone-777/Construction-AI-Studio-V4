import { describe, expect, it } from 'vitest';
import { compilePhysicalActionIR } from '../actions/physical-action-ir';
import type { Camera } from '../types/camera';
import { DEFAULT_VISUAL_DNA, type ProjectDNA, type VisualDNA } from '../types/project';
import type { Operation, Scene, Stage } from '../types/scene';
import type { SpatialMap } from '../types/spatial';
import type { WorldState } from '../types/world-state';
import {
  buildStageVisualStateSnapshots,
  type BuildStageVisualStateSnapshotsInput,
} from './visual-state-snapshot';

function state(overrides: Partial<WorldState> = {}): WorldState {
  return {
    terrain: { type: 'flat', slope: 'none', vegetation: 'forest-edge', soil: 'dirt' },
    construction: { type: 'cabin', progress: 25, status: 'em andamento' },
    existingComponents: ['component-a'],
    partialComponents: [],
    futureComponents: ['component-b', 'component-c'],
    materials: [{
      materialId: 'wood',
      quantity: 10,
      status: 'disponivel',
      location: 'Z1',
      origin: 'supplied',
    }],
    consumedMaterials: [],
    residues: [],
    tools: [{ toolId: 'hammer', status: 'armazenada', location: 'Z1', inUse: false }],
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
    vegetation: { Z1: 'preserved', Z2: 'work-area', Z3: 'preserved' },
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: ['old-tree'],
    timestamp: 1,
    ...overrides,
  };
}

function camera(id: 'A' | 'B'): Camera {
  return {
    id,
    relativePosition: id === 'A' ? { x: 10, y: 20 } : { x: 80, y: 20 },
    orientation: id === 'A' ? 30 : 210,
    conceptualHeight: id === 'A' ? 'media' : 'alta',
    framing: id === 'A' ? 'wide' : 'medium',
    allowedMovement: id === 'A' ? 'FIXA' : 'FOLLOW',
    visibleZones: ['Z2'],
    partiallyVisibleZones: ['Z1'],
    hiddenZones: ['Z3'],
  };
}

function spatialMap(): SpatialMap {
  return {
    id: 'map-1',
    width: 100,
    height: 100,
    gridSize: 10,
    orientation: { front: 'north', back: 'south', left: 'west', right: 'east', center: 'center' },
    zones: ['Z1', 'Z2', 'Z3'].map((id, index) => ({
      id,
      name: `Zone ${id}`,
      type: 'AREA',
      shape: 'rectangle',
      bounds: { x: index * 30, y: 0, width: 30, height: 30 },
      status: id === 'Z2' ? 'active' : 'pristine',
      orientation: id === 'Z2' ? 'frente' : 'fundo',
      adjacentZones: [],
      occluded: false,
    })),
  };
}

function visualDNA(): VisualDNA {
  return {
    ...structuredClone(DEFAULT_VISUAL_DNA),
    id: 'visual-dna-1',
    character: {
      ...structuredClone(DEFAULT_VISUAL_DNA.character),
      id: 'builder-visual-1',
      name: 'Canonical Builder',
      appearance: 'same face and body',
      clothing: 'orange work jacket',
    },
    environment: {
      ...structuredClone(DEFAULT_VISUAL_DNA.environment),
      preset: 'floresta_temperada',
      timeOfDay: 'day',
      weather: 'clear',
    },
    camera: {
      ...structuredClone(DEFAULT_VISUAL_DNA.camera),
      cameraA: {
        ...structuredClone(DEFAULT_VISUAL_DNA.camera.cameraA),
        position: { x: 12, y: 18 },
        target: { x: 45, y: 40 },
        fov: 52,
      },
    },
    consistencyRules: {
      ...structuredClone(DEFAULT_VISUAL_DNA.consistencyRules),
      requiredVisualElements: ['old-tree'],
      forbiddenVisualElements: ['modern-crane'],
    },
    updatedAt: 1,
  };
}

function fixture(outcome: 'committed' | 'rejected' = 'committed'): BuildStageVisualStateSnapshotsInput {
  const before = state();
  const candidate = state({
    construction: { type: 'cabin', progress: 50, status: 'em andamento' },
    partialComponents: ['component-b'],
    materials: [{
      materialId: 'wood',
      quantity: 8,
      status: 'disponivel',
      location: 'Z1',
      origin: 'supplied',
    }],
    tools: [{ toolId: 'hammer', status: 'em_uso', location: 'Z2', inUse: true }],
    character: {
      ...before.character,
      currentZone: 'Z2',
      currentAction: 'fastening beam',
    },
    activeZone: 'Z2',
    timestamp: 2,
  });
  const operation = {
    id: 'operation-b',
    name: 'Beam B',
    type: 'beam',
    componentId: 'component-b',
    elements: ['beam-b'],
    zones: ['Z2'],
    visualBasis: {
      classification: 'FACT',
      sourceClassification: 'FACT',
      sourceField: 'blueprint',
      evidence: 'Beam B specification',
      materials: ['wood'],
      tools: ['hammer'],
    },
    stages: [0, 25, 50, 75, 100],
    topology: 'LINEAR',
    estimatedDuration: 10,
    scenes: ['scene-b'],
  } as Operation;
  const scene = { id: 'scene-b', operationId: operation.id } as Scene;
  const stage = {
    percentage: 50,
    initialState: {},
    characterPosition: 'Z2',
    activeZone: 'Z2',
    physicalAction: 'Fixar viga B entre os postes',
    tool: 'hammer',
    component: 'component-b',
    allowedChanges: ['beam-b'],
    finalState: {},
    visualEvidence: ['beam B visibly fastened'],
    preservedZones: ['Z1', 'Z3'],
    futureElements: ['future-window'],
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
      approved: outcome === 'committed',
      errors: [],
    },
    worldStateBefore: before,
    worldStateAfter: candidate,
    status: outcome === 'rejected' ? 'rejected' : undefined,
    decision: outcome === 'committed'
      ? { action: 'EXECUTE_OPERATION', operationId: operation.id, reason: 'committed', confidence: 1 }
      : undefined,
  } as Stage;
  stage.physicalActionIR = compilePhysicalActionIR({
    scene,
    stage,
    operation,
    worldStateBefore: before,
    candidateState: candidate,
  });

  return {
    projectId: 'project-1',
    scene,
    stage,
    operation,
    visualDNA: visualDNA(),
    spatialMap: spatialMap(),
    cameras: { a: camera('A'), b: camera('B') } as ProjectDNA['cameras'],
  };
}

describe('buildStageVisualStateSnapshots', () => {
  it('is deterministic for the same input', () => {
    const input = fixture();

    expect(buildStageVisualStateSnapshots(input)).toEqual(buildStageVisualStateSnapshots(input));
  });

  it('does not mutate temporal WorldState inputs', () => {
    const input = fixture();
    const before = structuredClone(input.stage.worldStateBefore);
    const candidate = structuredClone(input.stage.worldStateAfter);

    buildStageVisualStateSnapshots(input);

    expect(input.stage.worldStateBefore).toEqual(before);
    expect(input.stage.worldStateAfter).toEqual(candidate);
  });

  it('derives actor identity from WorldState and VisualDNA authorities', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.actor).toMatchObject({
      characterId: 'builder-1',
      visualIdentityId: 'builder-visual-1',
      name: 'Canonical Builder',
      clothing: 'orange work jacket',
      zone: 'Z2',
    });
  });

  it('uses the action IR active zone', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.space.activeZone).toBe('Z2');
    expect(snapshots.candidate?.space.relevantZones.map(zone => zone.id)).toEqual(['Z1', 'Z2', 'Z3']);
  });

  it('references the primary action from PhysicalActionIR', () => {
    const input = fixture();
    const snapshots = buildStageVisualStateSnapshots(input);

    expect(snapshots.candidate?.action.physicalActionIRId).toBe(input.stage.physicalActionIR?.id);
    expect(snapshots.candidate?.action.primary).toEqual(input.stage.physicalActionIR?.primaryAction);
  });

  it('represents the canonical action target', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.action.target).toMatchObject({
      id: 'component-b',
      elements: ['beam-b'],
    });
    expect(snapshots.candidate?.construction.targetState).toBe('PARTIAL');
  });

  it('represents action tools and materials', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.action.tools).toEqual(['hammer']);
    expect(snapshots.candidate?.action.materials).toEqual(['wood']);
    expect(snapshots.candidate?.actor.toolInUse).toBe('hammer');
    expect(snapshots.candidate?.materials.visible[0]).toMatchObject({ materialId: 'wood', quantity: 8 });
  });

  it('builds BEFORE strictly from Stage.worldStateBefore', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.before).toMatchObject({
      kind: 'OFFICIAL',
      temporalPoint: 'BEFORE',
      worldStateSource: 'BEFORE',
      construction: { progress: 25, visibleComponents: ['component-a'] },
      actor: { zone: 'Z1' },
    });
  });

  it('builds CANDIDATE strictly from Stage.worldStateAfter', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate).toMatchObject({
      kind: 'CANDIDATE',
      temporalPoint: 'AFTER',
      worldStateSource: 'CANDIDATE',
      construction: { progress: 50, partialComponents: ['component-b'] },
      actor: { zone: 'Z2' },
    });
  });

  it('promotes a committed candidate to the official visual state', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture('committed'));

    expect(snapshots.official).toMatchObject({
      kind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      worldStateSource: 'CANDIDATE',
      construction: { progress: 50, targetState: 'PARTIAL' },
      action: { visibility: 'COMMITTED' },
    });
  });

  it('does not promote a rejected candidate to official', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture('rejected'));

    expect(snapshots.candidate?.construction.progress).toBe(50);
    expect(snapshots.candidate?.action.visibility).toBe('ATTEMPTED');
    expect(snapshots.official).toMatchObject({
      stageOutcome: 'REJECTED',
      worldStateSource: 'BEFORE',
      construction: { progress: 25, targetState: 'FUTURE' },
      action: { visibility: 'REJECTED_NOT_APPLIED' },
    });
    expect(snapshots.official?.evidence.actionEvidence).toEqual([]);
  });

  it('keeps future components out of visible construction', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());
    const candidate = snapshots.candidate!;

    expect(candidate.construction.visibleComponents).toEqual(['component-a', 'component-b']);
    expect(candidate.construction.visibleComponents).not.toContain('component-c');
    expect(candidate.continuity.futureForbidden).toContain('component-c');
    expect(candidate.construction.pendingComponents).toContain('component-c');
  });

  it('represents continuity invariants without copying all VisualDNA', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.continuity).toMatchObject({
      preserveActorIdentity: 'builder-1',
      preserveClothing: 'orange work jacket',
      preserveComponents: ['component-a'],
      preserveZones: ['Z1', 'Z3'],
      preserveCameraId: 'A',
      requiredVisualElements: ['old-tree'],
      terrainOutsideActiveZoneUnchanged: true,
    });
    expect(snapshots.candidate?.continuity.forbiddenVisualElements).toContain('modern-crane');
  });

  it('represents structural observable evidence', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.evidence.actionEvidence[0]).toContain('Beam B');
    expect(snapshots.candidate?.evidence.target).toEqual({ id: 'component-b', status: 'PARTIAL' });
    expect(snapshots.candidate?.evidence.partialComponents).toEqual(['component-b']);
  });

  it('derives camera and viewpoint deterministically from existing camera data', () => {
    const snapshots = buildStageVisualStateSnapshots(fixture());

    expect(snapshots.candidate?.camera).toMatchObject({
      id: 'A',
      relativePosition: { x: 10, y: 20 },
      orientation: 30,
      framing: 'wide',
      viewpoint: {
        position: { x: 12, y: 18 },
        target: { x: 45, y: 40 },
        fov: 52,
      },
    });
  });

  it('returns no fake snapshots for an unexecuted stage', () => {
    const input = fixture();
    input.stage.worldStateBefore = undefined;
    input.stage.worldStateAfter = undefined;
    input.stage.physicalActionIR = undefined;
    input.stage.decision = undefined;

    expect(buildStageVisualStateSnapshots(input)).toEqual({});
  });
});
