import { SceneDirectorAI, createSceneDirectorAI } from '../../../scene-director/SceneDirectorAI';
import { ConstructionSeriesGenerator, createConstructionSeriesGenerator } from '../../../series/ConstructionSeriesGenerator';
import type { PipelineContext, StageResult } from '../types';
import type { CinematicScene } from '../../../types/scene-director';
import type { CinematicCameraMovement } from '../../../types/scene-director';
import type { ConstructionEpisode } from '../../../types/construction-series';
import type { PlannedEpisode } from '../../../series/EpisodePlanner';
import type { Project, VisualDNA } from '../../../types';
import { createConstructionTimeline } from '../../../timeline/createConstructionTimeline';
import { createProjectConstructionSnapshot } from '../../../state/createConstructionSnapshot';

/**
 * Stage 9: Scene Director
 * Transforms ConstructionEpisode into cinematic scenes for TikTok
 * Runs after EpisodePlannerStage, before PromptsGeneratorStage
 * Works without full Project by constructing minimal project from context
 */
export class SceneDirectorStage {
  name = 'scene-director';

  private sceneDirector: SceneDirectorAI;
  private seriesGenerator: ConstructionSeriesGenerator;

  constructor() {
    this.sceneDirector = createSceneDirectorAI();
    this.seriesGenerator = createConstructionSeriesGenerator();
  }

