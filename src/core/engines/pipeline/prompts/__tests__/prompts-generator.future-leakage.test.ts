import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PromptsGeneratorStage } from '../PromptsGenerator';
import type { PipelineContext, StageResult } from '../../types';
import type { Operation, Scene, Stage, ValidationResult, JumpRisk } from '../../../../types/scene';
import type { WorldState } from '../../../../types';
import type { ProjectDNA } from '../../../../types/project';
import type { SpatialMap } from '../../../../types/spatial';
import type { Orientation } from '../../../../types/spatial';
import type { Character } from '../../../../types/character';
import type { Camera } from '../../../../types/camera';
import type { QualityScore } from '../../../../types/quality';
import type { ConstructionRule } from '../../../../types/construction';
import type { Project } from '../../../../types/project';
import type { ConstructionStateSnapshot } from '../../../../types/construction-state';
import type { VisualDNA } from '../../../../types/project';
import type { BlueprintMaterialStock, BlueprintToolStock, BlueprintOperation, ConstructionBlueprint } from '../../../../engines/project-orchestrator';
import type { ConstructionTimeline, ConstructionTimelineFrame } from '../../../../types/construction-timeline';
import { DEFAULT_CHARACTER } from '../../../../types/character';

// Helper to create minimal valid context
function createMinimalContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  // Default worldState for buildMinimalVisualDNA
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
    operations: [],
    materials: [] as BlueprintMaterialStock[],
    tools: [] as BlueprintToolStock[],
    protectedZoneIds: [],
    restrictions: [],
    permanentObjects: [],
    forbiddenElements: [],
    rules: [] as ConstructionRule[],
  };
  const operation: Operation = {
    id: 'op-1',
    name: 'Wall',
    type: 'construction',
    componentId: 'walls',
    elements: ['walls'],
    zones: ['zone-1'],
    stages: [0, 25, 50, 75, 100],
    topology: 'AREA',
    estimatedDuration: 10,
    scenes: ['scene-1'],
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
      zones: [{
        id: 'zone-1',
        name: 'Work Zone',
        type: 'AREA',
        shape: 'rectangle',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        status: 'active',
        adjacentZones: [],
        occluded: false,
      }],
      width: 100,
      height: 100,
      orientation: { front: 'north', back: 'south', left: 'west', right: 'east', center: 'center' },
      gridSize: 10,
    } as SpatialMap,
    worldState: defaultWorldState,
    operations: [operation],
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

  const before = createWorldState('STAGE_BEFORE');
  const after = createWorldState('STAGE_AFTER');

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
    worldStateBefore: before,
    worldStateAfter: after,
    physicalActionIR: {
      id: 'physical-action:scene-1:op-1:50',
      sceneId: 'scene-1',
      stageId: '50',
      operationId: 'op-1',
      primaryAction: { type: 'FASTEN', verb: 'build', description: 'build Wall' },
      actor: { characterId: 'builder_01' },
      target: { id: 'walls', label: 'Wall', elements: ['walls'] },
      zone: 'zone-1',
      tools: ['hammer'],
      materials: ['concrete'],
      preconditions: ['foundation exists'],
      expectedEffects: {
        constructionProgress: { before: 50, after: 50 },
        targetStatus: { before: 'PARTIAL', after: 'PARTIAL' },
        actorZone: { before: 'zone-1', after: 'zone-1' },
        materialQuantityChanges: [],
        newlyCompletedComponents: [],
        newlyPartialComponents: [],
      },
      before: {
        targetStatus: 'PARTIAL',
        constructionProgress: 50,
        actorZone: 'zone-1',
        materialQuantities: { concrete: 10 },
      },
      after: {
        targetStatus: 'PARTIAL',
        constructionProgress: 50,
        actorZone: 'zone-1',
        materialQuantities: { concrete: 10 },
      },
      constraints: {
        preserveActorId: 'builder_01',
        allowedZone: 'zone-1',
        preserveComponents: ['foundation'],
        preserveZones: [],
        forbiddenFutureComponents: ['roof'],
        preventPrematureElements: ['roof'],
      },
      evidence: ['wall built'],
    },
    decision: {
      action: 'EXECUTE_OPERATION',
      operationId: 'op-1',
      reason: 'committed stage fixture',
      confidence: 1,
    },
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
    // Marker to identify future state
    [marker]: true,
  } as WorldState & Record<string, boolean>;
}

