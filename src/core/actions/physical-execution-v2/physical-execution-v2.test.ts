import { describe, expect, it } from 'vitest';
import type { Operation, Stage } from '../../types/scene';
import type { WorldState } from '../../types/world-state';
import {
  compileAdobeFireflyVideoPromptV2,
  physicalPlanToPromptArtifactV2,
  planStagePhysicalExecutionV2,
  simulatePhysicalExecutionV2,
  validatePhysicalExecutionPlanV2,
} from './index';

function worldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    terrain: { type: 'forest', slope: 'flat', vegetation: 'grass', soil: 'terra' },
    construction: { type: 'cabin', progress: 0, status: 'em andamento' },
    existingComponents: [],
    partialComponents: [],
    futureComponents: ['foundation', 'walls', 'roof'],
    materials: [{ materialId: 'terra', quantity: 100, status: 'disponivel', location: 'Z1', origin: 'site' }],
    consumedMaterials: [],
    residues: [],
    tools: [{ toolId: 'pa', status: 'armazenada', location: 'Z1', inUse: false }],
    character: {
      characterId: 'worker-1', currentZone: 'Z1', orientation: 'frente', currentAction: 'idle', carriedObjects: [], movementRequired: false,
    },
    activeZone: 'Z1', climate: 'clear', light: 'day', vegetation: {}, camera: 'A', temporaryObjects: [], permanentObjects: [], timestamp: 7,
    ...overrides,
  };
}

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'prepare-site', name: 'Preparação seletiva do local', type: 'preparacao', componentId: 'site-prep', elements: ['site-prep'], zones: ['Z1'],
    visualBasis: { classification: 'FACT', sourceClassification: 'FACT', sourceField: 'blueprint', evidence: 'site preparation', materials: ['terra'], tools: ['pa'] },
    stages: [0, 25, 50, 75, 100], topology: 'LINEAR', estimatedDuration: 60, scenes: ['scene-1'], ...overrides,
  };
}

function stage(overrides: Partial<Stage> = {}): Stage {
  return {
    percentage: 25, initialState: {}, characterPosition: 'Z1', activeZone: 'Z1', physicalAction: 'remover vegetação superficial com a pá', tool: 'pa', component: 'site-prep', allowedChanges: ['site-prep'], finalState: {},
    visualEvidence: ['one bounded exposed-soil patch'], preservedZones: ['Z2'], futureElements: ['foundation', 'walls', 'roof'], cameraId: 'A',
    validations: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: true, errors: [] },
    ...overrides,
  };
}

function plan(overrides: Parameters<typeof planStagePhysicalExecutionV2>[0] extends infer T ? Partial<T> : never = {}) {
  return planStagePhysicalExecutionV2({
    sceneId: 'scene-1', operation: operation(), stage: stage(), worldStateBefore: worldState(), previousStagePercentage: 0, ...overrides,
  });
}