  execute(context: PipelineContext): StageResult<{ cinematicScenes: CinematicScene[]; episodes: ConstructionEpisode[] }> {
    // Check if EpisodePlannerStage already provided planned episodes
    if (context.plannedEpisodes && context.plannedEpisodes.length > 0) {
      // Use pre-planned episodes from EpisodePlannerStage
      context.episodes = context.plannedEpisodes.map(p => p.episode);

      // Direct planned episodes into cinematic scenes (uses planned shots, no recalculation)
      const cinematicScenes = this.sceneDirector.directFromPlan(context.plannedEpisodes, context.episodePlan);
      context.cinematicScenes = cinematicScenes;

      return {
        success: true,
        data: { cinematicScenes, episodes: context.episodes },
      };
    }

    // Fallback: build from the same official Stage-derived temporal history.
    const minimalProject = this.buildMinimalProject(context);
    if (!minimalProject) {
      return {
        success: false,
        error: new Error('Insufficient context for SceneDirectorStage (need operations, dna, visualDNA, worldState)'),
      };
    }

    try {
      const series = this.seriesGenerator.generate(minimalProject);
      context.episodes = series.episodes;

      // Direct each episode into cinematic scenes
      const cinematicScenes = this.sceneDirector.directSeries(series.episodes);
      context.cinematicScenes = cinematicScenes;

      // Do NOT overwrite context.scenes - keep the original scenes from ScenesBuilderStage/StagesExecutorStage
      // which have proper Stage objects with all required fields (worldStateBefore/After, validations, etc.)
      // The cinematicScenes are available in context.cinematicScenes for any stage that needs them

      return {
        success: true,
        data: { cinematicScenes, episodes: series.episodes },
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
   * Includes all fields required by ConstructionSeriesGenerator.generate
   */
  private buildMinimalProject(context: PipelineContext): Project {
    if (!context.operations || !context.scenes || !context.dna || !context.worldState || !context.config) {
      throw new Error('Insufficient context for SceneDirectorStage (need scenes, operations, dna, worldState, config)');
    }

    // Build minimal visualDNA from available context (config, worldState, dna)
    const visualDNA = this.buildMinimalVisualDNA(context);

    const timeline = createConstructionTimeline(context.blueprint.id, context.scenes);
    const constructionState = createProjectConstructionSnapshot(
      context.scenes,
      context.worldState,
      context.worldState.materials
    );

    // Build minimal simulation from context if available
    const simulation = (context as any).simulation;

    return {
      id: context.config?.name || `project-${Date.now()}`,
      name: context.config?.name || 'Pipeline Project',
      config: context.config,
      blueprint: context.blueprint,
      visualDNA,
      dna: context.dna,
      spatialMap: context.spatialMap,
      dependencyGraph: context.dependencyGraph,
      worldState: context.worldState,
      operations: context.operations,
      scenes: context.scenes || [],
      storyboard: context.storyboard || [],
      timeline,
      simulation: simulation ? {
        lastOperationId: simulation.lastOperationId || '',
        lastResult: simulation.lastResult || { success: true },
        lastEvents: simulation.lastEvents || [],
        currentOperationId: simulation.currentOperationId || null,
        pendingOperations: simulation.pendingOperations || [],
        completedOperations: simulation.completedOperations || [],
        failedOperations: simulation.failedOperations || [],
      } : undefined,
      constructionState,
      status: 'active',
      createdAt: context.createdAt,
      updatedAt: Date.now(),
    } as Project;
  }

  /**
   * Builds minimal visualDNA from pipeline context (config, dna, worldState)
   * Used when ProjectAssemblerStage hasn't run yet (visualDNA not available)
   */
  private buildMinimalVisualDNA(context: PipelineContext): VisualDNA {
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
          aspectRatio: 9 / 16, // TikTok vertical
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
        palette: config.materials.map(m => ({
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
   * Converte cenas cinematográficas para formato Scene legado
   */
  private convertToLegacyScenes(
    cinematicScenes: CinematicScene[],
    project: Project
  ): any[] {
    return cinematicScenes.map((cinematicScene, index) => ({
      id: cinematicScene.id,
      projectId: project.id,
      order: index + 1,
      percentage: (cinematicScene.sequence / cinematicScenes.length) * 100,
      stages: [{
        id: `${cinematicScene.id}-stage-1`,
        sceneId: cinematicScene.id,
        order: 1,
        percentage: (cinematicScene.sequence / cinematicScenes.length) * 100,
        prompts: {
          visual: cinematicScene.prompt,
          nanoBanana: '',
          kling: '',
        },
        // Metadados da cena cinematográfica
        cinematicMetadata: {
          shotType: cinematicScene.shotType,
          cameraMovement: cinematicScene.cameraMovement,
          duration: cinematicScene.duration,
          hook: cinematicScene.hook,
          visualProgression: cinematicScene.visualProgression,
          satisfyingMoments: cinematicScene.satisfyingMoments,
          verticalStructure: cinematicScene.verticalStructure,
        },
        // cameraId needed by prompt generators (kling.ts, nano-banana.ts)
        cameraId: cinematicScene.shotType === 'wide' || cinematicScene.shotType === 'aerial' ? 'A' : 'B',
      }],
      characters: [],
      zones: [cinematicScene.metadata.zone],
      components: cinematicScene.metadata.element ? [cinematicScene.metadata.element] : [],
      operations: [],
    }));
  }

  validate(context: PipelineContext): StageResult {
    if (!context.cinematicScenes || context.cinematicScenes.length === 0) {
      return {
        success: false,
        error: new Error('No cinematic scenes generated'),
      };
    }

    for (const scene of context.cinematicScenes) {
      if (!scene.prompt || scene.prompt.trim() === '') {
        return {
          success: false,
          error: new Error(`Scene ${scene.id} missing prompt`),
        };
      }
      if (!scene.shotType || !scene.cameraMovement) {
        return {
          success: false,
          error: new Error(`Scene ${scene.id} missing shotType or cameraMovement`),
        };
      }
      if (scene.duration <= 0) {
        return {
          success: false,
          error: new Error(`Scene ${scene.id} has invalid duration`),
        };
      }
    }

    // Validar estrutura vertical na primeira cena
    const firstScene = context.cinematicScenes[0];
    if (!firstScene.verticalStructure) {
      return {
        success: false,
        error: new Error('First scene missing verticalStructure'),
      };
    }

    return {
      success: true,
    };
  }
}

/**
 * Factory function
 */
export function createSceneDirectorStage(): SceneDirectorStage {
  return new SceneDirectorStage();
}
