import type { Project, ProjectConfig, VisualDNA, CameraConfig } from '../../../types';
import type { ConstructionBlueprint } from '../../project-orchestrator';
import type { PipelineContext, StageResult } from '../types';
import type { Camera } from '../../../types/camera';
import type { Point } from '../../../types/spatial';
import type { PlannedEpisode, EpisodePlan } from '../../../series/EpisodePlanner';
import { createProjectConstructionSnapshot } from '../../../state/createConstructionSnapshot';
import { createConstructionTimeline } from '../../../timeline/createConstructionTimeline';

/**
 * Stage 9: Project Assembly
 * Assembles final Project object from all pipeline stages
 */
function createDefaultVisualDNA(config: ProjectConfig, createdAt: number, blueprintId: string): VisualDNA {
  return {
    id: `${blueprintId}_visual_${createdAt}`,
    character: {
      id: config.character.id,
      name: config.character.name,
      appearance: config.character.appearance,
      clothing: config.character.clothes,
      physicalTraits: [config.character.hair, config.character.beard].filter(Boolean),
      defaultPose: 'standing',
      animationStyle: 'realistic',
    },
    environment: {
      preset: config.environment,
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
      cameraA: cameraToCameraConfig(config.cameraA),
      cameraB: cameraToCameraConfig(config.cameraB),
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
      aspectRatio: 16 / 9,
      forbiddenVisualElements: [],
      requiredVisualElements: [],
      compositionRules: [],
    },
    visualStyle: config.visualStyle,
    detailLevel: config.detailLevel,
    references: [],
    updatedAt: createdAt,
  };
}

function cameraToCameraConfig(camera: Camera): CameraConfig {
  const positions: Record<string, Point> = {
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
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 1000,
    movement: camera.allowedMovement,
  };
}

export class ProjectAssemblerStage {
  name = 'assembly';

  execute(context: PipelineContext): StageResult<Project> {
    if (!context.config || !context.blueprint || !context.dna || !context.worldState ||
        !context.spatialMap || !context.dependencyGraph || !context.operations ||
        !context.scenes || !context.storyboard || !context.createdAt) {
      return { success: false, error: new Error('Missing required context for project assembly') };
    }

    try {
      const constructionState = createProjectConstructionSnapshot(
        context.scenes,
        context.worldState,
        context.worldState.materials
      );

      const timeline = createConstructionTimeline(
        context.blueprint.id,
        context.scenes
      );

      const project: Project = {
        id: `${context.blueprint.id}_${context.createdAt}`,
        name: context.config.name,
        dna: context.dna,
        visualDNA: context.visualDNA ?? createDefaultVisualDNA(context.config, context.createdAt, context.blueprint.id),
        constructionState,
        timeline,
        worldState: context.worldState,
        spatialMap: context.spatialMap,
        dependencyGraph: context.dependencyGraph,
        operations: context.operations,
        scenes: context.scenes,
        storyboard: context.storyboard,
        blueprint: context.blueprint,
        config: context.config,
        cinematicScenes: context.cinematicScenes,
        plannedEpisodes: context.plannedEpisodes,
        episodePlan: context.episodePlan,
        createdAt: context.createdAt,
        updatedAt: context.createdAt,
      };

      context.project = project;

      return { success: true, data: project };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.project) {
      return { success: false, error: new Error('Project not assembled') };
    }
    if (!context.project.id || !context.project.name || !context.project.dna) {
      return { success: false, error: new Error('Project missing required fields') };
    }
    return { success: true };
  }
}