describe('PromptsGeneratorStage - Future Leakage Prevention', () => {
  let generator: PromptsGeneratorStage;

  beforeEach(() => {
    generator = new PromptsGeneratorStage();
  });

  describe('worldStateBefore mandatory - no fallback to context.worldState', () => {
    it('fails explicitly when stage.worldStateBefore is missing', () => {
      const futureWorldState = createWorldState('FUTURE_STATE_MARKER');
      const stage = createStage({ worldStateBefore: undefined }); // Missing!
      const scene = createSceneWithStages([stage]);

      const context = createMinimalContext({
        scenes: [scene],
        worldState: futureWorldState, // This has the FUTURE_STATE_MARKER
      });

      const result = generator.execute(context);

      // Must fail because worldStateBefore is required
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('worldStateBefore');
      expect(result.error?.message).toContain('stage');
    });

    it('does not use context.worldState as fallback even when it contains future marker', () => {
      const futureWorldState = createWorldState('FUTURE_STATE_MARKER');
      const stage = createStage({ worldStateBefore: undefined }); // Intentionally missing
      const scene = createSceneWithStages([stage]);

      const context = createMinimalContext({
        scenes: [scene],
        worldState: futureWorldState, // Contains FUTURE_STATE_MARKER
      });

      const result = generator.execute(context);

      // Must fail - no fallback to context.worldState allowed
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('worldStateBefore');
    });

    it('uses stage.worldStateBefore when present, ignoring context.worldState', () => {
      const futureWorldState = createWorldState('FUTURE_STATE_MARKER');
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage = createStage({ worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage]);

      const context = createMinimalContext({
        scenes: [scene],
        worldState: futureWorldState, // Has FUTURE_STATE_MARKER
      });

      const result = generator.execute(context);

      expect(result.success).toBe(true);
      // Verify the prompt was generated from pastWorldState, not futureWorldState
      const visualPrompt = scene.stages[0].prompts?.visual;
      expect(visualPrompt).toBeDefined();
      // The prompt should not contain the future marker
      expect(visualPrompt).not.toContain('FUTURE_STATE_MARKER');
    });
  });

  describe('no future decision data in visual prompt', () => {
    it('does not include future timeline data in visual prompt', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage = createStage({ worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage]);

      const futureTimeline: ConstructionTimeline = {
        id: 'timeline-1',
        projectId: 'project-1',
        frames: [
          {
            id: 'FUTURE_TIMELINE_MARKER',
            sceneId: 'scene-1',
            progress: 100,
            state: {
              sceneId: 'scene-1',
              progress: 100,
              completedElements: [],
              activeElements: [],
              pendingElements: [],
              materialState: { available: [], consumed: [], remaining: [] },
              workerState: { position: 'zone-1', action: 'idle', tools: [] },
              environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
              createdAt: new Date(),
            },
            visualChanges: { added: [], removed: [], modified: [] },
            createdAt: new Date(),
          }
        ] as ConstructionTimelineFrame[],
        currentFrameId: 'FUTURE_TIMELINE_MARKER',
        createdAt: new Date(),
      };

      const validConstructionState: ConstructionStateSnapshot = {
        sceneId: 'scene-1',
        progress: 50,
        completedElements: [],
        activeElements: [],
        pendingElements: [],
        materialState: { available: [], consumed: [], remaining: [] },
        workerState: { position: 'zone-1', action: 'idle', tools: [] },
        environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
        createdAt: new Date(),
      };

      const context = createMinimalContext({
        scenes: [scene],
        project: {
          id: 'project-1',
          name: 'Test Project',
          timeline: futureTimeline,
          dna: {} as ProjectDNA,
          visualDNA: {} as VisualDNA,
          constructionState: validConstructionState,
          worldState: {} as WorldState,
          spatialMap: {} as SpatialMap,
          dependencyGraph: { nodes: [], edges: [] },
          operations: [],
          scenes: [],
          storyboard: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // status: 'setup', // removed in #5D
        },
      });

      const result = generator.execute(context);

      expect(result.success).toBe(true);
      const visualPrompt = scene.stages[0].prompts?.visual;
      expect(visualPrompt).toBeDefined();
      expect(visualPrompt).not.toContain('FUTURE_TIMELINE_MARKER');
    });

    it('does not include future simulation data in visual prompt', () => {
      const pastWorldState = createWorldState('PAST_STATE_MARKER');
      const stage = createStage({ worldStateBefore: pastWorldState });
      const scene = createSceneWithStages([stage]);

      const futureSimulation = {
        lastOperationId: 'op-1',
        lastResult: {
          success: true,
          state: {
            sceneId: 'scene-1',
            progress: 50,
            completedElements: [],
            activeElements: [],
            pendingElements: [],
            materialState: { available: [], consumed: [], remaining: [] },
            workerState: { position: 'zone-1', action: 'idle', tools: [] },
            environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
            createdAt: new Date(),
          },
          events: [],
          timelineFrameId: 'frame-1',
        },
        lastEvents: [] as import('../../../../types/construction-simulation').SimulationEvent[],
        currentOperationId: 'FUTURE_SIMULATION_MARKER',
        pendingOperations: ['FUTURE_SIMULATION_MARKER'],
        completedOperations: [],
        failedOperations: [],
      } satisfies NonNullable<import('../../../../types/project').Project['simulation']>;

      const validConstructionState: ConstructionStateSnapshot = {
        sceneId: 'scene-1',
        progress: 50,
        completedElements: [],
        activeElements: [],
        pendingElements: [],
        materialState: { available: [], consumed: [], remaining: [] },
        workerState: { position: 'zone-1', action: 'idle', tools: [] },
        environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
        createdAt: new Date(),
      };

      const context = createMinimalContext({
        scenes: [scene],
        project: {
          id: 'project-1',
          name: 'Test Project',
          simulation: futureSimulation,
          dna: {} as ProjectDNA,
          visualDNA: {} as VisualDNA,
          constructionState: validConstructionState,
          worldState: {} as WorldState,
          spatialMap: {} as SpatialMap,
          dependencyGraph: { nodes: [], edges: [] },
          operations: [],
          scenes: [],
          storyboard: [],
          timeline: {
            id: 'timeline-1',
            projectId: 'project-1',
            frames: [] as ConstructionTimelineFrame[],
            currentFrameId: '',
            createdAt: new Date(),
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // status: 'setup', // removed in #5D
        },
      });

      const result = generator.execute(context);

      expect(result.success).toBe(true);
      const visualPrompt = scene.stages[0].prompts?.visual;
      expect(visualPrompt).toBeDefined();
      expect(visualPrompt).not.toContain('FUTURE_SIMULATION_MARKER');
    });
  });
});
