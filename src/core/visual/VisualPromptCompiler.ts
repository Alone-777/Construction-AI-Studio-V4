import type { VisualSceneState, VisualElement, SceneMetadata, CameraConfig, LensConfig, LightingConfig, SceneAction, Point } from './VisualSceneState';
import type { VisualDNA } from '../types/project';
import type { ConstructionStateSnapshot } from '../types/construction-state';
import type { ConstructionTimeline, ConstructionTimelineFrame } from '../types/construction-timeline';
import type { SimulationEvent, SimulationResult } from '../types/construction-simulation';
import type { ConstructionDecision } from '../decision';

/**
 * Resultado da compilação do prompt visual
 */
export interface VisualPromptResult {
  /** Prompt compilado completo */
  prompt: string;
  /** Seções individuais do prompt para debug/edição */
  sections: {
    scene: string;
    environment: string;
    construction: string;
    materials: string;
    elements: string;
    camera: string;
    lens: string;
    lighting: string;
    action: string;
    visualDNA: string;
    constructionState: string;
    timeline: string;
    simulation: string;
    decision: string;
  };
  /** Metadados da compilação */
  metadata: {
    timestamp: number;
    elementCount: number;
    hasCameraMovement: boolean;
    hasDepthOfField: boolean;
    hasCustomLighting: boolean;
  };
}

/**
 * Mapeia tipo de movimento da câmera para descrição cinematográfica
 */
function cameraMovementToString(movement: CameraConfig['movement']): string {
  const movementMap: Record<CameraConfig['movement'], string> = {
    FIXA: 'static camera, locked off',
    FOLLOW: 'follow camera, tracking subject',
    CUT: 'hard cut, instant transition',
    DOLLY: 'dolly shot, smooth push/pull',
    PAN: 'pan shot, horizontal rotation',
    TILT: 'tilt shot, vertical rotation',
    CRANE: 'crane shot, vertical elevation change',
  };
  return movementMap[movement] || movement;
}

/**
 * Mapeia horário do dia para descrição cinematográfica
 */
function timeOfDayToString(timeOfDay: SceneMetadata['timeOfDay']): string {
  const timeMap: Record<SceneMetadata['timeOfDay'], string> = {
    dawn: 'dawn, golden hour, soft warm light',
    day: 'bright daylight, high sun',
    dusk: 'dusk, golden hour, long shadows',
    night: 'night, moonlight, dark atmosphere',
  };
  return timeMap[timeOfDay] || timeOfDay;
}

/**
 * Mapeia clima para descrição cinematográfica
 */
function weatherToString(weather: SceneMetadata['weather']): string {
  const weatherMap: Record<SceneMetadata['weather'], string> = {
    clear: 'clear sky',
    cloudy: 'overcast, soft diffused light',
    rain: 'rainy, wet surfaces, reflections',
    storm: 'stormy, dramatic clouds, lightning',
    fog: 'foggy, atmospheric, low visibility',
  };
  return weatherMap[weather] || weather;
}

/**
 * Formata coordenadas Point para string
 */
