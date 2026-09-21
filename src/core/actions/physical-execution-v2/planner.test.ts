import { describe, expect, it } from 'vitest';
import type { Operation, Scene, Stage } from '../../types/scene';
import type { WorldState } from '../../types/world-state';
import {
  compileProviderNeutralPromptArtifact,
  planPhysicalExecutionV2,
  simulatePhysicalExecution,
} from './index';

function world(): WorldState {
  return {
    terrain: {
      type: 'forest',
      slope: 'flat',
      vegetation: 'grass',
      soil: 'terra',
    },
    construction: {
      type: 'cabin',
      progress: 0,
      status: 'em andamento',
    },
    existingComponents: [],
    partialComponents: [],
    futureComponents: [
      'component_preparacao',
      'component_fundacao',
      'component_vigas',
    ],
    materials: [
      {
        materialId: 'madeira',
        quantity: 100,
        status: 'disponivel',
        location: 'Z1',
        origin: 'blueprint',
      },
      {
        materialId: 'pedra',
        quantity: 100,
        status: 'disponivel',
        location: 'Z1',
        origin: 'blueprint',
      },
    ],
    consumedMaterials: [],
    residues: [],
    tools: [
      {
        toolId: 'facao',
        status: 'armazenada',
        location: 'Z1',
        inUse: false,
      },
      {
        toolId: 'pa',
        status: 'armazenada',
        location: 'Z1',
        inUse: false,
      },
      {
        toolId: 'serra',
        status: 'armazenada',
        location: 'Z1',
        inUse: false,
      },
      {
        toolId: 'martelo',
        status: 'armazenada',
        location: 'Z1',
        inUse: false,
      },
    ],
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
    temporaryObjects: [],
    permanentObjects: ['old-tree'],
    timestamp: 3,
  };
}

function scene(operationId: string): Scene {
  return {
    id: 'scene:' + operationId,
    number: 1,
    timecodeStart: 0,
    timecodeEnd: 15,
    duration: 15,
    operationId,
    stages: [],
    camera: 'A',
    activeZones: ['Z1'],
    characterId: 'builder-1',
    status: 'draft',
    riskLevel: 'LOW',
    microTimeline: [],
  };
}

function stage(
  physicalAction: string,
  tool: string,
  percentage: Stage['percentage'] = 25,
): Stage {
  return {
    percentage,
    initialState: {},
    characterPosition: 'Z1',
    activeZone: 'Z1',
    physicalAction,
    tool,
    allowedChanges: [],
    finalState: {},
    visualEvidence: ['persistent visible partial result'],
    preservedZones: ['Z_PROTECTED'],
    futureElements: [],
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
  };
}

function operation(overrides: Partial<Operation>): Operation {
  return {
    id: 'op',
    name: 'Operation',
    type: 'generic',
    componentId: 'component_current',
    elements: ['element_current'],
    zones: ['Z1'],
    visualBasis: {
      classification: 'FACT',
      sourceClassification: 'FACT',
      sourceField: 'blueprint',
      evidence: 'test',
      materials: [],
      tools: [],
    },
    stages: [0, 25, 50, 75, 100],
    topology: 'AREA',
    estimatedDuration: 15,
    scenes: [],
    ...overrides,
  } as Operation;
}

