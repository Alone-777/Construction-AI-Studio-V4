import { ConstructionSeriesGenerator, createConstructionSeriesGenerator } from '../../../series/ConstructionSeriesGenerator';
import { EpisodePlanner, createEpisodePlanner } from '../../../series/EpisodePlanner';
import type { PipelineContext, StageResult } from '../types';
import type { PlannedEpisode, EpisodePlan } from '../../../series/EpisodePlanner';
import type { Project, ProjectConfig } from '../../../types';
import type { WorldState, Operation } from '../../../types';
import type { ConstructionBlueprint } from '../../project-orchestrator';

/**
 * Stage 8: Episode Planner
 * Transforms ConstructionEpisode[] into cinematic EpisodePlan with prioritization,
 * shot planning, duration adjustment, and vertical video structure.
 * Runs after StagesExecutorStage, before SceneDirectorStage.
 */
export class EpisodePlannerStage {
  name = 'episode-planner';

  private seriesGenerator: ConstructionSeriesGenerator;
  private episodePlanner: EpisodePlanner;

  constructor() {
    this.seriesGenerator = createConstructionSeriesGenerator();
    this.episodePlanner = createEpisodePlanner();
  }

  execute(context: PipelineContext): StageResult<{ plannedEpisodes: PlannedEpisode[]; episodePlan: EpisodePlan }> {
    // Need operations, dna, worldState, config to build minimal project
    if (!context.operations || !context.dna || !context.worldState || !context.config) {
      return {
        success: false,
        error: new Error('Insufficient context for EpisodePlannerStage (need operations, dna, worldState, config)'),
      };
    }

    try {
      // Build minimal project from context (similar to SceneDirectorStage)
      const minimalProject = this.buildMinimalProject(context);

      // Generate construction series from operations
      const series = this.seriesGenerator.generateFromOperations(minimalProject, context.operations);
      context.episodes = series.episodes;

      // Plan episodes cinematically
      const episodePlan = this.episodePlanner.plan(series);
      context.plannedEpisodes = episodePlan.plannedEpisodes;
      context.episodePlan = episodePlan;

      return {
        success: true,
        data: { plannedEpisodes: episodePlan.plannedEpisodes, episodePlan },
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Builds a minimal Project-like object from pipeline context
   * Includes all fields required by ConstructionSeriesGenerator.generateFromOperations
   */
  private buildMinimalProject(context: PipelineContext): Project {
    const config = context.config!;
    const dna = context.dna!;
    const worldState = context.worldState!;
    const blueprint = context.blueprint;
    const operations = context.operations!;

    // Build minimal visualDNA from available context
    const visualDNA = this.buildMinimalVisualDNA(context);

    // Build minimal timeline from operations
    const timelineFrames = this.buildTimelineFromOperations(operations, worldState);

    const timeline: any = {
      id: `timeline-${Date.now()}`,
      projectId: config.name || `project-${Date.now()}`,
      frames: timelineFrames,
      currentFrameId: timelineFrames[0]?.id || `frame-${Date.now()}`,
      createdAt: new Date(),
    };

    return {
      id: config.name || `project-${Date.now()}`,
      name: config.name || 'Pipeline Project',
      config,
      blueprint,
      visualDNA,
      dna,
      spatialMap: context.spatialMap,
      dependencyGraph: context.dependencyGraph,
      worldState,
      operations,
      scenes: context.scenes || [],
      storyboard: context.storyboard || [],
      timeline,
      simulation: undefined,
      constructionState: {
        sceneId: 'scene-1',
        progress: 0,
        completedElements: [],
        activeElements: operations[0]?.elements || [],
        pendingElements: operations.flatMap(op => op.elements || []),
        materialState: {
          available: worldState.materials
            ?.filter(m => m.status === 'disponivel')
            .map(m => m.materialId) || [],
          consumed: [],
          remaining: [],
        },
        workerState: {
          position: operations[0]?.zones?.[0] || 'site',
          action: 'starting',
          tools: operations[0]?.visualBasis?.tools || [],
        },
        environmentState: {
          terrain: worldState.terrain?.type || 'flat',
          weather: worldState.climate || 'clear',
          lighting: worldState.light || 'day',
        },
        createdAt: new Date(),
      },
      status: 'active',
      createdAt: context.createdAt,
      updatedAt: Date.now(),
    } as Project;
  }

  /**
   * Builds minimal visualDNA from pipeline context (config, dna, worldState)
   */
  private buildMinimalVisualDNA(context: PipelineContext): any {
    const config = context.config!;
    const dna = context.dna!;
    const worldState = context.worldState!;
    const blueprintId = context.blueprint?.id || `blueprint-${Date.now()}`;
    const createdAt = context.createdAt || Date.now();

    return {
      id: `${blueprintId}_visual_${createdAt}`,
      character: {
        id: dna.character.id,
        name: dna.character.name,
        appearance: dna.character.appearance,
        clothing: dna.character.clothes,
        physicalTraits: [dna.character.hair, dna.character.beard].filter(Boolean),
        defaultPose: 'standing',
        animationStyle: 'realistic',
      },
      environment: {
        preset: config.environment,
        climate: worldState.climate || '',
        light: worldState.light || 'day',
        timeOfDay: worldState.light === 'noite' ? 'night' : worldState.light === 'amanhecer' ? 'dawn' : worldState.light === 'entardecer' ? 'dusk' : 'day',
        weather: worldState.climate?.includes('chuva') ? 'rain' : worldState.climate?.includes('tempestade') ? 'storm' : worldState.climate?.includes('névoa') ? 'fog' : worldState.climate?.includes('nublado') ? 'cloudy' : 'clear',
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
          aspectRatio: 9 / 16,
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
        cameraA: this.cameraToConfig(config.cameraA),
        cameraB: this.cameraToConfig(config.cameraB),
        movementPreferences: ['FIXA', 'FOLLOW', 'PAN'],
      },
      materials: {
        palette: config.materials.map((m: string) => ({
          materialId: m,
          displayName: m,
          color: '#888888',
          texture: 'matte',
          roughness: 0.5,
          metallic: 0.0,
        })),
        defaultQuantities: {},
        residueRules: [],
      },
      consistencyRules: {
        colorPalette: [],
        lightingStyle: 'natural',
        cameraStyle: 'static',
        depthOfFieldDefault: false,
        aspectRatio: 9 / 16,
        forbiddenVisualElements: [],
        requiredVisualElements: [],
        compositionRules: [],
      },
      visualStyle: config.visualStyle || 'cinematografico',
      detailLevel: config.detailLevel || 'alto',
      references: [],
      updatedAt: createdAt,
    };
  }

  /**
   * Helper to convert Camera to CameraConfig
   */
  private cameraToConfig(camera: any): any {
    const positions: Record<string, { x: number; y: number }> = {
      'close': { x: 0, y: 2 },
      'medium': { x: 0, y: 5 },
      'wide': { x: 0, y: 10 },
      'panoramic': { x: 0, y: 20 },
    };
    const heights: Record<string, number> = {
      'baixa': 1.5,
      'media': 3,
      'alta': 6,
      'aerea': 15,
    };
    const pos = positions[camera.framing] || { x: 0, y: 5 };
    const height = heights[camera.conceptualHeight] || 3;

    return {
      position: { x: pos.x, y: height },
      target: { x: 0, y: 0 },
      up: { x: 0, y: -1 },
      fov: camera.framing === 'close' ? 35 : camera.framing === 'wide' ? 70 : 60,
      aspectRatio: 9 / 16,
      near: 0.1,
      far: 1000,
      movement: camera.allowedMovement,
    };
  }

  /**
   * Builds minimal timeline frames from operations
   */
  private buildTimelineFromOperations(operations: Operation[], worldState: WorldState): any[] {
    return operations.map((operation, index) => ({
      id: `frame-${operation.id}`,
      sceneId: operation.scenes?.[0] || 'scene-1',
      progress: ((index + 1) / operations.length) * 100,
      state: {
        sceneId: operation.scenes?.[0] || 'scene-1',
        progress: ((index + 1) / operations.length) * 100,
        completedElements: operations.slice(0, index).flatMap(op => op.elements || []),
        activeElements: operation.elements || [],
        pendingElements: operations.slice(index + 1).flatMap(op => op.elements || []),
        materialState: {
          available: worldState.materials
            ?.filter(m => m.status === 'disponivel')
            .map(m => m.materialId) || [],
          consumed: [],
          remaining: [],
        },
        workerState: {
          position: operation.zones?.[0] || 'site',
          action: `Executando ${operation.name}`,
          tools: operation.visualBasis?.tools || [],
        },
        environmentState: {
          terrain: worldState.terrain?.type || 'flat',
          weather: worldState.climate || 'clear',
          lighting: worldState.light || 'day',
        },
        createdAt: new Date(),
      },
      visualChanges: {
        added: operation.elements || [],
        removed: [],
        modified: [],
      },
      previousFrameId: index > 0 ? `frame-${operations[index - 1].id}` : undefined,
      createdAt: new Date(),
    }));
  }

  validate(context: PipelineContext): StageResult {
    if (!context.plannedEpisodes || context.plannedEpisodes.length === 0) {
      return {
        success: false,
        error: new Error('No planned episodes generated'),
      };
    }

    if (!context.episodePlan) {
      return {
        success: false,
        error: new Error('Episode plan not generated'),
      };
    }

    if (!context.episodePlan.verticalStructure) {
      return {
        success: false,
        error: new Error('Episode plan missing verticalStructure'),
      };
    }

    // Validate each planned episode has required fields
    for (const plannedEp of context.plannedEpisodes) {
      if (!plannedEp.plannedShots || plannedEp.plannedShots.length === 0) {
        return {
          success: false,
          error: new Error(`Planned episode ${plannedEp.episode.id} has no planned shots`),
        };
      }
      if (plannedEp.plannedDuration <= 0) {
        return {
          success: false,
          error: new Error(`Planned episode ${plannedEp.episode.id} has invalid duration`),
        };
      }
    }

    return {
      success: true,
    };
  }
}

/**
 * Factory function
 */
export function createEpisodePlannerStage(): EpisodePlannerStage {
  return new EpisodePlannerStage();
}