describe('Physical Execution V2', () => {
  it('separates canonical Job progress from observable physical progress', () => {
    const result = planStagePhysicalExecutionV2({
      sceneId: 'scene-1', operation: operation(), stage: stage(), worldStateBefore: worldState(), previousStagePercentage: 0,
      observableProgress: { metric: 'AREA', from: 0, target: 12.5, unit: 'm2', tolerance: 1, confidence: 'DERIVED', basis: '50m2 work zone' },
    });
    expect(result.intent.canonicalProgress).toEqual({ fromPercent: 0, targetPercent: 25 });
    expect(result.intent.observableProgress).toMatchObject({ metric: 'AREA', from: 0, target: 12.5, unit: 'm2' });
  });

  it('builds a causal shovel plan and evaluates TOOL_HELD after GRIP sequentially', () => {
    const official = worldState();
    const sourceSnapshot = structuredClone(official);
    const result = simulatePhysicalExecutionV2({ official, plan: plan() });
    expect(result.validation.issues.some(item => item.code === 'PRECONDITION_FAILED')).toBe(false);
    expect(result.canonicalProgress.projectedPercent).toBe(25);
    expect(result.commitAvailable).toBe(false);
    expect(result.officialUnchanged).toBe(true);
    expect(official).toEqual(sourceSnapshot);
  });

  it('rejects a hammer used for excavation', () => {
    const official = worldState({ tools: [{ toolId: 'martelo', status: 'armazenada', location: 'Z1', inUse: false }] });
    const excavation = planStagePhysicalExecutionV2({
      sceneId: 'scene-1', operation: operation({ type: 'fundacao', visualBasis: { ...operation().visualBasis!, tools: ['martelo'] } }), stage: stage({ physicalAction: 'escavar o solo', tool: 'martelo' }), worldStateBefore: official, previousStagePercentage: 0,
    });
    expect(validatePhysicalExecutionPlanV2(excavation, official).issues.some(item => item.code === 'TOOL_AFFORDANCE_INVALID')).toBe(true);
  });

  it('rejects graph edges that reference missing nodes', () => {
    const p = plan();
    p.edges.push({ from: p.nodes[0].id, to: 'missing-node', relation: 'SEQUENCE' });
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'EDGE_NODE_MISSING')).toBe(true);
  });

  it('rejects removed material without a physical destination', () => {
    const p = plan();
    const effect = p.nodes.flatMap(node => node.effects).find(item => item.type === 'SURFACE_REMOVED');
    if (!effect) throw new Error('missing effect');
    effect.destinationRegionId = undefined;
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'MATERIAL_DESTINATION_MISSING')).toBe(true);
  });

  it('rejects a future component created outside the current target', () => {
    const p = plan();
    const execute = p.nodes.find(node => node.id.endsWith(':execute'))!;
    execute.effects.push({ type: 'COMPONENT_ATTACHED', componentId: 'foundation', targetId: 'foundation', sourceEntityId: 'material:wood', sourceRegionId: 'visible-material-supply', destinationRegionId: 'Z1', qualitative: true });
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'FUTURE_COMPONENT_CREATED')).toBe(true);
  });

  it('rejects progress overshoot', () => {
    const p = plan();
    const progress = p.nodes.flatMap(node => node.effects).find(item => item.type === 'PROGRESS_ADVANCED');
    if (!progress) throw new Error('missing progress');
    progress.toPercent = 50;
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'PROGRESS_OVERSHOOT')).toBe(true);
  });

  it('rejects a physical effect with no contact cause', () => {
    const p = plan();
    const execute = p.nodes.find(node => node.id.endsWith(':execute'))!;
    const contact = p.nodes.find(node => node.id.endsWith(':contact'))!;
    execute.contact = undefined;
    p.nodes = p.nodes.filter(node => node.id !== contact.id);
    p.edges = p.edges.filter(edge => edge.from !== contact.id && edge.to !== contact.id);
    const position = p.nodes.find(node => node.id.endsWith(':position'))!;
    p.edges.push({ from: position.id, to: execute.id, relation: 'SEQUENCE' });
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'EFFECT_WITHOUT_CONTACT')).toBe(true);
  });

  it('rejects physical transformation without evidence contract', () => {
    const p = plan();
    const execute = p.nodes.find(node => node.id.endsWith(':execute'))!;
    execute.evidenceIds = [];
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'EFFECT_WITHOUT_EVIDENCE')).toBe(true);
  });

  it('rejects attached components without a source', () => {
    const official = worldState({
      materials: [{ materialId: 'madeira', quantity: 10, status: 'disponivel', location: 'Z1', origin: 'supply' }],
      tools: [{ toolId: 'martelo', status: 'armazenada', location: 'Z1', inUse: false }],
    });
    const p = planStagePhysicalExecutionV2({
      sceneId: 'scene-wall', operation: operation({ id: 'wall', type: 'paredes', componentId: 'wall-1', visualBasis: { ...operation().visualBasis!, materials: ['madeira'], tools: ['martelo'] } }),
      stage: stage({ physicalAction: 'fixar parede de madeira', tool: 'martelo', component: 'wall-1' }), worldStateBefore: official, previousStagePercentage: 0,
    });
    const attach = p.nodes.flatMap(node => node.effects).find(item => item.type === 'COMPONENT_ATTACHED');
    if (!attach) throw new Error('missing attach effect');
    attach.sourceEntityId = undefined;
    attach.materialId = undefined;
    expect(validatePhysicalExecutionPlanV2(p, official).issues.some(item => item.code === 'ATTACHED_WITHOUT_SOURCE')).toBe(true);
  });

  it('rejects physical metrics that incorrectly use percent units', () => {
    const p = planStagePhysicalExecutionV2({
      sceneId: 'scene-1', operation: operation(), stage: stage(), worldStateBefore: worldState(), previousStagePercentage: 0,
      observableProgress: { metric: 'AREA', from: 0, target: 25, unit: '%', basis: 'invalid example' },
    });
    expect(validatePhysicalExecutionPlanV2(p, worldState()).issues.some(item => item.code === 'PHYSICAL_METRIC_PERCENT_MIXED')).toBe(true);
  });

  it('compiles Adobe Firefly prompts under 1800 chars without dropping retry codes', () => {
    const official = worldState();
    const p = plan();
    const simulation = simulatePhysicalExecutionV2({ official, plan: p });
    const artifact = physicalPlanToPromptArtifactV2({ plan: p, simulation });
    const compiled = compileAdobeFireflyVideoPromptV2({
      artifact, model: 'KLING_3_0', durationSeconds: 15,
      retryCorrections: [
        { code: 'TOOL_ACTION_NOT_EXECUTED', correction: 'Show repeated shovel-to-ground contact, scraping, lifting and depositing material beside the same bounded patch. '.repeat(3) },
        { code: 'INSUFFICIENT_PHYSICAL_PROGRESS', correction: 'Each stroke must enlarge one contiguous exposed-soil patch until the canonical target is visibly reached. '.repeat(3) },
      ],
    });
    expect(compiled.platform).toBe('ADOBE_FIREFLY');
    expect(compiled.characterCount).toBeLessThanOrEqual(1800);
    expect(compiled.prompt).toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(compiled.prompt).toContain('INSUFFICIENT_PHYSICAL_PROGRESS');
  });

  it('creates a non-advancing baseline plan for stage 0', () => {
    const baseline = planStagePhysicalExecutionV2({ sceneId: 'scene-1', operation: operation(), stage: stage({ percentage: 0, tool: undefined, physicalAction: 'inspecionar e marcar o local' }), worldStateBefore: worldState(), previousStagePercentage: 0 });
    expect(baseline.intent.canonicalProgress).toEqual({ fromPercent: 0, targetPercent: 0 });
    expect(baseline.nodes.some(node => node.effects.some(effect => effect.type === 'PROGRESS_ADVANCED'))).toBe(false);
    expect(simulatePhysicalExecutionV2({ official: worldState(), plan: baseline }).commitAvailable).toBe(false);
  });
});
