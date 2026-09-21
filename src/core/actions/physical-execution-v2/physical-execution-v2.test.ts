import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../types/world-state';
import {
  CONSTRUCTION_INTENT_SCHEMA,
  PHYSICAL_EXECUTION_PLAN_SCHEMA,
  compileProviderNeutralPromptArtifact,
  deriveOfficialRevision,
  fingerprintValue,
  simulatePhysicalExecution,
  validatePhysicalExecutionPlan,
  type PhysicalExecutionPlanV2,
} from './index';

function official(): WorldState {
  return {
    terrain: {
      type: 'forest clearing',
      slope: 'flat',
      vegetation: 'grass',
      soil: 'soil',
    },
    construction: {
      type: 'cabin',
      progress: 0,
      status: 'em andamento',
    },
    existingComponents: [],
    partialComponents: [],
    futureComponents: ['foundation', 'floor', 'walls'],
    materials: [{
      materialId: 'soil',
      quantity: 100,
      status: 'disponivel',
      location: 'Z1',
      origin: 'site',
    }],
    consumedMaterials: [],
    residues: [],
    tools: [{
      toolId: 'pa',
      status: 'armazenada',
      location: 'Z1',
      inUse: false,
    }],
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
    vegetation: { Z1: 'grass' },
    camera: 'A',
    temporaryObjects: ['marker'],
    permanentObjects: ['large-tree'],
    timestamp: 7,
  };
}

function validPlan(world = official()): PhysicalExecutionPlanV2 {
  const revision = deriveOfficialRevision(world);
  return {
    schemaVersion: PHYSICAL_EXECUTION_PLAN_SCHEMA,
    planId: 'plan:terrain-preparation:0-25',
    officialBefore: {
      revision,
      timestamp: world.timestamp,
      snapshotFingerprint: fingerprintValue(world),
    },
    intent: {
      schemaVersion: CONSTRUCTION_INTENT_SCHEMA,
      operationId: 'terrain-preparation',
      targetEntityId: 'terrain-prep-zone',
      methodId: 'manual-shovel-clearing',
      authorizedZoneId: 'Z1',
      officialRevision: revision,
      canonicalProgress: {
        beforePercentage: 0,
        targetPercentage: 25,
        tolerancePercentage: 0,
      },
      physicalProgress: {
        metric: 'AREA',
        unit: 'm2',
        from: 0,
        target: 12.5,
        tolerance: 0.5,
        total: 50,
        zoneId: 'Z1',
        sectors: ['sector-a'],
      },
      temporalConstraints: {
        preserveComponentIds: [],
        forbiddenFutureComponentIds: ['foundation', 'floor', 'walls'],
        preserveZoneIds: [],
        allowedMaterialDestinationZoneIds: ['Z1:spoil'],
      },
    },
    evidence: [{
      id: 'surface-persist',
      entityIds: ['terrain-prep-zone', 'soil'],
      relation: 'EXPOSED_SOIL_AREA_INCREASES_AND_PERSISTS',
      metric: 'area',
      expected: {
        fromM2: 0,
        targetM2: 12.5,
        remainingUntouchedM2: 37.5,
      },
      tolerance: 0.5,
      visibleIn: 'TERMINAL_FRAME',
      mustPersist: true,
    }],
    nodes: [
      {
        id: 'acquire',
        kind: 'ACQUIRE_TOOL',
        instruction: 'Take the existing shovel.',
        actorId: 'builder-1',
        toolId: 'shovel',
        sourceEntityIds: [],
        targetEntityIds: [],
        zoneId: 'Z1',
        effects: [],
        preconditions: [{ type: 'TOOL_AVAILABLE', toolId: 'shovel' }],
        postconditions: [{ type: 'TOOL_HELD', toolId: 'shovel' }],
        evidenceIds: [],
      },
      {
        id: 'position',
        kind: 'POSITION',
        instruction: 'Stand at the bounded first quarter of the work zone.',
        actorId: 'builder-1',
        toolId: 'shovel',
        sourceEntityIds: [],
        targetEntityIds: ['terrain-prep-zone'],
        zoneId: 'Z1',
        effects: [],
        preconditions: [{ type: 'TOOL_HELD', toolId: 'shovel' }],
        postconditions: [],
        evidenceIds: [],
      },
      {
        id: 'contact',
        kind: 'CONTACT',
        instruction: 'Drive the shovel blade into shallow topsoil.',
        actorId: 'builder-1',
        toolId: 'shovel',
        sourceEntityIds: ['soil'],
        targetEntityIds: ['terrain-prep-zone'],
        zoneId: 'Z1',
        contact: {
          id: 'soil-contact',
          mode: 'DIG',
          required: true,
          zoneId: 'Z1',
          targetEntityId: 'terrain-prep-zone',
        },
        effects: [],
        preconditions: [{ type: 'TOOL_HELD', toolId: 'shovel' }],
        postconditions: [],
        evidenceIds: [],
      },
      {
        id: 'scrape',
        kind: 'SCRAPE',
        instruction: 'Scrape grass and roots, lift loosened material, and deposit it beside the same bounded patch.',
        actorId: 'builder-1',
        toolId: 'shovel',
        sourceEntityIds: ['soil'],
        targetEntityIds: ['terrain-prep-zone'],
        zoneId: 'Z1',
        contact: {
          id: 'scrape-contact',
          mode: 'SCRAPE',
          required: true,
          zoneId: 'Z1',
          targetEntityId: 'terrain-prep-zone',
        },
        motion: {
          mode: 'SCRAPE',
          repetitions: 6,
          boundedZoneId: 'Z1',
        },
        effects: [
          {
            type: 'SURFACE_REMOVED',
            materialId: 'soil',
            quantity: { value: 12.5, unit: 'm2' },
            zoneId: 'Z1',
            destinationZoneId: 'Z1:spoil',
          },
          {
            type: 'PHYSICAL_PROGRESS_ADVANCED',
            targetId: 'terrain-prep-zone',
            metric: 'AREA',
            unit: 'm2',
            from: 0,
            to: 12.5,
            zoneId: 'Z1',
          },
          {
            type: 'CANONICAL_PROGRESS_ADVANCED',
            targetId: 'terrain-prep-zone',
            fromPercentage: 0,
            toPercentage: 25,
          },
        ],
        preconditions: [{
          type: 'CONTACT_ESTABLISHED',
          contactId: 'soil-contact',
        }],
        postconditions: [{
          type: 'CANONICAL_PROGRESS_AT',
          targetId: 'terrain-prep-zone',
          percentage: 25,
        }],
        evidenceIds: ['surface-persist'],
      },
      {
        id: 'inspect',
        kind: 'INSPECT',
        instruction: 'Show the prepared first quarter and the untouched remaining three quarters.',
        actorId: 'builder-1',
        toolId: 'shovel',
        sourceEntityIds: [],
        targetEntityIds: ['terrain-prep-zone'],
        zoneId: 'Z1',
        effects: [],
        preconditions: [],
        postconditions: [],
        evidenceIds: ['surface-persist'],
      },
      {
        id: 'stop',
        kind: 'STOP',
        instruction: 'Stop construction at the canonical 25% target.',
        actorId: 'builder-1',
        sourceEntityIds: [],
        targetEntityIds: ['terrain-prep-zone'],
        zoneId: 'Z1',
        effects: [],
        preconditions: [],
        postconditions: [],
        evidenceIds: ['surface-persist'],
      },
    ],
    edges: [
      { from: 'acquire', to: 'position', relation: 'SEQUENCE' },
      { from: 'position', to: 'contact', relation: 'SEQUENCE' },
      { from: 'contact', to: 'scrape', relation: 'SEQUENCE' },
      { from: 'scrape', to: 'inspect', relation: 'SEQUENCE' },
      { from: 'inspect', to: 'stop', relation: 'SEQUENCE' },
    ],
    constraints: {
      stopAtTarget: true,
      requirePersistentEffects: true,
      maxSubactions: 8,
    },
    metadata: {
      source: 'NATIVE_V2',
      confidence: 'HIGH',
      limitations: [],
    },
  };
}