function pointToString(point: Point): string {
  return `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
}

/**
 * Gera seção de cena (metadados)
 */
function compileSceneSection(scene: SceneMetadata): string {
  const parts = [];

  parts.push(`SCENE: ${scene.title || 'Untitled Scene'}`);
  if (scene.description) parts.push(`DESCRIPTION: ${scene.description}`);
  parts.push(`LOCATION: ${scene.locationType || 'Unknown'}`);

  const timeStr = timeOfDayToString(scene.timeOfDay);
  const weatherStr = weatherToString(scene.weather);
  parts.push(`TIME: ${timeStr}`);
  parts.push(`WEATHER: ${weatherStr}`);

  return parts.join(' | ');
}

/**
 * Gera seção de ambiente
 */
function compileEnvironmentSection(env: VisualSceneState['environment']): string {
  const parts = [];

  if (env.terrain.type) parts.push(`TERRAIN: ${env.terrain.type}`);
  if (env.terrain.slope) parts.push(`SLOPE: ${env.terrain.slope}`);
  if (env.terrain.vegetation) parts.push(`VEGETATION: ${env.terrain.vegetation}`);
  if (env.terrain.soil) parts.push(`SOIL: ${env.terrain.soil}`);
  if (env.climate) parts.push(`CLIMATE: ${env.climate}`);
  if (env.light) parts.push(`LIGHT: ${env.light}`);

  return parts.length > 0 ? parts.join(' | ') : 'DEFAULT ENVIRONMENT';
}

/**
 * Gera seção de construção
 */
function compileConstructionSection(construction: VisualSceneState['construction']): string {
  const parts = [];

  if (construction.type) parts.push(`CONSTRUCTION: ${construction.type}`);
  if (construction.progress > 0) parts.push(`PROGRESS: ${construction.progress}%`);
  if (construction.status) parts.push(`STATUS: ${construction.status}`);

  if (construction.existingComponents.length > 0) {
    parts.push(`EXISTING: ${construction.existingComponents.join(', ')}`);
  }
  if (construction.partialComponents.length > 0) {
    parts.push(`IN PROGRESS: ${construction.partialComponents.join(', ')}`);
  }
  if (construction.futureComponents.length > 0) {
    parts.push(`PENDING: ${construction.futureComponents.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'NO CONSTRUCTION DATA';
}

/**
 * Gera seção de materiais
 */
function compileMaterialsSection(materials: VisualSceneState['materials']): string {
  const parts = [];

  if (materials.materials.length > 0) {
    const matStr = materials.materials.map(m => `${m.materialId} (${m.quantity})`).join(', ');
    parts.push(`MATERIALS: ${matStr}`);
  }
  if (materials.consumedMaterials.length > 0) {
    const consumedStr = materials.consumedMaterials.map(m => `${m.materialId} (${m.quantity})`).join(', ');
    parts.push(`CONSUMED: ${consumedStr}`);
  }
  if (materials.residues.length > 0) {
    const residueStr = materials.residues.map(r => `${r.source} -> ${r.materialId} (${r.quantity})`).join(', ');
    parts.push(`RESIDUES: ${residueStr}`);
  }
  if (materials.tools.length > 0) {
    const toolsStr = materials.tools.map(t => `${t.toolId}@${t.location}`).join(', ');
    parts.push(`TOOLS: ${toolsStr}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'NO MATERIALS DATA';
}

/**
 * Gera seção de elementos visuais
 */
function compileElementsSection(elements: VisualElement[]): string {
  if (elements.length === 0) return 'NO VISUAL ELEMENTS';

  const visibleElements = elements.filter(e => e.visible);
  if (visibleElements.length === 0) return 'ALL ELEMENTS HIDDEN';

  const byType: Record<string, VisualElement[]> = {};
  for (const el of visibleElements) {
    if (!byType[el.type]) byType[el.type] = [];
    byType[el.type].push(el);
  }

  const parts = [];
  for (const [type, els] of Object.entries(byType)) {
    const typeLabel = type.toUpperCase();
    const names = els.map(e => {
      const name = e.name || 'unnamed';
      const pos = pointToString(e.position);
      const layer = `L${e.layer}`;
      const scale = e.scale !== 1 ? ` scale ${e.scale.toFixed(1)}` : '';
      const rot = e.rotation !== 0 ? ` rot ${e.rotation}°` : '';
      return `${name}@${pos} ${layer}${scale}${rot}`;
    }).join('; ');
    parts.push(`${typeLabel}: ${names}`);
  }

  return parts.join(' | ');
}

/**
 * Gera seção de câmera
 */
function compileCameraSection(cameraConfig: CameraConfig): string {
  const parts = [];

  parts.push(`POSITION: ${pointToString(cameraConfig.position)}`);
  parts.push(`TARGET: ${pointToString(cameraConfig.target)}`);
  parts.push(`FOV: ${cameraConfig.fov}°`);
  parts.push(`ASPECT: ${cameraConfig.aspectRatio.toFixed(2)}`);
  parts.push(`MOVEMENT: ${cameraMovementToString(cameraConfig.movement)}`);

  if (cameraConfig.path && cameraConfig.path.length > 0) {
    const pathStr = cameraConfig.path.map(pointToString).join(' -> ');
    parts.push(`PATH: ${pathStr}`);
  }
  if (cameraConfig.duration) {
    parts.push(`DURATION: ${cameraConfig.duration}s`);
  }

  return parts.join(' | ');
}

/**
 * Gera seção de lente
 */
function compileLensSection(lens: LensConfig): string {
  const parts = [];

  parts.push(`FOCAL: ${lens.focalLength}mm`);
  parts.push(`APERTURE: ${lens.aperture}`);
  parts.push(`FOCUS DISTANCE: ${lens.focusDistance}m`);

  if (lens.depthOfField) {
    parts.push('DEPTH OF FIELD: enabled');
  }

  return parts.join(' | ');
}

/**
 * Gera seção de iluminação
 */
function compileLightingSection(lighting: LightingConfig): string {
  const parts = [];

  parts.push(`TYPE: ${lighting.type.toUpperCase()}`);

  const key = lighting.keyLight;
  parts.push(`KEY: ${key.intensity.toFixed(1)} intensity, ${key.temperature}K, ${key.color}, dir ${pointToString(key.direction)}`);

  if (lighting.fillLight) {
    const fill = lighting.fillLight;
    parts.push(`FILL: ${fill.intensity.toFixed(1)} intensity, ${fill.color}, dir ${pointToString(fill.direction)}`);
  }

  if (lighting.ambientLight) {
    const ambient = lighting.ambientLight;
    parts.push(`AMBIENT: ${ambient.intensity.toFixed(1)} intensity, ${ambient.color}`);
  }

  parts.push(`SHADOWS: ${lighting.shadows ? 'ON' : 'OFF'}`);
  if (lighting.shadows) {
    parts.push(`SHADOW SOFTNESS: ${lighting.shadowSoftness.toFixed(2)}`);
  }

  return parts.join(' | ');
}

/**
 * Gera seção de ação
 */
function compileActionSection(action: SceneAction): string {
  const parts = [];

  parts.push(`ACTION: ${action.type.toUpperCase()}`);
  if (action.description) parts.push(`DESCRIPTION: ${action.description}`);
  if (action.actorId) parts.push(`ACTOR: ${action.actorId}`);
  if (action.targetId) parts.push(`TARGET: ${action.targetId}`);
  parts.push(`START: ${action.startTime.toFixed(1)}s`);
  parts.push(`DURATION: ${action.duration.toFixed(1)}s`);

  if (action.keyframes && action.keyframes.length > 0) {
    const kfStr = action.keyframes.map(kf =>
      `t${kf.time.toFixed(1)}s: ${pointToString(kf.position)} rot ${kf.rotation}°`
    ).join(' -> ');
    parts.push(`KEYFRAMES: ${kfStr}`);
  }

  return parts.join(' | ');
}

/**
 * Compila VisualSceneState para prompt cinematográfico estruturado
 *
 * @param scene Estado visual completo da cena
 * @param visualDNA DNA visual do projeto (opcional) para consistência visual
 * @param constructionState Snapshot do estado da construção (opcional)
 * @param timeline Timeline de construção (opcional) para contexto temporal
 * @param simulation Estado de simulação (opcional) para contexto de execução
 * @param decision Decisão de construção (opcional) para próxima ação
 * @returns VisualPromptResult com prompt completo, seções e metadados
 */
export function compileVisualScene(scene: VisualSceneState, visualDNA?: VisualDNA, constructionState?: ConstructionStateSnapshot, timeline?: ConstructionTimeline, simulation?: {
  lastOperationId: string;
  lastResult: SimulationResult;
  lastEvents: SimulationEvent[];
  currentOperationId: string | null;
  pendingOperations: string[];
  completedOperations: string[];
  failedOperations: string[];
}, decision?: ConstructionDecision): VisualPromptResult {
  const sceneSection = compileSceneSection(scene.scene);
  const environmentSection = compileEnvironmentSection(scene.environment);
  const constructionSection = compileConstructionSection(scene.construction);
  const materialsSection = compileMaterialsSection(scene.materials);
  const elementsSection = compileElementsSection(scene.elements);
  const cameraSection = compileCameraSection(scene.cameraConfig);
  const lensSection = compileLensSection(scene.lens);
  const lightingSection = compileLightingSection(scene.lighting);
  const actionSection = compileActionSection(scene.action);

  // Seções de consistência visual do VisualDNA
  const visualDNASections: string[] = [];

  if (visualDNA) {
    // Estilo visual global
    if (visualDNA.visualStyle) {
      visualDNASections.push(`VISUAL STYLE: ${visualDNA.visualStyle.toUpperCase()}`);
    }

    // Nível de detalhe
    if (visualDNA.detailLevel) {
      visualDNASections.push(`DETAIL LEVEL: ${visualDNA.detailLevel.toUpperCase()}`);
    }

    // Regras de consistência
    const consistency = visualDNA.consistencyRules;
    if (consistency) {
      if (consistency.lightingStyle) {
        visualDNASections.push(`LIGHTING STYLE: ${consistency.lightingStyle.toUpperCase()}`);
      }
      if (consistency.cameraStyle) {
        visualDNASections.push(`CAMERA STYLE: ${consistency.cameraStyle.toUpperCase()}`);
      }
      if (consistency.depthOfFieldDefault) {
        visualDNASections.push('DEPTH OF FIELD: DEFAULT ON');
      }
      if (consistency.aspectRatio) {
        visualDNASections.push(`ASPECT RATIO: ${consistency.aspectRatio.toFixed(2)}`);
      }
      if (consistency.colorPalette && consistency.colorPalette.length > 0) {
        visualDNASections.push(`COLOR PALETTE: ${consistency.colorPalette.join(', ')}`);
      }
      if (consistency.requiredVisualElements && consistency.requiredVisualElements.length > 0) {
        visualDNASections.push(`REQUIRED ELEMENTS: ${consistency.requiredVisualElements.join(', ')}`);
      }
      if (consistency.forbiddenVisualElements && consistency.forbiddenVisualElements.length > 0) {
        visualDNASections.push(`FORBIDDEN ELEMENTS: ${consistency.forbiddenVisualElements.join(', ')}`);
      }
      if (consistency.compositionRules && consistency.compositionRules.length > 0) {
        visualDNASections.push(`COMPOSITION RULES: ${consistency.compositionRules.join('; ')}`);
      }
    }

    // Referências visuais
    if (visualDNA.references && visualDNA.references.length > 0) {
      const refs = visualDNA.references
        .filter(r => r.description)
        .map(r => `${r.type}: ${r.description} (weight: ${r.weight})`)
        .join('; ');
      if (refs) {
        visualDNASections.push(`VISUAL REFERENCES: ${refs}`);
      }
    }
  }

  // Seções do Construction State Snapshot
  const constructionStateSections: string[] = [];

  if (constructionState) {
    // Estado da construção
    const stateParts: string[] = [];
    if (constructionState.completedElements.length > 0) {
      stateParts.push(`COMPLETED: ${constructionState.completedElements.join(', ')}`);
    }
    if (constructionState.activeElements.length > 0) {
      stateParts.push(`ACTIVE: ${constructionState.activeElements.join(', ')}`);
    }
    if (constructionState.pendingElements.length > 0) {
      stateParts.push(`PENDING: ${constructionState.pendingElements.join(', ')}`);
    }
    if (stateParts.length > 0) {
      constructionStateSections.push(`STATE:\n${stateParts.join('\n')}`);
    }

    // Estado dos materiais
    const materialParts: string[] = [];
    if (constructionState.materialState.available.length > 0) {
      materialParts.push(`AVAILABLE: ${constructionState.materialState.available.join(', ')}`);
    }
    if (constructionState.materialState.consumed.length > 0) {
      materialParts.push(`CONSUMED: ${constructionState.materialState.consumed.join(', ')}`);
    }
    if (constructionState.materialState.remaining.length > 0) {
      materialParts.push(`REMAINING: ${constructionState.materialState.remaining.join(', ')}`);
    }
    if (materialParts.length > 0) {
      constructionStateSections.push(`MATERIAL STATE:\n${materialParts.join('\n')}`);
    }

    // Estado do worker
    const workerParts: string[] = [];
    if (constructionState.workerState.position) {
      workerParts.push(`POSITION: ${constructionState.workerState.position}`);
    }
    if (constructionState.workerState.action) {
      workerParts.push(`ACTION: ${constructionState.workerState.action}`);
    }
    if (constructionState.workerState.tools.length > 0) {
      workerParts.push(`TOOLS: ${constructionState.workerState.tools.join(', ')}`);
    }
    if (workerParts.length > 0) {
      constructionStateSections.push(`WORKER STATE:\n${workerParts.join('\n')}`);
    }
  }

  // Seções do Construction Timeline
  const timelineSections: string[] = [];

  if (timeline) {
    const currentFrame = timeline.frames.find(f => f.id === timeline.currentFrameId);
    const previousFrame = currentFrame?.previousFrameId ? timeline.frames.find(f => f.id === currentFrame.previousFrameId) : undefined;
    const nextFrame = currentFrame?.nextFrameId ? timeline.frames.find(f => f.id === currentFrame.nextFrameId) : undefined;

    // Previous state
    if (previousFrame) {
      const prevParts: string[] = [];
      if (previousFrame.state.completedElements.length > 0) {
        prevParts.push(`COMPLETED: ${previousFrame.state.completedElements.join(', ')}`);
      }
      if (previousFrame.state.activeElements.length > 0) {
        prevParts.push(`ACTIVE: ${previousFrame.state.activeElements.join(', ')}`);
      }
      if (previousFrame.state.pendingElements.length > 0) {
        prevParts.push(`PENDING: ${previousFrame.state.pendingElements.join(', ')}`);
      }
      if (previousFrame.state.progress > 0) {
        prevParts.push(`PROGRESS: ${previousFrame.state.progress}%`);
      }
      if (prevParts.length > 0) {
        timelineSections.push(`PREVIOUS STATE:\n${prevParts.join('\n')}`);
      }
    }

    // Current state
    if (currentFrame) {
      const currParts: string[] = [];
      if (currentFrame.state.completedElements.length > 0) {
        currParts.push(`COMPLETED: ${currentFrame.state.completedElements.join(', ')}`);
      }
      if (currentFrame.state.activeElements.length > 0) {
        currParts.push(`ACTIVE: ${currentFrame.state.activeElements.join(', ')}`);
      }
      if (currentFrame.state.pendingElements.length > 0) {
        currParts.push(`PENDING: ${currentFrame.state.pendingElements.join(', ')}`);
      }
      if (currentFrame.state.progress > 0) {
        currParts.push(`PROGRESS: ${currentFrame.state.progress}%`);
      }
      if (currentFrame.visualChanges.added.length > 0) {
        currParts.push(`ADDED: ${currentFrame.visualChanges.added.join(', ')}`);
      }
      if (currentFrame.visualChanges.removed.length > 0) {
        currParts.push(`REMOVED: ${currentFrame.visualChanges.removed.join(', ')}`);
      }
      if (currentFrame.visualChanges.modified.length > 0) {
        currParts.push(`MODIFIED: ${currentFrame.visualChanges.modified.join(', ')}`);
      }
      if (currParts.length > 0) {
        timelineSections.push(`CURRENT STATE:\n${currParts.join('\n')}`);
      }
    }

    // Next state
    if (nextFrame) {
      const nextParts: string[] = [];
      if (nextFrame.state.completedElements.length > 0) {
        nextParts.push(`COMPLETED: ${nextFrame.state.completedElements.join(', ')}`);
      }
      if (nextFrame.state.activeElements.length > 0) {
        nextParts.push(`ACTIVE: ${nextFrame.state.activeElements.join(', ')}`);
      }
      if (nextFrame.state.pendingElements.length > 0) {
        nextParts.push(`PENDING: ${nextFrame.state.pendingElements.join(', ')}`);
      }
      if (nextFrame.state.progress > 0) {
        nextParts.push(`PROGRESS: ${nextFrame.state.progress}%`);
      }
      if (nextParts.length > 0) {
        timelineSections.push(`NEXT STATE:\n${nextParts.join('\n')}`);
      }
    }
  }

  // Seções do Simulation State
  const simulationSections: string[] = [];

  if (simulation) {
    // Last action
    if (simulation.lastOperationId) {
      simulationSections.push(`LAST ACTION: ${simulation.lastOperationId}`);
    }

    // Last simulation result
    if (simulation.lastResult) {
      const resultParts: string[] = [];
      resultParts.push(`SUCCESS: ${simulation.lastResult.success}`);
      if (simulation.lastResult.timelineFrameId) {
        resultParts.push(`TIMELINE FRAME: ${simulation.lastResult.timelineFrameId}`);
      }
      if (simulation.lastResult.events && simulation.lastResult.events.length > 0) {
        const eventTypes = [...new Set(simulation.lastResult.events.map(e => e.type))];
        resultParts.push(`EVENTS: ${eventTypes.join(', ')}`);
      }
      simulationSections.push(`LAST RESULT:\n${resultParts.join('\n')}`);
    }

    // Current worker action
    if (simulation.currentOperationId) {
      simulationSections.push(`CURRENT WORKER ACTION: ${simulation.currentOperationId}`);
    }

    // Material status from last events
    if (simulation.lastEvents && simulation.lastEvents.length > 0) {
      const materialEvents = simulation.lastEvents.filter(e => e.type === 'MATERIAL_USED');
      if (materialEvents.length > 0) {
        const materialParts: string[] = [];
        for (const evt of materialEvents) {
          if (evt.payload.success === true && evt.payload.consumed) {
            for (const [materialId, quantity] of Object.entries(evt.payload.consumed as Record<string, number>)) {
              materialParts.push(`${materialId}: -${quantity}`);
            }
          } else if (evt.payload.success === false && evt.payload.missing) {
            materialParts.push(`MISSING: ${evt.payload.missing.join(', ')}`);
          }
        }
        if (materialParts.length > 0) {
          simulationSections.push(`MATERIAL STATUS:\n${materialParts.join('\n')}`);
        }
      }
    }

    // Pending/Completed operations
    if (simulation.completedOperations && simulation.completedOperations.length > 0) {
      simulationSections.push(`COMPLETED OPERATIONS: ${simulation.completedOperations.join(', ')}`);
    }
    if (simulation.pendingOperations && simulation.pendingOperations.length > 0) {
      simulationSections.push(`PENDING OPERATIONS: ${simulation.pendingOperations.join(', ')}`);
    }
    if (simulation.failedOperations && simulation.failedOperations.length > 0) {
      simulationSections.push(`FAILED OPERATIONS: ${simulation.failedOperations.join(', ')}`);
    }
  }

  // Seções do Decision State
  const decisionSections: string[] = [];

  if (decision) {
    if (decision.action) {
      decisionSections.push(`NEXT ACTION: ${decision.action}`);
    }
    if (decision.operationId) {
      decisionSections.push(`NEXT OPERATION: ${decision.operationId}`);
    }
    if (decision.reason) {
      decisionSections.push(`REASON: ${decision.reason}`);
    }
    if (decision.confidence !== undefined) {
      decisionSections.push(`CONFIDENCE: ${(decision.confidence * 100).toFixed(0)}%`);
    }
  }

  // Monta o prompt final no formato cinematográfico
  const promptParts = [
    sceneSection,
    environmentSection,
    constructionSection,
    materialsSection,
    elementsSection,
    cameraSection,
    lensSection,
    lightingSection,
    actionSection,
    ...visualDNASections,
    ...constructionStateSections,
    ...timelineSections,
    ...simulationSections,
    ...decisionSections,
  ].filter(part => part && part !== 'NO VISUAL ELEMENTS' && part !== 'DEFAULT ENVIRONMENT' && part !== 'NO CONSTRUCTION DATA' && part !== 'NO MATERIALS DATA' && part !== 'ALL ELEMENTS HIDDEN');

  const prompt = promptParts.join('\n\n');

  return {
    prompt,
    sections: {
      scene: sceneSection,
      environment: environmentSection,
      construction: constructionSection,
      materials: materialsSection,
      elements: elementsSection,
      camera: cameraSection,
      lens: lensSection,
      lighting: lightingSection,
      action: actionSection,
      visualDNA: visualDNASections.join(' | '),
      constructionState: constructionStateSections.join(' | '),
      timeline: timelineSections.join(' | '),
      simulation: simulationSections.join(' | '),
      decision: decisionSections.join(' | '),
    },
    metadata: {
      timestamp: Date.now(),
      elementCount: scene.elements.length,
      hasCameraMovement: scene.cameraConfig.movement !== 'FIXA',
      hasDepthOfField: scene.lens.depthOfField,
      hasCustomLighting: scene.lighting.type !== 'natural' ||
        (scene.lighting.fillLight !== undefined && scene.lighting.fillLight.intensity > 0) ||
        (scene.lighting.ambientLight !== undefined && scene.lighting.ambientLight.intensity > 0),
    },
  };
}

/**
 * Gera versão curta do prompt (para uso em APIs com limite de tokens)
 */
export function compileVisualSceneShort(scene: VisualSceneState, visualDNA?: VisualDNA): string {
  const result = compileVisualScene(scene, visualDNA);

  // Versão resumida: apenas as partes essenciais
  const essentialParts = [
    result.sections.scene,
    result.sections.environment,
    result.sections.construction,
    result.sections.camera,
    result.sections.lens,
    result.sections.lighting,
    result.sections.visualDNA,
  ].filter(Boolean);

  return essentialParts.join(' | ');
}

/**
 * Gera prompt focado apenas na composição visual (sem ação/tempo)
 */
export function compileVisualSceneCompositionOnly(scene: VisualSceneState, visualDNA?: VisualDNA): string {
  const result = compileVisualScene(scene, visualDNA);

  const compositionParts = [
    result.sections.scene,
    result.sections.environment,
    result.sections.construction,
    result.sections.materials,
    result.sections.elements,
    result.sections.camera,
    result.sections.lens,
    result.sections.lighting,
    result.sections.visualDNA,
  ].filter(Boolean);

  return compositionParts.join('\n\n');
}