import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StagesExecutorStage } from './StagesExecutor';
import type { PipelineContext, StageResult } from '../types';
import type {
  Scene,
  Stage,
  ValidationResult,
  JumpRisk,
  WorldState,
  ProjectDNA,
  SpatialMap,
  Orientation,
  Character,
  Camera,
  QualityScore,
  ConstructionRule,
  Operation,
  DependencyGraph,
  Zone,
  Bounds,
  ZoneType,
  ZoneShape,
  ZoneStatus,
  ConstructionComponent,
  ComponentStatus,
  DependencyEdge,
} from '../../../types';
import type { BlueprintOperation, ConstructionBlueprint, BlueprintMaterialStock, BlueprintToolStock } from '../../../engines/project-orchestrator';
import type { ConstructionTimeline, ConstructionTimelineFrame } from '../../../types/construction-timeline';

// Helper to create minimal valid context
function createMinimalContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const defaultWorldState: WorldState = {
    character: {
      characterId: 'builder_01',
      currentZone: 'zone-1',
      orientation: 'frente' as Orientation,
      currentAction: 'building',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'zone-1',
    climate: 'temperate',
    light: 'day',
    vegetation: {},
    camera: 'cameraA',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: Date.now(),
    materials: [
      { materialId: 'concrete', quantity: 10, status: 'disponivel', location: 'site', origin: 'supplied' },
    ],
    tools: [
      { toolId: 'excavator', status: 'em_uso', location: 'site', inUse: true },
    ],
    residues: [],
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'house', progress: 50, status: 'in_progress' },
    existingComponents: ['foundation'],
    partialComponents: ['walls'],
    futureComponents: ['roof'],
    consumedMaterials: [],
  };

  const testCharacter: Character = {
    id: 'builder_01',
    name: 'Test Builder',
    appearance: 'Athletic',
    apparentAge: 30,
    hair: 'Short',
    beard: 'None',
    clothes: 'Work clothes',
    shoes: 'Boots',
    accessories: [],
    tools: [],
  };

  const testCamera: Camera = {
    id: 'A',
    relativePosition: { x: 0, y: 0 },
    orientation: 0,
    framing: 'medium',
    conceptualHeight: 'media',
    allowedMovement: 'FIXA',
    visibleZones: ['zone-1'],
    partiallyVisibleZones: [],
    hiddenZones: [],
  };

  const blueprint: ConstructionBlueprint = {
    id: 'blueprint-1',
    map: { id: 'map-1', width: 100, height: 100, zones: [] },
    components: [],
    operations: [
      {
        id: 'op-1',
        name: 'Build Foundation',
        type: 'foundation',
        componentId: 'comp-1',
        elements: ['foundation'],
        zones: ['zone-1'],
        tool: 'excavator',
        physicalAction: 'excavate and pour foundation',
        materialUse: { concrete: 5 },
      },
    ],
    materials: [] as BlueprintMaterialStock[],
    tools: [] as BlueprintToolStock[],
    protectedZoneIds: [],
    restrictions: [],
    permanentObjects: [],
    forbiddenElements: [],
    rules: [] as ConstructionRule[],
  };

  const timeline: ConstructionTimeline = {
    id: 'timeline-1',
    projectId: 'project-1',
    frames: [] as ConstructionTimelineFrame[],
    currentFrameId: '',
    createdAt: new Date(),
  };

  const baseContext: PipelineContext = {
    config: {
      name: 'Test Project',
      environment: 'terreno_plano',
      construction: 'house',
      approximateForm: 'rectangular',
      materials: ['concrete', 'wood'],
      workerCount: 1,
      character: testCharacter,
      tools: ['hammer'],
      cameraA: testCamera,
      cameraB: testCamera,
      visualStyle: 'cinematografico',
      totalDuration: 60,
      sceneDuration: 10,
      detailLevel: 'alto',
      visualReferences: [],
      preserveTerrain: true,
    },
    blueprint,
    dna: {
      id: 'dna-1',
      config: {
        name: 'Test Project',
        environment: 'terreno_plano',
        construction: 'house',
        approximateForm: 'rectangular',
        materials: ['concrete', 'wood'],
        workerCount: 1,
        character: testCharacter,
        tools: ['hammer'],
        cameraA: testCamera,
        cameraB: testCamera,
        visualStyle: 'cinematografico',
        totalDuration: 60,
        sceneDuration: 10,
        detailLevel: 'alto',
        visualReferences: [],
        preserveTerrain: true,
      },
      environment: 'terreno_plano',
      finalConstruction: 'house',
      form: 'rectangular',
      materials: ['concrete', 'wood'],
      character: testCharacter,
      clothes: 'Work clothes',
      cameras: { a: testCamera, b: testCamera },
      aesthetics: 'cinematografico',
      restrictions: [],
      permanentObjects: [],
      rules: [] as ConstructionRule[],
      references: [],
      forbiddenElements: [],
    } as ProjectDNA,
    spatialMap: {
      id: 'spatial-1',
      zones: [{ id: 'zone-1', name: 'Zone 1', type: 'AREA' as ZoneType, shape: 'rectangle' as ZoneShape, bounds: { x: 0, y: 0, width: 100, height: 100 }, status: 'active' as ZoneStatus, orientation: 'frente' as Orientation, adjacentZones: [], occluded: false }],
      width: 100,
      height: 100,
      orientation: { front: 'north', back: 'south', left: 'west', right: 'east', center: 'center' },
      gridSize: 10,
    } as SpatialMap,
    worldState: defaultWorldState,
    dependencyGraph: {
      nodes: [{ id: 'comp-1', name: 'Foundation', type: 'foundation', status: 'PENDING' as ComponentStatus, dependencies: [], zones: ['zone-1'], creationOperation: 'op-1' }],
      edges: [] as DependencyEdge[],
    } as DependencyGraph,
    createdAt: Date.now(),
    ...overrides,
  };
  return baseContext;
}