describe('PhysicalExecutionPlan V2', () => {
  it('simulates shovel clearing without mutating OFFICIAL or creating soil', () => {
    const world = official();
    const before = structuredClone(world);
    const result = simulatePhysicalExecution(world, validPlan(world));

    expect(result.validation.ok).toBe(true);
    expect(result.commitAvailable).toBe(false);
    expect(world).toEqual(before);
    expect(result.projected?.worldState.materials[0].quantity).toBe(100);
    expect(result.projected?.materialTransfers).toEqual([{
      materialId: 'soil',
      quantity: { value: 12.5, unit: 'm2' },
      fromZoneId: 'Z1',
      toZoneId: 'Z1:spoil',
      causeNodeId: 'scrape',
    }]);
    expect(
      result.projected?.canonicalProgressByTarget['terrain-prep-zone'],
    ).toBe(25);
    expect(
      result.projected?.physicalProgressByTarget['terrain-prep-zone'].value,
    ).toBe(12.5);
    expect(result.projected?.worldState.construction.progress).toBe(0);
  });

  it('keeps canonical 25% separate from 12.5 m2 physical evidence', () => {
    const world = official();
    const plan = validPlan(world);

    expect(plan.intent.canonicalProgress.targetPercentage).toBe(25);
    expect(plan.intent.physicalProgress?.target).toBe(12.5);
    expect(plan.intent.physicalProgress?.total).toBe(50);
  });

  it('rejects hammer excavation', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    scrape.toolId = 'hammer';

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'TOOL_NODE_INCOMPATIBLE'
      || item.code === 'TOOL_MATERIAL_INCOMPATIBLE',
    )).toBe(true);
  });

  it('rejects an edge that references a missing node', () => {
    const world = official();
    const plan = validPlan(world);
    plan.edges.push({
      from: 'ghost-node',
      to: 'stop',
      relation: 'SEQUENCE',
    });

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item => item.code === 'EDGE_NODE_MISSING'))
      .toBe(true);
  });

  it('rejects removed material without a destination', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    const removed = scrape.effects.find(
      effect => effect.type === 'SURFACE_REMOVED',
    );
    if (removed?.type === 'SURFACE_REMOVED') {
      delete removed.destinationZoneId;
    }

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'REMOVED_MATERIAL_WITHOUT_DESTINATION',
    )).toBe(true);
  });

  it('rejects future foundation work during preparation', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    scrape.effects.push({
      type: 'COMPONENT_ATTACHED',
      componentId: 'foundation',
      targetEntityId: 'terrain-prep-zone',
      sourceZoneId: 'Z1',
      zoneId: 'Z1',
    });

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'FUTURE_COMPONENT_TOUCHED',
    )).toBe(true);
  });

  it('rejects canonical progress overshoot', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    const progress = scrape.effects.find(
      effect => effect.type === 'CANONICAL_PROGRESS_ADVANCED',
    );
    if (progress?.type === 'CANONICAL_PROGRESS_ADVANCED') {
      progress.toPercentage = 50;
    }

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'CANONICAL_PROGRESS_OVERSHOOT',
    )).toBe(true);
  });

  it('rejects physical progress overshoot independently of canonical progress', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    const progress = scrape.effects.find(
      effect => effect.type === 'PHYSICAL_PROGRESS_ADVANCED',
    );
    if (progress?.type === 'PHYSICAL_PROGRESS_ADVANCED') {
      progress.to = 25;
    }

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'PHYSICAL_PROGRESS_OVERSHOOT',
    )).toBe(true);
  });

  it('rejects matter-changing action without contact', () => {
    const world = official();
    const plan = validPlan(world);
    const scrape = plan.nodes.find(node => node.id === 'scrape')!;
    delete scrape.contact;

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'EFFECT_WITHOUT_CONTACT',
    )).toBe(true);
  });

  it('rejects transformation without evidence', () => {
    const world = official();
    const plan = validPlan(world);
    plan.nodes.find(node => node.id === 'scrape')!.evidenceIds = [];

    const report = validatePhysicalExecutionPlan(
      plan,
      world,
      deriveOfficialRevision(world),
    );

    expect(report.issues.some(item =>
      item.code === 'EFFECT_WITHOUT_EVIDENCE'
      || item.code === 'OBSERVATION_MISSING',
    )).toBe(true);
  });

  it('evaluates TOOL_HELD after ACQUIRE_TOOL instead of against initial OFFICIAL only', () => {
    const world = official();
    expect(world.character.currentTool).toBeUndefined();

    const result = simulatePhysicalExecution(world, validPlan(world));

    expect(result.validation.issues.some(item =>
      item.code === 'PRECONDITION_FALSE'
      && item.details?.predicate
      && (item.details.predicate as { type?: string }).type === 'TOOL_HELD',
    )).toBe(false);
    expect(result.projected?.heldToolId).toBe('shovel');
  });

  it('preserves unrelated WorldState fields in the shadow projection', () => {
    const world = official();
    const result = simulatePhysicalExecution(world, validPlan(world));

    expect(result.projected?.worldState.camera).toBe('A');
    expect(result.projected?.worldState.permanentObjects).toEqual(['large-tree']);
    expect(result.projected?.worldState.vegetation).toEqual({ Z1: 'grass' });
  });

  it('exposes no commit operation from the simulator', () => {
    const world = official();
    const result = simulatePhysicalExecution(world, validPlan(world));

    expect(result.commitAvailable).toBe(false);
    expect('commit' in result).toBe(false);
  });

  it('compiles filmable provider-neutral beats and preserves retry corrections', () => {
    const world = official();
    const plan = validPlan(world);
    const simulation = simulatePhysicalExecution(world, plan);
    const artifact = compileProviderNeutralPromptArtifact(
      plan,
      simulation,
      [{
        code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
        correction: 'Each shovel stroke must enlarge one contiguous exposed-soil patch.',
      }],
    );

    expect(artifact.executionBeats.some(beat =>
      beat.instruction.includes('Drive the shovel blade'),
    )).toBe(true);
    expect(artifact.retryCorrections).toEqual([{
      code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
      correction: 'Each shovel stroke must enlarge one contiguous exposed-soil patch.',
    }]);
  });
});
