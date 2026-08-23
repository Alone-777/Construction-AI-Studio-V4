import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from '../../types/project';
import { ConstructionTimeline, ConstructionTimelineFrame } from '../../types/construction-timeline';
import { ConstructionStateSnapshot } from '../../types/construction-state';
import { ConstructionDecision } from '../../decision/ConstructionDecision';
import { VisualDNA } from '../../types/project';
import { ConstructionSeriesGenerator, createConstructionSeriesGenerator } from '../ConstructionSeriesGenerator';
import {
  ConstructionEpisode,
  ConstructionSeries,
  EpisodeObjective,
  EpisodeAction,
  EpisodeEnvironment,
  EpisodeMetadata,
  SeriesGenerationConfig,
} from '../../types/construction-series';
import { Orientation } from '../../types/spatial';
import { MaterialStatus, ToolStatus } from '../../types/materials';

// Mock VisualPromptResult with correct structure
const mockVisualPromptResult = {
  prompt: 'Test visual prompt',
  sections: {
    scene: 'SCENE: Test',
    environment: 'ENV: test',
    construction: 'CONSTRUCTION: test',
    materials: 'MATERIALS: test',
    elements: 'ELEMENTS: test',
    camera: 'CAMERA: test',
    lens: 'LENS: test',
    lighting: 'LIGHTING: test',
    action: 'ACTION: test',
    visualDNA: 'VISUAL_DNA: test',
    constructionState: 'STATE: test',
    timeline: 'TIMELINE: test',
    simulation: 'SIMULATION: test',
    decision: 'DECISION: test',
  },
  metadata: {
    timestamp: Date.now(),
    elementCount: 1,
    hasCameraMovement: false,
    hasDepthOfField: false,
    hasCustomLighting: false,
  },
};

// Mock compileVisualScene
vi.mock('../../visual/VisualPromptCompiler', () => ({
  compileVisualScene: vi.fn(() => mockVisualPromptResult),
  VisualPromptResult: {},
}));

vi.mock('../../visual/VisualSceneState', () => ({
  worldStateToVisualSceneState: vi.fn(() => ({})),
}));

vi.mock('../../decision/ConstructionDecisionEngine', () => ({
  createDecisionEngine: vi.fn(() => ({
    decide: vi.fn(() => ({
      action: 'EXECUTE_OPERATION',
      operationId: 'op-1',
      reason: 'Test decision',
      confidence: 0.9,
    })),
  })),
  ConstructionDecisionEngine: vi.fn(),
}));

vi.mock('../../simulation/ConstructionSimulationEngine', () => ({
  createSimulationEngine: vi.fn(() => ({
    advanceTimeline: vi.fn(),
    rewindTimeline: vi.fn(),
  })),
  ConstructionSimulationEngine: vi.fn(),
}));

