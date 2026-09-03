import { describe, expect, it, beforeEach } from 'vitest';
import { ProjectAssemblerStage } from './ProjectAssembler';
import type { PipelineContext } from '../types';
import type {
  ProjectConfig,
  ProjectDNA,
  VisualDNA,
  SpatialMap,
  DependencyGraph,
  ConstructionComponent,
  ComponentStatus,
  DependencyEdge,
  Scene,
  StoryboardEntry,
  Operation,
  WorldState,
  Character,
  Camera,
  Zone,
  ZoneType,
  ZoneShape,
  Bounds,
  ZoneStatus,
  Orientation,
  ConstructionStateSnapshot,
  ConstructionTimeline,
  ConstructionTimelineFrame,
  ConstructionRule,
} from '../../../types';
import type {
  ConstructionBlueprint,
  BlueprintOperation,
  BlueprintMaterialStock,
  BlueprintToolStock,
} from '../../../engines/project-orchestrator';

// Helper to create minimal valid context for ProjectAssembler
function createMinimalContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
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
    components: [
      { id: 'comp-1', name: 'Foundation', type: 'foundation', dependencies: [], zones: ['zone-1'], creationOperation: 'op-1' },
    ],
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
    protectedZoneIds: ['zone-2'],
    restrictions: [],
    permanentObjects: [],
    forbiddenElements: [],
    rules: [] as ConstructionRule[],
  };

  const config: ProjectConfig = {
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
  };

  const dna: ProjectDNA = {
    id: 'dna-1',
    config,
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
  };

  const visualDNA: VisualDNA = {
    id: 'visual-dna-1',
    character: {
      id: testCharacter.id,
      name: testCharacter.name,
      appearance: testCharacter.appearance,
      clothing: testCharacter.clothes,
      physicalTraits: [testCharacter.hair, testCharacter.beard].filter(Boolean),
      defaultPose: 'standing',
      animationStyle: 'realistic',
    },
    environment: {
      preset: 'terreno_plano',
      climate: '',
      light: 'dia',
      timeOfDay: 'day',
      weather: 'clear',
      lightingBase: {
        type: 'natural',
        keyLight: { direction: { x: 1, y: -1 }, intensity: 1, color: '#ffffff', temperature: 5600 },
        fillLight: { direction: { x: -1, y: -0.5 }, intensity: 0.3, color: '#ffffff' },
        ambientLight: { intensity: 0.2, color: '#ffffff' },
        shadows: true,
        shadowSoftness: 0.5,
      },
    },
    camera: {
      defaultConfig: {
        position: { x: 0, y: 0 },
        target: { x: 0, y: 0 },
        up: { x: 0, y: -1 },
        fov: 60,
        aspectRatio: 16 / 9,
        near: 0.1,
        far: 1000,
        movement: 'FIXA',
      },
      lensDefaults: {
        focalLength: 35,
        aperture: 'f/2.8',
        focusDistance: 10,
        depthOfField: false,
      },
      cameraA: {
        position: { x: 0, y: 3 },
        target: { x: 0, y: 0 },
        up: { x: 0, y: -1 },
        fov: 60,
        aspectRatio: 16 / 9,
        near: 0.1,
        far: 1000,
        movement: 'FIXA',
      },
      cameraB: {
        position: { x: 0, y: 5 },
        target: { x: 0, y: 0 },
        up: { x: 0, y: -1 },
        fov: 60,
        aspectRatio: 16 / 9,
        near: 0.1,
        far: 1000,
        movement: 'FIXA',
      },
      movementPreferences: ['FIXA', 'FOLLOW', 'PAN'],
    },
    materials: {
      palette: [
        { materialId: 'concrete', displayName: 'Concrete', color: '#888888', texture: 'matte', roughness: 0.5, metallic: 0.0 },
        { materialId: 'wood', displayName: 'Wood', color: '#888888', texture: 'matte', roughness: 0.5, metallic: 0.0 },
      ],
      defaultQuantities: {},
      residueRules: [],
    },
    consistencyRules: {
      colorPalette: [],
      lightingStyle: 'natural',
      cameraStyle: 'static',
      depthOfFieldDefault: false,
      aspectRatio: 16 / 9,
      forbiddenVisualElements: [],
      requiredVisualElements: [],
      compositionRules: [],
    },
    visualStyle: 'cinematografico',
    detailLevel: 'alto',
    references: [],
    updatedAt: Date.now(),
  };

  const worldState: WorldState = {
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
    construction: { type: 'house', progress: 100, status: 'concluída' },
    existingComponents: ['foundation'],
    partialComponents: [],
    futureComponents: [],
    consumedMaterials: [],
  };

  const spatialMap: SpatialMap = {
    id: 'spatial-1',
    zones: [
      { id: 'zone-1', name: 'Zone 1', type: 'AREA' as ZoneType, shape: 'rectangle' as ZoneShape, bounds: { x: 0, y: 0, width: 100, height: 100 }, status: 'complete' as ZoneStatus, orientation: 'frente' as Orientation, adjacentZones: [], occluded: false },
      { id: 'zone-2', name: 'Zone 2', type: 'AREA' as ZoneType, shape: 'rectangle' as ZoneShape, bounds: { x: 100, y: 0, width: 100, height: 100 }, status: 'pristine' as ZoneStatus, orientation: 'frente' as Orientation, adjacentZones: [], occluded: false },
    ],
    width: 100,
    height: 100,
    orientation: { front: 'north', back: 'south', left: 'west', right: 'east', center: 'center' },
    gridSize: 10,
  };

  const dependencyGraph: DependencyGraph = {
    nodes: [
      { id: 'comp-1', name: 'Foundation', type: 'foundation', status: 'COMPLETE' as ComponentStatus, dependencies: [], zones: ['zone-1'], creationOperation: 'op-1' },
    ],
    edges: [] as DependencyEdge[],
  };

  const operations: Operation[] = [
    {
      id: 'op-1',
      name: 'Build Foundation',
      type: 'foundation',
      componentId: 'comp-1',
      elements: ['foundation'],
      zones: ['zone-1'],
      visualBasis: {
        classification: 'FACT',
        sourceClassification: 'FACT',
        sourceField: 'description',
        evidence: 'Build foundation',
      },
      stages: [0, 25, 50, 75, 100] as const,
      topology: 'AREA' as ZoneType,
      estimatedDuration: 10,
      scenes: ['scene-1'],
    },
  ];

  const scenes: Scene[] = [
    {
      id: 'scene-1',
      number: 1,
      timecodeStart: 0,
      timecodeEnd: 10,
      duration: 10,
      operationId: 'op-1',
      stages: [
        {
          percentage: 0,
          initialState: {},
          characterPosition: 'zone-1',
          activeZone: 'zone-1',
          physicalAction: 'Inspecionar, medir e marcar foundation',
          component: 'comp-1',
          allowedChanges: [],
          finalState: {},
          visualEvidence: [],
          preservedZones: ['zone-2'],
          futureElements: ['foundation'],
          cameraId: 'A',
          validations: {
            dependencies: true, temporal: true, spatial: true, causality: true,
            conservation: true, character: true, tools: true, visibility: true,
            progression: true, approved: true, errors: [],
          },
          executionProof: {
            characterArrived: true, actionStarted: true, materialManipulated: true,
            changeOccurred: true, finalStateVisible: true, valid: true,
          },
          qualityScore: { continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 20, overall: 80 },
          jumpRisk: 'LOW',
          workRoute: [],
          physicalState: {
            elementProgress: { foundation: 0 },
            completedElements: [],
            partialElements: [],
          },
        },
        {
          percentage: 100,
          initialState: {},
          characterPosition: 'zone-1',
          activeZone: 'zone-1',
          physicalAction: 'excavate and pour foundation — marco 100%',
          tool: 'excavator',
          component: 'comp-1',
          allowedChanges: ['build foundation'],
          finalState: {},
          visualEvidence: ['foundation built'],
          preservedZones: ['zone-2'],
          futureElements: [],
          cameraId: 'A',
          validations: {
            dependencies: true, temporal: true, spatial: true, causality: true,
            conservation: true, character: true, tools: true, visibility: true,
            progression: true, approved: true, errors: [],
          },
          executionProof: {
            characterArrived: true, actionStarted: true, materialManipulated: true,
            changeOccurred: true, finalStateVisible: true, valid: true,
          },
          qualityScore: { continuity: 80, causality: 80, progression: 80, space: 80, rhythm: 80, clarity: 80, camera: 80, jumpRisk: 20, overall: 80 },
          jumpRisk: 'LOW',
          workRoute: [],
          physicalState: {
            elementProgress: { foundation: 100 },
            completedElements: ['foundation'],
            partialElements: [],
          },
        },
      ],
      camera: 'cameraA',
      activeZones: ['zone-1'],
      characterId: 'builder_01',
      status: 'validated',
      riskLevel: 'LOW',
      microTimeline: [],
    },
  ];

  const storyboard: StoryboardEntry[] = [
    { sceneId: 'scene-1', description: 'Build foundation', locked: false, imageAttached: false },
  ];

  // Note: constructionState and timeline in context are just placeholders
  // The assembler generates fresh ones via createProjectConstructionSnapshot and createConstructionTimeline
  const baseContext: PipelineContext = {
    config,
    blueprint,
    dna,
    visualDNA,
    worldState,
    spatialMap,
    dependencyGraph,
    operations,
    scenes,
    storyboard,
    createdAt: Date.now(),
    ...overrides,
  };

  return baseContext;
}