describe('native Physical Execution V2 planner', () => {
  it('plans selective preparation from OFFICIAL with machete contact and removal causality', () => {
    const official = world();
    const op = operation({
      id: 'op_preparacao',
      name: 'Preparação seletiva do local',
      type: 'limpeza',
      componentId: 'component_preparacao',
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'blueprint',
        evidence: 'preparation',
        materials: [],
        tools: ['facao'],
      },
    });
    const currentStage = stage(
      'delimitar a implantação e remover somente obstáculos autorizados',
      'facao',
    );

    const plan = planPhysicalExecutionV2({
      scene: scene(op.id),
      stage: currentStage,
      operation: op,
      worldStateBefore: official,
      beforePercentage: 0,
    });
    const receipt = simulatePhysicalExecution(official, plan);

    expect(plan.metadata.source).toBe('NATIVE_V2');
    expect(plan.intent.methodId).toBe('native:clear');
    expect(plan.intent.physicalProgress).toBeUndefined();
    expect(plan.nodes.some(node =>
      node.kind === 'CUT'
      && node.toolId === 'machete'
      && node.effects.some(effect => effect.type === 'SURFACE_REMOVED'),
    )).toBe(true);
    expect(receipt.validation.ok).toBe(true);
    expect(receipt.commitAvailable).toBe(false);
    expect(receipt.projected?.materialTransfers[0]).toMatchObject({
      materialId: 'vegetation',
      fromZoneId: 'Z1',
      toZoneId: 'Z1:spoil',
    });
  });

  it('plans foundation excavation with shovel and soil destination', () => {
    const official = world();
    const op = operation({
      id: 'op_fundacao',
      name: 'Execução das fundações',
      type: 'sapata',
      componentId: 'component_fundacao',
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'blueprint',
        evidence: 'foundation',
        materials: ['pedra'],
        tools: ['pa'],
      },
    });

    const plan = planPhysicalExecutionV2({
      scene: scene(op.id),
      stage: stage('escavar e assentar cada fundação', 'pa'),
      operation: op,
      worldStateBefore: official,
      beforePercentage: 0,
      materialUse: { pedra: 24 },
    });
    const receipt = simulatePhysicalExecution(official, plan);

    expect(plan.intent.methodId).toBe('native:excavate');
    expect(plan.nodes.some(node =>
      node.kind === 'DIG'
      && node.toolId === 'shovel'
      && node.effects.some(effect =>
        effect.type === 'SURFACE_REMOVED'
        && effect.materialId === 'terra',
      ),
    )).toBe(true);
    expect(receipt.validation.ok).toBe(true);
  });

  it('plans cut-and-assemble as separate cutting and placement beats', () => {
    const official = world();
    const op = operation({
      id: 'op_vigas',
      name: 'Estrutura da cobertura',
      type: 'viga',
      componentId: 'component_vigas',
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'blueprint',
        evidence: 'roof beams',
        materials: ['madeira'],
        tools: ['serra'],
      },
    });

    const plan = planPhysicalExecutionV2({
      scene: scene(op.id),
      stage: stage('cortar, elevar e encaixar as vigas de cobertura', 'serra'),
      operation: op,
      worldStateBefore: official,
      beforePercentage: 0,
      materialUse: { madeira: 15 },
    });
    const receipt = simulatePhysicalExecution(official, plan);

    expect(plan.intent.methodId).toBe('native:cut_and_assemble');
    expect(plan.nodes.some(node => node.kind === 'CUT')).toBe(true);
    expect(plan.nodes.some(node =>
      node.kind === 'PLACE'
      && !node.toolId
      && node.effects.some(effect => effect.type === 'COMPONENT_ATTACHED'),
    )).toBe(true);
    expect(receipt.validation.ok).toBe(true);
  });

  it('surfaces an incompatible tool instead of hiding an impossible excavation', () => {
    const official = world();
    const op = operation({
      id: 'op_bad_excavation',
      name: 'Escavação controlada',
      type: 'fundação',
      componentId: 'component_fundacao',
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'blueprint',
        evidence: 'bad tool test',
        materials: [],
        tools: ['martelo'],
      },
    });

    const plan = planPhysicalExecutionV2({
      scene: scene(op.id),
      stage: stage('escavar o solo por quadrantes', 'martelo'),
      operation: op,
      worldStateBefore: official,
      beforePercentage: 0,
    });
    const receipt = simulatePhysicalExecution(official, plan);

    expect(receipt.validation.ok).toBe(false);
    expect(receipt.validation.issues.some(issue =>
      issue.code === 'TOOL_NODE_INCOMPATIBLE'
      || issue.code === 'TOOL_EFFECT_INCOMPATIBLE'
      || issue.code === 'TOOL_MATERIAL_INCOMPATIBLE',
    )).toBe(true);
  });

  it('builds provider-neutral filmable instructions without a candidate state', () => {
    const official = world();
    const op = operation({
      id: 'op_preparacao',
      name: 'Preparação seletiva do local',
      type: 'limpeza',
      componentId: 'component_preparacao',
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'blueprint',
        evidence: 'preparation',
        materials: [],
        tools: ['facao'],
      },
    });
    const plan = planPhysicalExecutionV2({
      scene: scene(op.id),
      stage: stage(
        'delimitar a implantação e remover somente obstáculos autorizados',
        'facao',
      ),
      operation: op,
      worldStateBefore: official,
      beforePercentage: 0,
    });
    const receipt = simulatePhysicalExecution(official, plan);
    const artifact = compileProviderNeutralPromptArtifact(plan, receipt);

    expect(artifact.executionBeats.some(beat =>
      /Cut\/scrape only the bounded current patch/.test(beat.instruction),
    )).toBe(true);
    expect(artifact.canonicalProgress).toEqual({
      beforePercentage: 0,
      targetPercentage: 25,
      tolerancePercentage: 0,
    });
    expect(artifact.physicalProgress).toBeUndefined();
  });
});
