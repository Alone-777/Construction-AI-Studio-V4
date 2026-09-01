import type { WorldState, VisualDNA, ConstructionStateSnapshot, ConstructionTimeline, SimulationResult, SimulationEvent, ConstructionDecision, ProjectConfig, ProjectDNA } from '../../../types';
import { generateKlingPrompt } from '../../../prompts/kling';
import { worldStateToVisualSceneState } from '../../../visual/VisualSceneState';
import { compileVisualScene } from '../../../visual/VisualPromptCompiler';
import { buildStageVisualStateSnapshots } from '../../../visual-state/visual-state-snapshot';
import { compileCanonicalImagePromptSpec } from '../../../image-prompts/canonical-image-prompt-compiler';
import { adaptCanonicalImagePromptToNanoBanana } from '../../../image-prompts/nano-banana-prompt-adapter';
import type { PipelineContext, StageResult } from '../types';
import type { Camera } from '../../../types/camera';
import type { LightingConfig, CameraConfig, LensConfig, SceneMetadata } from '../../../visual/VisualSceneState';

/**
 * Stage 8: Prompts Generation
 * Generates Visual, NanoBanana and Kling prompts for each stage
 */
export class PromptsGeneratorStage {
  name = 'prompts';

  /**
   * Builds minimal visualDNA from pipeline context (config, dna, worldState)
   * Used when ProjectAssemblerStage hasn't run yet (visualDNA not available)
   */
  private buildMinimalVisualDNA(context: PipelineContext, worldState: WorldState): VisualDNA {
    const config = context.config!;
    const dna = context.dna!;
    const blueprintId = context.blueprint.id;
    const createdAt = context.createdAt;

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
  private cameraToConfig(camera: Camera): CameraConfig {
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
      movement: camera.allowedMovement as CameraConfig['movement'],
    };
  }

  execute(context: PipelineContext): StageResult {
    if (!context.scenes || !context.operations || !context.dna || !context.spatialMap ||
        !context.worldState) {
      return {
        success: false,
        error: new Error('Missing required context for prompt generation'),
      };
    }

    // Preserve the legacy VisualPromptCompiler input for visual prompts.
    const visualDNA = context.visualDNA ?? this.buildMinimalVisualDNA(context, context.worldState);

    try {
      for (const scene of context.scenes) {
        const operation = context.operations.find(candidate => candidate.id === scene.operationId);
        if (!operation) {
          throw new Error(`Missing operation ${scene.operationId} for scene ${scene.id}`);
        }

        for (const stage of scene.stages) {
          if (stage.status === 'rejected') {
            // A rejected candidate is evidence, never an official image prompt.
            stage.prompts = undefined;
            continue;
          }

          const unexecuted = !stage.worldStateBefore && !stage.worldStateAfter &&
            !stage.physicalActionIR && !stage.decision;
          if (unexecuted) {
            stage.prompts = undefined;
            continue;
          }

          const promptState: WorldState | undefined = stage.worldStateBefore;

          if (!promptState) {
            return {
              success: false,
              error: new Error(
                `Missing worldStateBefore for stage ${stage.percentage}% of scene ${scene.id}. Cannot generate prompt without pre-stage world state.`
              ),
            };
          }
          if (!stage.worldStateAfter) {
            return {
              success: false,
              error: new Error(
                `Missing worldStateAfter for executed stage ${stage.percentage}% of scene ${scene.id}. Canonical Nano Banana prompt cannot be generated.`
              ),
            };
          }
          if (!stage.physicalActionIR) {
            return {
              success: false,
              error: new Error(
                `Missing PhysicalActionIR for executed stage ${stage.percentage}% of scene ${scene.id}. Legacy Nano Banana fallback is disabled.`
              ),
            };
          }
          if (!stage.decision) {
            return {
              success: false,
              error: new Error(
                `Missing committed decision for executed stage ${stage.percentage}% of scene ${scene.id}. Official Nano Banana prompt cannot be generated.`
              ),
            };
          }

          const canonicalVisualDNA = context.visualDNA ??
            this.buildMinimalVisualDNA(context, promptState);
          const snapshots = buildStageVisualStateSnapshots({
            projectId: context.blueprint.id,
            scene,
            stage,
            operation,
            visualDNA: canonicalVisualDNA,
            spatialMap: context.spatialMap,
            cameras: context.dna.cameras,
          });
          const officialSnapshot = snapshots.official;
          if (!officialSnapshot || officialSnapshot.kind !== 'OFFICIAL' ||
              officialSnapshot.stageOutcome !== 'COMMITTED') {
            return {
              success: false,
              error: new Error(
                `Missing committed official VisualStateSnapshot for stage ${stage.percentage}% of scene ${scene.id}.`
              ),
            };
          }
          const canonicalSpec = compileCanonicalImagePromptSpec(officialSnapshot);
          if (!canonicalSpec) {
            return {
              success: false,
              error: new Error(
                `CanonicalImagePromptSpec could not be compiled for stage ${stage.percentage}% of scene ${scene.id}.`
              ),
            };
          }
          const nanoBananaOutput = adaptCanonicalImagePromptToNanoBanana(canonicalSpec, {
            mode: 'GENERATE',
            profile: 'FULL',
          });

          stage.prompts = {
            visual: compileVisualScene(
              worldStateToVisualSceneState(promptState),
              visualDNA,
              context.project?.constructionState
            ).prompt,

            nanoBanana: `${nanoBananaOutput.prompt}\n\n${nanoBananaOutput.negativePrompt}`,

            kling: generateKlingPrompt(
              scene,
              stage,
              promptState,
              context.dna
            ).fullText,
          };
        }
      }

      return {
        success: true,
      };

    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error(String(error)),
      };
    }
  }

  validate(context: PipelineContext): StageResult {
    if (!context.scenes) {
      return {
        success: false,
        error: new Error('No scenes to validate'),
      };
    }

    for (const scene of context.scenes) {
      for (const stage of scene.stages) {
        const unexecuted = !stage.worldStateBefore && !stage.worldStateAfter &&
          !stage.physicalActionIR && !stage.decision;
        if (stage.status === 'rejected' || unexecuted) {
          if (stage.prompts?.nanoBanana) {
            return {
              success: false,
              error: new Error(
                `Stage ${stage.percentage}% of scene ${scene.id} must not have an official Nano Banana prompt`
              ),
            };
          }
          continue;
        }
        if (
          !stage.prompts?.visual ||
          !stage.prompts?.nanoBanana ||
          !stage.prompts?.kling
        ) {
          return {
            success: false,
            error: new Error(
              `Stage ${stage.percentage}% of scene ${scene.id} missing prompts`
            ),
          };
        }
      }
    }

    return {
      success: true,
    };
  }
}