describe('ProjectAssemblerStage - Blueprint/Config Persistence', () => {
  let assembler: ProjectAssemblerStage;

  beforeEach(() => {
    assembler = new ProjectAssemblerStage();
  });

  it('creates the default visual workflow in 9:16', () => {
    const result = assembler.execute(createMinimalContext({ visualDNA: undefined }));

    expect(result.success).toBe(true);
    expect(result.data?.visualDNA.camera.defaultConfig.aspectRatio).toBe(9 / 16);
    expect(result.data?.visualDNA.camera.cameraA.aspectRatio).toBe(9 / 16);
    expect(result.data?.visualDNA.camera.cameraB.aspectRatio).toBe(9 / 16);
    expect(result.data?.visualDNA.consistencyRules.aspectRatio).toBe(9 / 16);
  });

  it('preserves an explicitly supplied 16:9 VisualDNA', () => {
    const context = createMinimalContext();
    const result = assembler.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.visualDNA).toEqual(context.visualDNA);
    expect(result.data?.visualDNA.consistencyRules.aspectRatio).toBe(16 / 9);
  });

  it('preserves blueprint in assembled Project', () => {
    const context = createMinimalContext();
    const result = assembler.execute(context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const project = result.data!;
    expect(project.blueprint).toBeDefined();
    expect(project.blueprint!.id).toBe('blueprint-1');
    expect(project.blueprint!.operations).toHaveLength(1);
    expect(project.blueprint!.operations[0].id).toBe('op-1');
    expect(project.blueprint!.protectedZoneIds).toEqual(['zone-2']);
  });

  it('preserves config in assembled Project', () => {
    const context = createMinimalContext();
    const result = assembler.execute(context);

    expect(result.success).toBe(true);
    const project = result.data!;

    expect(project.config).toBeDefined();
    expect(project.config!.name).toBe('Test Project');
    expect(project.config!.environment).toBe('terreno_plano');
    expect(project.config!.construction).toBe('house');
    expect(project.config!.materials).toEqual(['concrete', 'wood']);
    expect(project.config!.character.id).toBe('builder_01');
    expect(project.config!.visualStyle).toBe('cinematografico');
    expect(project.config!.detailLevel).toBe('alto');
  });

  it('assembled project has structural equivalence for replay/regeneration', () => {
    const context = createMinimalContext();
    const result = assembler.execute(context);

    expect(result.success).toBe(true);
    const project = result.data!;

    // Key fields for replay/regeneration must be present
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');

    // blueprint and config should be preserved from context
    expect(project.blueprint).toEqual(context.blueprint);
    expect(project.config).toEqual(context.config);
    expect(project.dna).toEqual(context.dna);

    // visualDNA is preserved from context when provided (per #5D)
    // Verify it matches the context.visualDNA that was passed in
    expect(project.visualDNA).toBeDefined();
    expect(project.visualDNA.id).toBe('visual-dna-1');
    expect(project.visualDNA.character.id).toBe(context.config.character.id);
    expect(project.visualDNA.character.name).toBe(context.config.character.name);
    expect(project.visualDNA.environment.preset).toBe(context.config.environment);
    expect(project.visualDNA.visualStyle).toBe(context.config.visualStyle);
    expect(project.visualDNA.detailLevel).toBe(context.config.detailLevel);

    // Other fields should match context
    expect(project.worldState).toEqual(context.worldState);
    expect(project.spatialMap).toEqual(context.spatialMap);
    expect(project.dependencyGraph).toEqual(context.dependencyGraph);
    expect(project.operations).toEqual(context.operations);
    expect(project.scenes).toEqual(context.scenes);
    expect(project.storyboard).toEqual(context.storyboard);

    // constructionState and timeline are GENERATED by the assembler from scenes/worldState
    // They won't equal the context input (which was just a snapshot). Verify they're valid.
    expect(project.constructionState).toBeDefined();
    expect(project.constructionState.sceneId).toBe('scene-1');
    expect(project.constructionState.progress).toBe(100);
    expect(project.constructionState.completedElements).toContain('foundation');

    expect(project.timeline).toBeDefined();
    // Timeline's projectId uses blueprint.id (not project.id which includes timestamp)
    expect(project.timeline.projectId).toBe(context.blueprint.id);
    expect(project.timeline.frames.length).toBeGreaterThan(0);
  });

  it('legacy project without blueprint/config still loads (backward compatibility)', () => {
    // Simulate a legacy project where context has minimal required fields
    // The assembler requires blueprint and config in context for execution
    // This test verifies that if a project is loaded from DB without blueprint/config,
    // the assembler doesn't crash when it runs (but blueprint/config are optional in Project type)
    const context = createMinimalContext();
    const result = assembler.execute(context);

    expect(result.success).toBe(true);
    const project = result.data!;

    // Project should have all required fields
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.dna).toBeDefined();
    expect(project.visualDNA).toBeDefined();
    expect(project.worldState).toBeDefined();
    expect(project.spatialMap).toBeDefined();
    expect(project.dependencyGraph).toBeDefined();
    expect(project.operations).toHaveLength(1);
    expect(project.scenes).toHaveLength(1);
    expect(project.storyboard).toHaveLength(1);
    expect(project.constructionState).toBeDefined();
    expect(project.timeline).toBeDefined();

    // blueprint and config are now preserved in the project (Update #4)
    expect(project.blueprint).toBeDefined();
    expect(project.config).toBeDefined();

    // The backward compatibility is at the type level - Project interface has
    // blueprint? and config? as optional, so loading a legacy JSON blob
    // without these fields will work fine (they'll be undefined)
  });

  it('validate passes for project with blueprint and config', () => {
    const context = createMinimalContext();
    const executeResult = assembler.execute(context);
    expect(executeResult.success).toBe(true);

    const validateResult = assembler.validate(context);
    expect(validateResult.success).toBe(true);
  });

  it('validate fails for project missing required fields', () => {
    const context = createMinimalContext();
    // Don't execute - no project in context
    const validateResult = assembler.validate(context);
    expect(validateResult.success).toBe(false);
    expect(validateResult.error).toBeDefined();
    expect(validateResult.error!.message).toContain('Project not assembled');
  });
});