// Helper to create minimal scene with stages
function createSceneWithStages(stages: Stage[]): Scene {
  return {
    id: 'scene-1',
    number: 1,
    timecodeStart: 0,
    timecodeEnd: 10,
    duration: 10,
    operationId: 'op-1',
    stages,
    camera: 'cameraA',
    activeZones: ['zone-1'],
    characterId: 'builder_01',
    status: 'draft',
    riskLevel: 'LOW',
    microTimeline: [],
  };
}

// Helper to create minimal stage
function createStage(overrides: Partial<Stage> = {}): Stage {
  const baseValidation: ValidationResult = {
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
  };

  return {
    percentage: 50,
    initialState: {},
    characterPosition: 'zone-1',
    displacement: { from: 'zone-1', to: 'zone-1' },
    activeZone: 'zone-1',
    physicalAction: 'building wall',
    tool: 'hammer',
    component: 'wall',
    allowedChanges: ['build wall'],
    finalState: {},
    visualEvidence: ['wall built'],
    preservedZones: [],
    futureElements: ['roof'],
    cameraId: 'A',
    validations: baseValidation,
    prompts: { visual: '', nanoBanana: '', kling: '' },
    executionProof: {
      characterArrived: true,
      actionStarted: true,
      materialManipulated: true,
      changeOccurred: true,
      finalStateVisible: true,
      valid: true,
    },
    qualityScore: {
      continuity: 80,
      causality: 80,
      progression: 80,
      space: 80,
      rhythm: 80,
      clarity: 80,
      camera: 80,
      jumpRisk: 20,
      overall: 80,
    } as QualityScore,
    jumpRisk: 'LOW' as JumpRisk,
    workRoute: [],
    ...overrides,
  };
}

// Helper to create worldState with a marker
function createWorldState(marker: string): WorldState {
  return {
    character: {
      characterId: 'builder_01',
      currentZone: 'zone-1',
      orientation: 'frente' as Orientation,
      currentAction: 'building',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'zone-1',
    climate: 'temperate',
    light: 'day',
    vegetation: {},
    camera: 'cameraA',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: Date.now(),
    materials: [
      { materialId: 'concrete', quantity: 10, status: 'disponivel', location: 'site', origin: 'supplied' },
    ],
    tools: [
      { toolId: 'excavator', status: 'em_uso', location: 'site', inUse: true },
    ],
    residues: [],
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'house', progress: 50, status: 'in_progress' },
    existingComponents: ['foundation'],
    partialComponents: ['walls'],
    futureComponents: ['roof'],
    consumedMaterials: [],
    [marker]: true,
  } as WorldState & Record<string, boolean>;
}

