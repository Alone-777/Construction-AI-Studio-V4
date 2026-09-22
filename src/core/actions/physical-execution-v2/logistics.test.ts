import { describe, expect, it } from 'vitest';
import { logisticsExample } from './logistics-fixtures';
import {
  planPhysicalExecutionV2, simulatePhysicalExecution, compileProviderNeutralPromptArtifact,
  compileAdobeFireflyVideoPromptV2, compileLogisticsShadowPrompt, evaluateLogisticsPreflight,
} from './index';
import type { EquipmentLogisticsPlan } from './logistics-types';
import { compileLogisticsSourcePreparation } from '../../image-prompts/canonical-image-prompt-compiler';

function run(example = logisticsExample()) {
  const plan = planPhysicalExecutionV2(example.input);
  const receipt = simulatePhysicalExecution(example.world, plan);
  return { ...example, plan, receipt, logistics: plan.equipmentLogisticsPlan!, preflight: receipt.logisticsPreflight! };
}
const codes = (plan: EquipmentLogisticsPlan) => evaluateLogisticsPreflight(plan).issues.map(issue => issue.code);

describe('V2 equipment/logistics shadow', () => {
  it('plans a traced stock → pickup → carry → position → fasten → release chain', () => {
    const result = run();
    expect(result.preflight.status).toBe('READY');
    expect(result.receipt.validation.ok).toBe(true);
    const movement = result.logistics.movements.find(item => item.resourceKey === 'material:madeira')!;
    expect(movement.method).toBe('HAND_CARRY');
    expect(movement.requiredWorkers).toBe(1);
    expect(movement.transportRoute).toEqual(['STOCK', 'WORK']);
    expect(movement.steps.map(step => step.kind)).toEqual(['APPROACH', 'GRIP', 'LIFT', 'MOVE_MATERIAL', 'POSITION', 'FASTEN', 'RELEASE']);
    expect(result.preflight.projection?.resources.find(item => item.resourceKey === 'material:madeira')).toEqual({
      resourceKey: 'material:madeira', location: 'WORK', state: 'INCORPORATED', remainingAtSource: 9,
    });
    expect(result.preflight.projection?.transitions.some(t => t.state === 'CARRIED')).toBe(true);
  });

  it('walks to a located tool and does not require all tools spread across the work area', () => {
    const { logistics } = run();
    const movement = logistics.movements.find(m => m.resourceKey === 'tool:hammer')!;
    expect(movement.steps[0]).toMatchObject({ kind: 'APPROACH', zoneId: 'STOCK' });
    expect(movement.steps[1].kind).toBe('ACQUIRE_TOOL');
    expect(logistics.area?.layout).toBe('COMPACT_STAGING_POINT');
  });

  it('does not pick up another copy when the tool is already held; frees hands for material', () => {
    const example = logisticsExample();
    example.world.character.currentTool = 'martelo';
    // Rebuild source revision after changing OFFICIAL.
    const plan = planPhysicalExecutionV2(example.input);
    const movement = plan.equipmentLogisticsPlan!.movements[0];
    expect(movement.method).toBe('ALREADY_HELD');
    expect(movement.steps.map(s => s.kind)).toEqual(['APPROACH', 'PLACE', 'RELEASE']);
  });

  it('inventory alone never proves source-image readiness', () => {
    const { preflight, receipt } = run(logisticsExample({ observed: false }));
    expect(preflight.status).toBe('PREP_REQUIRED');
    expect(preflight.preparation.resourceKeys).toContain('tool:hammer');
    expect(receipt.validation.ok).toBe(true);
  });

  it.each(['ABSENT', 'UNKNOWN'] as const)('requires source preparation for %s stock', visibility => {
    const example = logisticsExample();
    example.input.logisticsContext.sourceEvidence!.observations[1].visibility = visibility;
    expect(run(example).preflight.status).toBe('PREP_REQUIRED');
  });

  it('accepts documented offscreen stock only with continuous verified entry route', () => {
    const example = logisticsExample();
    const observation = example.input.logisticsContext.sourceEvidence!.observations[1];
    observation.visibility = 'OFFSCREEN_ACCESSIBLE';
    observation.entryRoute = ['STOCK', 'WORK'];
    expect(run(example).preflight.status).toBe('READY');
    observation.entryRoute = ['UNREGISTERED', 'WORK'];
    expect(run(example).preflight.status).toBe('PREP_REQUIRED');
  });

  it.each(['frameId', 'frameHash', 'officialRevision'] as const)('rejects stale source evidence: %s', field => {
    const example = logisticsExample();
    example.input.logisticsContext.sourceEvidence![field] = 'stale';
    expect(run(example).preflight.status).not.toBe('READY');
  });

  it('does not count a duplicated worker observation twice', () => {
    const example = logisticsExample({ workerCount: 2, profile: { loadClass: 'TEAM', sizeClass: 'LONG', heightClass: 'GROUND' } });
    const evidence = example.input.logisticsContext.sourceEvidence!;
    evidence.workers[1] = { ...evidence.workers[0] };
    expect(run(example).preflight.issues.some(i => i.code === 'LOGISTICS_WORKERS_NOT_OBSERVED')).toBe(true);
  });

  it('does not count a worker in a nonexistent zone as available at work', () => {
    const example = logisticsExample();
    example.input.logisticsContext.sourceEvidence!.workers[0].zoneId = 'UNKNOWN';
    expect(run(example).preflight.status).not.toBe('READY');
  });

  it('requires a source and cannot use a generic material name as physical provenance', () => {
    const example = logisticsExample();
    example.world.materials[0].origin = '';
    const result = run(example);
    expect(result.preflight.status).toBe('WOULD_BLOCK');
    expect(result.preflight.issues.map(i => i.code)).toContain('LOGISTICS_SOURCE_MISSING');
  });

  it('detects missing and unavailable tools without provisioning them', () => {
    const example = logisticsExample();
    example.world.tools[0].status = 'indisponivel';
    expect(run(example).preflight.issues.map(i => i.code)).toContain('LOGISTICS_RESOURCE_UNAVAILABLE');
    example.world.tools = [];
    expect(run(example).preflight.issues.map(i => i.code)).toContain('LOGISTICS_SOURCE_MISSING');
    expect(example.world.tools).toEqual([]);
  });

  it('does not take a tool from another worker without a handoff', () => {
    const example = logisticsExample();
    example.world.tools[0].carrier = 'builder-2';
    expect(run(example).preflight.issues.map(i => i.code)).toContain('LOGISTICS_TOOL_HANDOFF_REQUIRED');
  });

  it('does not silently select a stock lot when two origins share a material id', () => {
    const example = logisticsExample();
    example.world.materials.push({ ...example.world.materials[0], location: 'WORK' });
    expect(run(example).preflight.issues.map(i => i.code)).toContain('LOGISTICS_AMBIGUOUS_STOCK');
  });

  it('checks every material and rejects insufficient stock', () => {
    const example = logisticsExample();
    Object.assign(example.input.materialUse, { pedra: 4 });
    const result = run(example);
    expect(result.logistics.resources.some(r => r.key === 'material:pedra')).toBe(true);
    expect(result.preflight.status).toBe('WOULD_BLOCK');
    result.logistics.resources.find(r => r.key === 'material:madeira')!.quantity = 0;
    expect(codes(result.logistics)).toContain('LOGISTICS_INSUFFICIENT_STOCK');
  });

  it('requires measured or classified handling; never treats blueprint units as kg', () => {
    const result = run(logisticsExample({ profile: {} }));
    expect(result.logistics.movements[1].method).toBe('UNRESOLVED');
    expect(result.preflight.status).toBe('WOULD_BLOCK');
    expect(codes(result.logistics)).toEqual(expect.arrayContaining(['LOGISTICS_LOAD_UNKNOWN', 'LOGISTICS_SIZE_UNKNOWN', 'LOGISTICS_HEIGHT_UNKNOWN']));
  });

  it.each([NaN, Infinity, -1, 0])('rejects invalid mass %s', massKg => {
    const result = run(logisticsExample({ profile: { massKg, sizeClass: 'COMPACT', heightClass: 'GROUND' } }));
    expect(codes(result.logistics)).toContain('LOGISTICS_INVALID_HANDLING_VALUE');
  });

  it('requires two workers for a long piece even when light', () => {
    const result = run(logisticsExample({ profile: { loadClass: 'LIGHT', sizeClass: 'LONG', heightClass: 'GROUND' } }));
    expect(result.logistics.movements[1].method).toBe('TEAM_CARRY');
    expect(codes(result.logistics)).toContain('LOGISTICS_INSUFFICIENT_WORKERS');
  });

  it('supports a traced two-person transport without inventing workers', () => {
    const result = run(logisticsExample({ workerCount: 2, profile: { loadClass: 'TEAM', sizeClass: 'LONG', heightClass: 'GROUND' } }));
    expect(result.preflight.status).toBe('READY');
    expect(result.world.character.characterId).toBe('builder-1');
    expect(result.world).not.toHaveProperty('workers');
  });

  it('respects explicit three-person minimums', () => {
    const result = run(logisticsExample({ workerCount: 2, profile: { loadClass: 'LIGHT', sizeClass: 'COMPACT', heightClass: 'GROUND', minimumWorkers: 3 } }));
    expect(result.logistics.movements[1].requiredWorkers).toBe(3);
    expect(codes(result.logistics)).toContain('LOGISTICS_INSUFFICIENT_WORKERS');
  });

  it('extra workers alone cannot make a heavy beam float to the roof', () => {
    const result = run(logisticsExample({ workerCount: 4, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }));
    expect(result.logistics.movements[1].method).toBe('HOIST');
    expect(codes(result.logistics)).toContain('LOGISTICS_EQUIPMENT_MISSING');
    expect(result.preflight.projection).toBeNull();
  });

  it('requires support equipment for heavy ground transport as well', () => {
    const result = run(logisticsExample({ workerCount: 2, profile: { massKg: 80, sizeClass: 'COMPACT', heightClass: 'GROUND' } }));
    expect(result.logistics.movements[1].method).toBe('CART');
    expect(codes(result.logistics)).toContain('LOGISTICS_EQUIPMENT_MISSING');
  });

  it('accepts a documented two-worker hoist with rigging, anchor and work platform', () => {
    const result = run(logisticsExample({ workerCount: 2, equipment: true, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }));
    expect(result.preflight.status).toBe('READY');
    expect(result.logistics.movements[1].equipmentKinds).toEqual(['CART', 'HOIST', 'RIGGING', 'WORK_PLATFORM']);
    const preview = compileLogisticsShadowPrompt(compileProviderNeutralPromptArtifact(result.plan, result.receipt));
    expect(preview.prompt).toContain('no manual heavy lifting → hoist onto cart');
  });

  it.each([
    ['anchored', false, 'LOGISTICS_ANCHOR_MISSING'],
    ['capacityKg', 20, 'LOGISTICS_CAPACITY_UNVERIFIED'],
    ['reachM', 1, 'LOGISTICS_HEIGHT_ACCESS_UNVERIFIED'],
    ['ready', false, 'LOGISTICS_EQUIPMENT_SETUP_REQUIRED'],
  ] as const)('checks equipment %s', (field, value, code) => {
    const result = run(logisticsExample({ workerCount: 2, equipment: true, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }));
    Object.assign(result.logistics.resources.find(r => r.key === 'equipment:hoist')!.equipment!, { [field]: value });
    expect(codes(result.logistics)).toContain(code);
  });

  it('does not teleport setup gear from storage to the roof', () => {
    const result = run(logisticsExample({ workerCount: 2, equipment: true, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }));
    result.logistics.resources.find(r => r.key === 'equipment:hoist')!.sourceZoneId = 'STOCK';
    expect(codes(result.logistics)).toContain('LOGISTICS_EQUIPMENT_SETUP_REQUIRED');
  });

  it('does not use a destination hoist to load a heavy piece at a distant stock', () => {
    const result = run(logisticsExample({ workerCount: 2, equipment: true, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }));
    result.logistics.resources.find(r => r.key === 'material:madeira')!.sourceZoneId = 'STOCK';
    expect(codes(result.logistics)).toContain('LOGISTICS_HEAVY_LOADING_PLAN_REQUIRED');
  });

  it('distinguishes carrying at ground level from hoisting at the destination', () => {
    const result = run(logisticsExample({ workerCount: 2, equipment: true, profile: { massKg: 20, lengthM: 3, targetHeightM: 3 } }));
    const movement = result.logistics.movements[1];
    expect(movement.method).toBe('HOIST');
    expect(movement.transportMethod).toBe('TEAM_CARRY');
    expect(movement.steps.filter(step => step.kind === 'LIFT').map(step => step.zoneId)).toEqual(['STOCK', 'WORK']);
    expect(result.preflight.status).toBe('READY');
  });

  it('stages the old held tool before switching to another tool', () => {
    const example = logisticsExample();
    example.world.character.currentTool = 'pa';
    const result = run(example);
    expect(result.logistics.movements[0].resourceKey).toBe('tool:shovel');
    expect(result.logistics.movements[0].steps.map(s => s.kind)).toEqual(['APPROACH', 'PLACE', 'RELEASE']);
  });

  it('rejects blocked routes, including blocked same-zone pickups', () => {
    const example = logisticsExample();
    example.input.logisticsContext.spatialMap!.zones[0].status = 'blocked';
    expect(run(example).preflight.issues.map(i => i.code)).toContain('LOGISTICS_ROUTE_UNVERIFIED');
  });

  it('may walk through preserved zones but not explicitly restricted transit zones', () => {
    const example = logisticsExample();
    example.input.stage.preservedZones = ['STOCK'];
    expect(run(example).preflight.status).toBe('READY');
    example.input.logisticsContext.restrictedRouteZoneIds = ['STOCK'];
    expect(run(example).preflight.status).toBe('WOULD_BLOCK');
  });

  it.each(['GRIP', 'LIFT', 'MOVE_MATERIAL', 'POSITION', 'FASTEN', 'RELEASE'])('rejects omitted handling step %s', kind => {
    const { logistics } = run();
    logistics.movements[1].steps = logistics.movements[1].steps.filter(step => step.kind !== kind);
    expect(codes(logistics)).toContain('LOGISTICS_HANDLING_CHAIN_BROKEN');
  });

  it('rejects release before attachment and wrong-zone pickup', () => {
    const { logistics } = run();
    const movement = logistics.movements[1];
    [movement.steps[2], movement.steps[6]] = [movement.steps[6], movement.steps[2]];
    movement.steps[1].zoneId = 'WORK';
    expect(codes(logistics)).toEqual(expect.arrayContaining(['LOGISTICS_RELEASE_UNSUPPORTED', 'LOGISTICS_STEP_LOCATION_MISMATCH']));
  });

  it('cannot replace required fastening with simply placing the piece', () => {
    const { logistics } = run();
    logistics.movements[1].steps.find(step => step.kind === 'FASTEN')!.kind = 'PLACE';
    expect(codes(logistics)).toContain('LOGISTICS_HANDLING_CHAIN_BROKEN');
  });

  it('cannot redirect a movement to an unauthorized work zone', () => {
    const { logistics } = run();
    logistics.movements[1].destinationZoneId = 'OTHER';
    expect(codes(logistics)).toContain('LOGISTICS_UNAUTHORIZED_DESTINATION');
  });

  it('rejects invalid runtime handling classifications', () => {
    const { logistics } = run();
    Object.assign(logistics.movements[1].handling, { loadClass: 'WEIGHTLESS' });
    expect(codes(logistics)).toContain('LOGISTICS_INVALID_HANDLING_VALUE');
  });

  it('cannot treat another worker\'s tool as already held by the primary actor', () => {
    const { logistics } = run();
    logistics.resources[0].heldBy = 'builder-2';
    logistics.movements[0].method = 'ALREADY_HELD';
    expect(codes(logistics)).toContain('LOGISTICS_UNPROVEN_HELD_RESOURCE');
  });

  it('flags clips too short for the chain without inserting jobs', () => {
    const result = run();
    result.logistics.durationSeconds = 5;
    expect(codes(result.logistics)).toContain('LOGISTICS_DURATION_REQUIRES_SPLIT');
    expect(result.input.scene.stages).toHaveLength(1);
  });

  it('pins full inventory, including tools omitted by the legacy revision fingerprint', () => {
    const result = run();
    result.world.tools[0].location = 'WORK';
    const receipt = simulatePhysicalExecution(result.world, result.plan);
    expect(receipt.logisticsPreflight?.issues[0].code).toBe('LOGISTICS_STALE_OFFICIAL');
  });

  it('does not mutate OFFICIAL or change operational prompt/projection/fiscal validation', () => {
    const example = logisticsExample({ observed: false });
    const before = structuredClone(example.world);
    const result = run(example);
    const legacy = structuredClone(result.plan);
    delete legacy.equipmentLogisticsPlan;
    const legacyReceipt = simulatePhysicalExecution(example.world, legacy);
    const enhancedArtifact = compileProviderNeutralPromptArtifact(result.plan, result.receipt);
    const legacyArtifact = compileProviderNeutralPromptArtifact(legacy, legacyReceipt);
    expect(example.world).toEqual(before);
    expect(result.receipt.commitAvailable).toBe(false);
    expect(result.receipt.logisticsPreflight?.commitAvailable).toBe(false);
    expect(result.receipt.projected).toEqual(legacyReceipt.projected);
    expect(result.receipt.validation).toEqual(legacyReceipt.validation);
    expect(compileAdobeFireflyVideoPromptV2({ artifact: enhancedArtifact }).prompt)
      .toBe(compileAdobeFireflyVideoPromptV2({ artifact: legacyArtifact }).prompt);
    expect(legacyReceipt.logisticsPreflight).toBeUndefined();
  });

  it('isolates instrumentation failures from legacy success', () => {
    const result = run();
    result.plan.logisticsError = 'synthetic shadow failure';
    const receipt = simulatePhysicalExecution(result.world, result.plan);
    expect(receipt.validation.ok).toBe(true);
    expect(receipt.logisticsPreflight?.status).toBe('WOULD_BLOCK');
    expect(receipt.commitAvailable).toBe(false);
  });

  it('uses safe diagnostic prompts with complete handling and budget refusal, not truncation', () => {
    const result = run();
    const artifact = compileProviderNeutralPromptArtifact(result.plan, result.receipt);
    const preview = compileLogisticsShadowPrompt(artifact);
    expect(preview.prompt).toContain('grip → lift → carry → position');
    expect(preview.prompt).toContain('SHADOW');
    expect(preview.generationAuthorized).toBe(false);
    expect(preview.characterCount).toBeLessThanOrEqual(1800);
    expect(compileLogisticsShadowPrompt(artifact, 150).reason).toBe('LOGISTICS_PROMPT_REQUIRES_SPLIT');
    artifact.retryCorrections = [{ code: 'REQUIRED_FIX', correction: 'Do not drop this handling correction. '.repeat(100) }];
    expect(compileLogisticsShadowPrompt(artifact).prompt).toBeNull();
  });

  it('never emits a usable diagnostic prompt from unverified readiness', () => {
    const result = run(logisticsExample({ observed: false }));
    const artifact = compileProviderNeutralPromptArtifact(result.plan, result.receipt);
    expect(compileLogisticsShadowPrompt(artifact).prompt).toBeNull();
    artifact.logisticsShadow!.preflight.status = 'READY';
    expect(compileLogisticsShadowPrompt(artifact).prompt).toBeNull();
  });

  it('proposes an initial compact point only for registered stock; never edits an approved continuation', () => {
    const result = run(logisticsExample({ observed: false }));
    const initial = compileLogisticsSourcePreparation(result.logistics, result.preflight, 'INITIAL_SOURCE');
    expect(initial.candidateImageInstruction).toContain('hammer, madeira');
    expect(initial.requiresReview).toBe(true);
    expect(initial.changesOfficial).toBe(false);
    const later = compileLogisticsSourcePreparation(result.logistics, result.preflight, 'CONTINUATION');
    expect(later.candidateImageInstruction).toBeNull();
    expect(later.actions.join(' ')).toContain('Retain the exact last approved frame');
    result.logistics.resources[0].registered = false;
    expect(compileLogisticsSourcePreparation(result.logistics, result.preflight, 'INITIAL_SOURCE').candidateImageInstruction).not.toContain('hammer');
  });
});