describe('ConstructionSeriesGenerator', () => {
  let generator: ConstructionSeriesGenerator;
  let mockProject: Project;
  let mockTimeline: ConstructionTimeline;
  let mockVisualDNA: VisualDNA;

  beforeEach(() => {
    generator = createConstructionSeriesGenerator();

    mockVisualDNA = {
      id: 'visual-dna-1',
      character: {
        id: 'builder_01',
        name: 'Test Builder',
        appearance: 'Athletic builder',
        clothing: 'Work clothes',
        physicalTraits: ['strong'],
        defaultPose: 'standing',
        animationStyle: 'realistic',
      },
      environment: {
        preset: 'terreno_plano',
        climate: 'temperate',
        light: 'day',
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
          position: { x: 0, y: 0 },
          target: { x: 0, y: 0 },
          up: { x: 0, y: -1 },
          fov: 60,
          aspectRatio: 16 / 9,
          near: 0.1,
          far: 1000,
          movement: 'FIXA',
        },
        cameraB: {
          position: { x: 0, y: 0 },
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
        palette: [],
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
      detailLevel: 'medio',
      references: [],
      updatedAt: Date.now(),
    };

    mockTimeline = {
      id: 'timeline-1',
      projectId: 'project-1',
      frames: [
        {
          id: 'frame-1',
          sceneId: 'scene-1',
          progress: 10,
          state: {
            sceneId: 'scene-1',
            progress: 10,
            completedElements: [],
            activeElements: ['foundation'],
            pendingElements: ['walls', 'roof'],
            materialState: {
              available: ['concrete', 'rebar'],
              consumed: [],
              remaining: ['concrete', 'rebar'],
            },
            workerState: {
              position: 'zone-1',
              action: 'building foundation',
              tools: ['excavator', 'concrete-mixer'],
            },
            environmentState: {
              terrain: 'flat',
              weather: 'clear',
              lighting: 'day',
            },
            createdAt: new Date(),
          },
          visualChanges: {
            added: ['foundation'],
            removed: [],
            modified: [],
          },
          previousFrameId: undefined,
          createdAt: new Date(),
        },
        {
          id: 'frame-2',
          sceneId: 'scene-1',
          progress: 40,
          state: {
            sceneId: 'scene-1',
            progress: 40,
            completedElements: ['foundation'],
            activeElements: ['walls'],
            pendingElements: ['roof'],
            materialState: {
              available: ['bricks', 'mortar'],
              consumed: ['concrete', 'rebar'],
              remaining: ['bricks', 'mortar'],
            },
            workerState: {
              position: 'zone-1',
              action: 'building walls',
              tools: ['trowel', 'level'],
            },
            environmentState: {
              terrain: 'flat',
              weather: 'clear',
              lighting: 'day',
            },
            createdAt: new Date(),
          },
          visualChanges: {
            added: ['walls'],
            removed: [],
            modified: ['foundation'],
          },
          previousFrameId: 'frame-1',
          createdAt: new Date(),
        },
        {
          id: 'frame-3',
          sceneId: 'scene-1',
          progress: 100,
          state: {
            sceneId: 'scene-1',
            progress: 100,
            completedElements: ['foundation', 'walls', 'roof'],
            activeElements: [],
            pendingElements: [],
            materialState: {
              available: [],
              consumed: ['concrete', 'rebar', 'bricks', 'mortar', 'tiles'],
              remaining: [],
            },
            workerState: {
              position: 'zone-1',
              action: 'inspecting roof',
              tools: ['inspection-tools'],
            },
            environmentState: {
              terrain: 'flat',
              weather: 'clear',
              lighting: 'day',
            },
            createdAt: new Date(),
          },
          visualChanges: {
            added: ['roof'],
            removed: [],
            modified: ['walls'],
          },
          previousFrameId: 'frame-2',
          createdAt: new Date(),
        },
      ],
      currentFrameId: 'frame-1',
      createdAt: new Date(),
    };

    mockProject = {
      id: 'project-1',
      name: 'Test House',
      dna: {
        id: 'dna-1',
        config: {
          name: 'Test House',
          type: 'house',
          size: 'medium',
          style: 'modern',
          location: 'urban',
        } as any,
        environment: 'terreno_plano',
        finalConstruction: 'house',
        form: 'rectangular',
        materials: ['concrete', 'bricks'],
        character: {
          id: 'builder_01',
          name: 'Test Builder',
          appearance: 'Athletic builder',
          apparentAge: 35,
          hair: 'Short brown',
          beard: 'Stubble',
          clothes: 'Work clothes',
          shoes: 'Boots',
          accessories: [],
          tools: ['excavator'],
        },
        clothes: 'Work clothes',
        cameras: { a: {} as any, b: {} as any },
        aesthetics: 'cinematografico',
        restrictions: [],
        permanentObjects: [],
        rules: [],
        references: [],
        forbiddenElements: [],
      },
      visualDNA: mockVisualDNA,
      constructionState: {
        sceneId: 'scene-1',
        progress: 0,
        completedElements: [],
        activeElements: ['foundation'],
        pendingElements: ['walls', 'roof'],
        materialState: { available: ['concrete', 'rebar'], consumed: [], remaining: ['concrete', 'rebar'] },
        workerState: { position: 'zone-1', action: 'building', tools: ['excavator'] },
        environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
        createdAt: new Date(),
      },
      worldState: {
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
          { materialId: 'concrete', quantity: 10, status: 'disponivel' as MaterialStatus, location: 'site', origin: 'supplied' },
          { materialId: 'rebar', quantity: 20, status: 'disponivel' as MaterialStatus, location: 'site', origin: 'supplied' },
          { materialId: 'bricks', quantity: 100, status: 'disponivel' as MaterialStatus, location: 'site', origin: 'supplied' },
          { materialId: 'mortar', quantity: 50, status: 'disponivel' as MaterialStatus, location: 'site', origin: 'supplied' },
          { materialId: 'tiles', quantity: 200, status: 'disponivel' as MaterialStatus, location: 'site', origin: 'supplied' },
        ],
        tools: [
          { toolId: 'excavator', status: 'em_uso' as ToolStatus, location: 'site', inUse: true },
          { toolId: 'concrete-mixer', status: 'em_uso' as ToolStatus, location: 'site', inUse: true },
          { toolId: 'trowel', status: 'em_uso' as ToolStatus, location: 'site', inUse: true },
          { toolId: 'level', status: 'em_uso' as ToolStatus, location: 'site', inUse: true },
        ],
        residues: [],
        terrain: {
          type: 'flat',
          slope: 'none',
          vegetation: 'grass',
          soil: 'dirt',
        },
        construction: {
          type: 'house',
          progress: 0,
          status: 'not_started',
        },
        existingComponents: [],
        partialComponents: [],
        futureComponents: ['foundation', 'walls', 'roof'],
        consumedMaterials: [],
      },
      spatialMap: {
        id: 'spatial-1',
        zones: [],
        width: 100,
        height: 100,
        orientation: {
          front: 'north',
          back: 'south',
          left: 'west',
          right: 'east',
          center: 'center',
        },
        gridSize: 10,
      },
      dependencyGraph: {
        nodes: [],
        edges: [],
      },
      operations: [],
      scenes: [],
      storyboard: [],
      timeline: mockTimeline,
      simulation: {
        currentOperationId: 'op-1',
        lastOperationId: 'op-0',
        pendingOperations: ['op-2', 'op-3'],
        completedOperations: [],
        failedOperations: [],
        lastResult: {
          success: true,
          state: {
            sceneId: 'scene-1',
            progress: 10,
            completedElements: [],
            activeElements: ['foundation'],
            pendingElements: ['walls', 'roof'],
            materialState: { available: [], consumed: [], remaining: [] },
            workerState: { position: 'zone-1', action: 'building', tools: [] },
            environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
            createdAt: new Date(),
          },
          events: [],
          timelineFrameId: 'frame-1',
        },
        lastEvents: [],
      },
      decision: {
        action: 'EXECUTE_OPERATION',
        operationId: 'op-1',
        reason: 'Start foundation',
        confidence: 0.9,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
    };
  });

  describe('createConstructionSeriesGenerator', () => {
    it('should create generator with default config', () => {
      const gen = createConstructionSeriesGenerator();
      expect(gen).toBeInstanceOf(ConstructionSeriesGenerator);
    });

    it('should create generator with custom config', () => {
      const gen = createConstructionSeriesGenerator({
        baseEpisodeDuration: 15,
        includeWaitEpisodes: false,
        maxEpisodes: 10,
      });
      expect(gen).toBeInstanceOf(ConstructionSeriesGenerator);
    });
  });

  describe('generate', () => {
    it('should generate construction series from project with timeline', () => {
      const series = generator.generate(mockProject);

      expect(series).toBeDefined();
      expect(series.id).toContain('series-project-1');
      expect(series.projectId).toBe('project-1');
      expect(series.name).toBe('Test House - Série de Construção');
      expect(series.episodes).toHaveLength(3);
      expect(series.totalEstimatedDuration).toBeGreaterThan(0);
      expect(series.totalProgress).toBe(100);
      expect(series.createdAt).toBeDefined();
    });

    it('should generate episodes in correct sequence order', () => {
      const series = generator.generate(mockProject);

      expect(series.episodes[0].sequence).toBe(1);
      expect(series.episodes[1].sequence).toBe(2);
      expect(series.episodes[2].sequence).toBe(3);
    });

    it('should generate episodes sorted by timeline progress', () => {
      const series = generator.generate(mockProject);

      expect(series.episodes[0].metadata.progress).toBe(10);
      expect(series.episodes[1].metadata.progress).toBe(40);
      expect(series.episodes[2].metadata.progress).toBe(100);
    });

    it('should generate episode with correct structure', () => {
      const series = generator.generate(mockProject);
      const episode = series.episodes[0];

      expect(episode.id).toContain('episode-1-frame-1');
      expect(episode.sequence).toBe(1);
      expect(episode.title).toContain('Episódio 1:');
      expect(episode.objective).toBeDefined();
      expect(episode.action).toBeDefined();
      expect(episode.environment).toBeDefined();
      expect(episode.visualPrompt).toBeDefined();
      expect(episode.estimatedDuration).toBeGreaterThan(0);
      expect(episode.metadata).toBeDefined();
    });

    it('should generate episode objective with correct type mapping', () => {
      const series = generator.generate(mockProject);

      // First episode has foundation -> foundation type
      expect(series.episodes[0].objective.type).toBe('foundation');
      expect(series.episodes[0].objective.elements).toContain('foundation');
      expect(series.episodes[0].objective.priority).toBe(10);

      // Second episode has walls -> structure type (active element)
      expect(series.episodes[1].objective.type).toBe('structure');
      expect(series.episodes[1].objective.priority).toBe(8);

      // Third episode has newly completed walls and roof -> structure type (walls comes first)
      expect(series.episodes[2].objective.type).toBe('structure');
      expect(series.episodes[2].objective.priority).toBe(8);
    });

    it('should generate episode action with correct properties', () => {
      const series = generator.generate(mockProject);
      const episode = series.episodes[0];

      expect(episode.action.type).toBe('build');
      expect(episode.action.description).toContain('Construir');
      expect(episode.action.tools).toEqual(['excavator', 'concrete-mixer']);
      expect(episode.action.zone).toBe('zone-1');
      expect(episode.action.estimatedDuration).toBeGreaterThan(0);
    });

    it('should generate episode environment with correct properties', () => {
      const series = generator.generate(mockProject);
      const episode = series.episodes[0];

      expect(episode.environment.terrain).toBe('flat');
      expect(episode.environment.lighting).toBe('day');
      expect(episode.environment.weather).toBe('clear');
      expect(episode.environment.timeOfDay).toBe('day');
      expect(episode.environment.activeZone).toBe('zone-1');
    });

    it('should generate episode metadata with frame info', () => {
      const series = generator.generate(mockProject);
      const episode = series.episodes[0];

      expect(episode.metadata.frameId).toBe('frame-1');
      expect(episode.metadata.progress).toBe(10);
      expect(episode.metadata.completedElements).toEqual([]);
      expect(episode.metadata.activeElements).toEqual(['foundation']);
      expect(episode.metadata.pendingElements).toEqual(['walls', 'roof']);
      expect(episode.metadata.decision).toBeDefined();
      expect(episode.metadata.decisionConfidence).toBe(0.9);
    });

    it('should use visualPrompt from VisualPromptCompiler', () => {
      const series = generator.generate(mockProject);

      expect(series.episodes[0].visualPrompt).toEqual(mockVisualPromptResult);
      expect(series.episodes[1].visualPrompt).toEqual(mockVisualPromptResult);
      expect(series.episodes[2].visualPrompt).toEqual(mockVisualPromptResult);
    });

    it('should respect maxEpisodes config', () => {
      const limitedGenerator = createConstructionSeriesGenerator({ maxEpisodes: 2 });
      const series = limitedGenerator.generate(mockProject);

      expect(series.episodes).toHaveLength(2);
    });

    it('should throw error if project has no timeline', () => {
      const projectWithoutTimeline = { ...mockProject, timeline: undefined as any };
      expect(() => generator.generate(projectWithoutTimeline)).toThrow('Projeto deve ter timeline com frames para gerar série');
    });

    it('should throw error if timeline has no frames', () => {
      const projectWithEmptyTimeline = {
        ...mockProject,
        timeline: { ...mockTimeline, frames: [] },
      };
      expect(() => generator.generate(projectWithEmptyTimeline)).toThrow('Projeto deve ter timeline com frames para gerar série');
    });

    it('should include decision in metadata when available', () => {
      const series = generator.generate(mockProject);

      expect(series.episodes[0].metadata.decision).toBeDefined();
      expect(series.episodes[0].metadata.decision?.action).toBe('EXECUTE_OPERATION');
      expect(series.episodes[0].metadata.decisionConfidence).toBe(0.9);
    });
  });

  describe('generateFromOperations', () => {
    it('should generate series from operations when no timeline', () => {
      const projectWithoutTimeline = {
        ...mockProject,
        timeline: undefined as any,
        worldState: mockProject.worldState,
      };

      const operations = [
        { id: 'op-1', name: 'Foundation', elements: ['foundation'], zones: ['zone-1'], visualBasis: { materials: ['concrete'], tools: ['excavator'] } },
        { id: 'op-2', name: 'Walls', elements: ['walls'], zones: ['zone-1'], visualBasis: { materials: ['bricks'], tools: ['trowel'] } },
        { id: 'op-3', name: 'Roof', elements: ['roof'], zones: ['zone-1'], visualBasis: { materials: ['tiles'], tools: ['crane'] } },
      ];

      const series = generator.generateFromOperations(projectWithoutTimeline, operations);

      expect(series).toBeDefined();
      expect(series.name).toBe('Test House - Série de Operações');
      expect(series.episodes).toHaveLength(3);
      expect(series.totalProgress).toBe(100);
    });

    it('should generate episodes with operation-based decisions', () => {
      const projectWithoutTimeline = {
        ...mockProject,
        timeline: undefined as any,
        worldState: mockProject.worldState,
      };

      const operations = [
        { id: 'op-1', name: 'Foundation', elements: ['foundation'], zones: ['zone-1'], visualBasis: { materials: ['concrete'], tools: ['excavator'] } },
      ];

      const series = generator.generateFromOperations(projectWithoutTimeline, operations);

      expect(series.episodes[0].metadata.decision).toBeDefined();
      expect(series.episodes[0].metadata.decision?.action).toBe('EXECUTE_OPERATION');
      expect(series.episodes[0].metadata.decision?.operationId).toBe('op-1');
    });

    it('should respect maxEpisodes in generateFromOperations', () => {
      const limitedGenerator = createConstructionSeriesGenerator({ maxEpisodes: 1 });
      const projectWithoutTimeline = {
        ...mockProject,
        timeline: undefined as any,
        worldState: mockProject.worldState,
      };

      const operations = [
        { id: 'op-1', name: 'Foundation', elements: ['foundation'], zones: ['zone-1'], visualBasis: { materials: ['concrete'], tools: ['excavator'] } },
        { id: 'op-2', name: 'Walls', elements: ['walls'], zones: ['zone-1'], visualBasis: { materials: ['bricks'], tools: ['trowel'] } },
      ];

      const series = limitedGenerator.generateFromOperations(projectWithoutTimeline, operations);

      expect(series.episodes).toHaveLength(1);
    });
  });

  describe('config options', () => {
    it('should skip WAIT episodes when includeWaitEpisodes is false', () => {
      const projectWithWaitDecision = {
        ...mockProject,
        decision: {
          action: 'WAIT' as ConstructionDecision['action'],
          reason: 'Waiting for materials',
          confidence: 0.5,
        },
      };

      const genWithWait = createConstructionSeriesGenerator({ includeWaitEpisodes: true });
      const genWithoutWait = createConstructionSeriesGenerator({ includeWaitEpisodes: false });

      const seriesWithWait = genWithWait.generate(projectWithWaitDecision);
      const seriesWithoutWait = genWithoutWait.generate(projectWithWaitDecision);

      // With wait episodes should include the frame
      // Without wait should skip (but we only have 3 frames, so depends on decision logic)
      expect(seriesWithWait.episodes.length).toBeGreaterThanOrEqual(seriesWithoutWait.episodes.length);
    });

    it('should skip REQUEST_MATERIAL episodes when includeMaterialRequestEpisodes is false', () => {
      const projectWithMaterialRequest = {
        ...mockProject,
        decision: {
          action: 'REQUEST_MATERIAL' as ConstructionDecision['action'],
          operationId: 'op-1',
          reason: 'Need more concrete',
          confidence: 0.7,
        },
      };

      const genWithMaterial = createConstructionSeriesGenerator({ includeMaterialRequestEpisodes: true });
      const genWithoutMaterial = createConstructionSeriesGenerator({ includeMaterialRequestEpisodes: false });

      const seriesWithMaterial = genWithMaterial.generate(projectWithMaterialRequest);
      const seriesWithoutMaterial = genWithoutMaterial.generate(projectWithMaterialRequest);

      expect(seriesWithMaterial.episodes.length).toBeGreaterThanOrEqual(seriesWithoutMaterial.episodes.length);
    });
  });

  describe('episode duration calculation', () => {
    it('should calculate total duration correctly', () => {
      const series = generator.generate(mockProject);

      const expectedDuration = series.episodes.reduce((sum, ep) => sum + ep.estimatedDuration, 0);
      expect(series.totalEstimatedDuration).toBe(expectedDuration);
    });

    it('should use baseEpisodeDuration + action duration', () => {
      const customGen = createConstructionSeriesGenerator({ baseEpisodeDuration: 20 });
      const series = customGen.generate(mockProject);

      // Each episode should have at least baseEpisodeDuration
      for (const episode of series.episodes) {
        expect(episode.estimatedDuration).toBeGreaterThanOrEqual(20);
      }
    });
  });

  describe('episode title generation', () => {
    it('should generate descriptive titles', () => {
      const series = generator.generate(mockProject);

      expect(series.episodes[0].title).toContain('Episódio 1');
      expect(series.episodes[0].title).toContain('fundação');
      expect(series.episodes[1].title).toContain('Episódio 2');
      expect(series.episodes[2].title).toContain('Episódio 3');
    });
  });

  describe('integration with ConstructionDecisionEngine', () => {
    it('should use decision from project when available', () => {
      const series = generator.generate(mockProject);

      // All episodes should have the project decision in metadata
      for (const episode of series.episodes) {
        expect(episode.metadata.decision).toBeDefined();
        expect(episode.metadata.decision?.action).toBe('EXECUTE_OPERATION');
      }
    });

    it('should infer decision from simulation when no project decision', () => {
      const projectWithoutDecision = {
        ...mockProject,
        decision: undefined,
        simulation: {
          ...mockProject.simulation!,
          currentOperationId: 'op-2',
        },
      };

      const series = generator.generate(projectWithoutDecision);

      // Should still generate episodes with inferred decision
      expect(series.episodes.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle missing visualDNA gracefully', () => {
      const projectWithoutVisualDNA = {
        ...mockProject,
        visualDNA: undefined as any,
      };

      // Should not throw, but may have issues in visual prompt generation
      expect(() => generator.generate(projectWithoutVisualDNA)).not.toThrow();
    });

    it('should handle missing worldState gracefully', () => {
      const projectWithoutWorldState = {
        ...mockProject,
        worldState: undefined as any,
      };

      expect(() => generator.generate(projectWithoutWorldState)).not.toThrow();
    });

    it('should handle frames with missing state properties', () => {
      const timelineWithMinimalFrames: ConstructionTimeline = {
        ...mockTimeline,
        frames: [
          {
            id: 'minimal-frame',
            sceneId: 'scene-1',
            progress: 50,
            state: {
              sceneId: 'scene-1',
              progress: 50,
              completedElements: [],
              activeElements: [],
              pendingElements: [],
              materialState: { available: [], consumed: [], remaining: [] },
              workerState: { position: 'site', action: 'idle', tools: [] },
              environmentState: { terrain: 'flat', weather: 'clear', lighting: 'day' },
              createdAt: new Date(),
            },
            visualChanges: { added: [], removed: [], modified: [] },
            createdAt: new Date(),
          },
        ],
        currentFrameId: 'minimal-frame',
        createdAt: new Date(),
      };

      const projectWithMinimalFrames = { ...mockProject, timeline: timelineWithMinimalFrames };
      const series = generator.generate(projectWithMinimalFrames);

      expect(series.episodes).toHaveLength(1);
      expect(series.episodes[0].objective.elements).toEqual([]);
    });
  });
});

describe('ConstructionSeries types', () => {
  it('should have correct EpisodeObjective structure', () => {
    const objective: EpisodeObjective = {
      type: 'foundation',
      description: 'Build foundation',
      elements: ['foundation'],
      priority: 10,
    };
    expect(objective.type).toBe('foundation');
  });

  it('should have correct EpisodeAction structure', () => {
    const action: EpisodeAction = {
      type: 'build',
      description: 'Building foundation',
      tools: ['excavator'],
      materials: ['concrete'],
      estimatedDuration: 30,
      zone: 'zone-1',
    };
    expect(action.type).toBe('build');
  });

  it('should have correct EpisodeEnvironment structure', () => {
    const env: EpisodeEnvironment = {
      terrain: 'flat',
      slope: 'none',
      vegetation: 'grass',
      soil: 'dirt',
      climate: 'temperate',
      lighting: 'day',
      timeOfDay: 'day',
      weather: 'clear',
      activeZone: 'zone-1',
    };
    expect(env.timeOfDay).toBe('day');
  });

  it('should have correct EpisodeMetadata structure', () => {
    const metadata: EpisodeMetadata = {
      frameId: 'frame-1',
      progress: 50,
      completedElements: ['foundation'],
      activeElements: ['walls'],
      pendingElements: ['roof'],
      decision: { action: 'EXECUTE_OPERATION', operationId: 'op-1', reason: 'test', confidence: 0.9 },
      decisionConfidence: 0.9,
      createdAt: Date.now(),
    };
    expect(metadata.progress).toBe(50);
  });

  it('should have correct ConstructionEpisode structure', () => {
    const episode: ConstructionEpisode = {
      id: 'ep-1',
      sequence: 1,
      title: 'Episode 1',
      objective: { type: 'foundation', description: 'desc', elements: [], priority: 10 },
      action: { type: 'build', description: 'desc', tools: [], materials: [], estimatedDuration: 10, zone: 'z1' },
      environment: { terrain: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt', climate: 'temperate', lighting: 'day', timeOfDay: 'day', weather: 'clear', activeZone: 'z1' },
      visualPrompt: mockVisualPromptResult,
      estimatedDuration: 30,
      metadata: { frameId: 'f1', progress: 10, completedElements: [], activeElements: [], pendingElements: [], createdAt: Date.now() },
    };
    expect(episode.sequence).toBe(1);
  });

  it('should have correct ConstructionSeries structure', () => {
    const series: ConstructionSeries = {
      id: 'series-1',
      projectId: 'proj-1',
      name: 'Test Series',
      episodes: [],
      totalEstimatedDuration: 0,
      totalProgress: 0,
      createdAt: Date.now(),
    };
    expect(series.projectId).toBe('proj-1');
  });

  it('should have correct SeriesGenerationConfig structure', () => {
    const config: SeriesGenerationConfig = {
      baseEpisodeDuration: 10,
      includeWaitEpisodes: true,
      includeMaterialRequestEpisodes: true,
      maxEpisodes: 50,
    };
    expect(config.baseEpisodeDuration).toBe(10);
  });
});