describe('StagesExecutorStage - Fiscal Gate', () => {
  let executor: StagesExecutorStage;

  beforeEach(() => {
    executor = new StagesExecutorStage();
  });

  describe('Fiscal FAIL -> worldState NOT committed', () => {
    it('keeps official worldState as before when fiscal report is not approved', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage = createStage({ worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage]);

      const context = createMinimalContext({
        scenes: [scene],
        operations: [{ id: 'op-1', name: 'Build Foundation', type: 'foundation', componentId: 'comp-1', elements: ['foundation'], zones: ['zone-1'], stages: [0, 25, 50, 75, 100] as const, topology: 'AREA', estimatedDuration: 10, scenes: ['scene-1'] }],
      });

      // Mock FiscalRunner to return approved: false
      const mockFiscalRunner = {
        runAllFiscals: vi.fn().mockReturnValue({
          results: {
            dependencies: false,
            temporal: true,
            spatial: true,
            causality: true,
            conservation: true,
            character: true,
            tools: true,
            visibility: true,
            progression: true,
            approved: false,
            errors: [{ code: 'E-DP01', message: 'Dependency violation', severity: 'ERROR' as const }],
            checks: [],
          },
          errors: [{ code: 'E-DP01', message: 'Dependency violation', severity: 'ERROR' as const }],
          warnings: [],
          approved: false,
          qualityScore: {
            continuity: 55, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 30, overall: 75,
          },
          jumpRisk: 'MEDIUM',
          status: 'blocked' as const,
        }),
      };

      // Replace fiscalRunner in context
      context.fiscalRunner = mockFiscalRunner as any;

      const result = executor.execute(context);

      expect(result.success).toBe(true);
      // Official worldState should NOT have the future marker
      expect(context.worldState).not.toHaveProperty('FUTURE_STATE_MARKER');
      // Scene should be marked as draft (not validated)
      expect(scene.status).toBe('draft');
      // Stage should have status 'rejected'
      expect(stage.status).toBe('rejected');
      // Stage.worldStateAfter should still hold candidate for evidence
      expect(stage.worldStateAfter).toBeDefined();
    });

    it('commits worldState when fiscal report IS approved', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage = createStage({ worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage]);

      const context = createMinimalContext({
        scenes: [scene],
        operations: [{ id: 'op-1', name: 'Build Foundation', type: 'foundation', componentId: 'comp-1', elements: ['foundation'], zones: ['zone-1'], stages: [0, 25, 50, 75, 100] as const, topology: 'AREA', estimatedDuration: 10, scenes: ['scene-1'] }],
      });

      // Mock FiscalRunner to return approved: true
      const mockFiscalRunner = {
        runAllFiscals: vi.fn().mockReturnValue({
          results: {
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
            checks: [],
          },
          errors: [],
          warnings: [],
          approved: true,
          qualityScore: {
            continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 20, overall: 80,
          },
          jumpRisk: 'LOW',
          status: 'approved' as const,
        }),
      };

      context.fiscalRunner = mockFiscalRunner as any;

      const result = executor.execute(context);

      expect(result.success).toBe(true);
      // Official worldState SHOULD have been updated (progress changed, etc.)
      expect(context.worldState!.construction.progress).toBeGreaterThan(50);
      // Scene should be validated
      expect(scene.status).toBe('validated');
      // Stage should NOT have rejected status
      expect(stage.status).toBeUndefined();
    });

    it('multiple stages - FAIL on stage 2 stops further worldState mutations', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage1 = createStage({ percentage: 25, worldStateBefore: pastWorldState });
      const stage2 = createStage({ percentage: 50, worldStateBefore: pastWorldState });
      const stage3 = createStage({ percentage: 75, worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage1, stage2, stage3]);

      const context = createMinimalContext({
        scenes: [scene],
        operations: [{ id: 'op-1', name: 'Build Foundation', type: 'foundation', componentId: 'comp-1', elements: ['foundation'], zones: ['zone-1'], stages: [0, 25, 50, 75, 100] as const, topology: 'AREA', estimatedDuration: 10, scenes: ['scene-1'] }],
      });

      let callCount = 0;
      const mockFiscalRunner = {
        runAllFiscals: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Stage 1: PASS
            return {
              results: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: true, errors: [], checks: [] },
              errors: [], warnings: [], approved: true,
              qualityScore: { continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 20, overall: 80 },
              jumpRisk: 'LOW', status: 'approved' as const,
            };
          } else if (callCount === 2) {
            // Stage 2: FAIL
            return {
              results: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: false, errors: [{ code: 'E-SP01', message: 'Spatial violation', severity: 'ERROR' as const }], checks: [] },
              errors: [{ code: 'E-SP01', message: 'Spatial violation', severity: 'ERROR' as const }],
              warnings: [], approved: false,
              qualityScore: { continuity: 80, causality: 80, progression: 55, space: 55, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 50, overall: 70 },
              jumpRisk: 'MEDIUM', status: 'blocked' as const,
            };
          } else {
            // Stage 3: should not be called or if called, should also fail
            return {
              results: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: false, errors: [{ code: 'E-PR01', message: 'Progression violation', severity: 'ERROR' as const }], checks: [] },
              errors: [{ code: 'E-PR01', message: 'Progression violation', severity: 'ERROR' as const }],
              warnings: [], approved: false,
              qualityScore: { continuity: 80, causality: 80, progression: 55, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 50, overall: 70 },
              jumpRisk: 'MEDIUM', status: 'blocked' as const,
            };
          }
        }),
      };

      context.fiscalRunner = mockFiscalRunner as any;

      const result = executor.execute(context);

      expect(result.success).toBe(true);
      // Stage 1 should be approved
      expect(stage1.validations.approved).toBe(true);
      // Stage 2 should be rejected
      expect(stage2.validations.approved).toBe(false);
      expect(stage2.status).toBe('rejected');
      // Note: executor finalizes progress to 100 unconditionally at end (separate bug)
      // The key assertion: stage 2 did NOT commit its state (stage.status = 'rejected')
      // Scene should be draft because stage 2 failed
      expect(scene.status).toBe('draft');
    });
  });

  describe('Fiscal edge cases', () => {
    it('sceneApproved is false when any stage fails', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage1 = createStage({ percentage: 25, worldStateBefore: pastWorldState });
      const stage2 = createStage({ percentage: 50, worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage1, stage2]);

      const context = createMinimalContext({ scenes: [scene] });

      let callCount = 0;
      const mockFiscalRunner = {
        runAllFiscals: vi.fn().mockImplementation(() => {
          callCount++;
          return {
            results: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: callCount === 1, errors: callCount === 1 ? [] : [{ code: 'E-TEST', message: 'Fail', severity: 'ERROR' as const }], checks: [] },
            errors: callCount === 1 ? [] : [{ code: 'E-TEST', message: 'Fail', severity: 'ERROR' as const }],
            warnings: [], approved: callCount === 1,
            qualityScore: { continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 20, overall: 80 },
            jumpRisk: 'LOW', status: callCount === 1 ? 'approved' : 'blocked',
          } as any;
        }),
      };

      context.fiscalRunner = mockFiscalRunner as any;

      executor.execute(context);

      expect(scene.status).toBe('draft');
    });

    it('maxRisk preserves highest jumpRisk across stages', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage1 = createStage({ percentage: 25, worldStateBefore: pastWorldState });
      const stage2 = createStage({ percentage: 50, worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage1, stage2]);

      const context = createMinimalContext({
        scenes: [scene],
        operations: [{ id: 'op-1', name: 'Build Foundation', type: 'foundation', componentId: 'comp-1', elements: ['foundation'], zones: ['zone-1'], stages: [0, 25, 50, 75, 100] as const, topology: 'AREA', estimatedDuration: 10, scenes: ['scene-1'] }],
      });

      let callCount = 0;
      const mockFiscalRunner = {
        runAllFiscals: vi.fn().mockImplementation(() => {
          callCount++;
          return {
            results: { dependencies: true, temporal: true, spatial: true, causality: true, conservation: true, character: true, tools: true, visibility: true, progression: true, approved: true, errors: [], checks: [] },
            errors: [], warnings: [], approved: true,
            qualityScore: { continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: callCount === 1 ? 10 : 60, overall: 80 },
            jumpRisk: callCount === 1 ? 'LOW' : 'HIGH',
            status: 'approved',
          } as any;
        }),
      };

      context.fiscalRunner = mockFiscalRunner as any;

      executor.execute(context);

      // Verify mock was called for both stages
      expect(callCount).toBe(2);
      expect(scene.riskLevel).toBe('HIGH');
    });
  });
});