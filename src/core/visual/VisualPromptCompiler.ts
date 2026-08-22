import type { VisualSceneState, VisualElement, SceneMetadata, CameraConfig, LensConfig, LightingConfig, SceneAction, Point } from './VisualSceneState';

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
 * @returns VisualPromptResult com prompt completo, seções e metadados
 */
export function compileVisualScene(scene: VisualSceneState): VisualPromptResult {
  const sceneSection = compileSceneSection(scene.scene);
  const environmentSection = compileEnvironmentSection(scene.environment);
  const constructionSection = compileConstructionSection(scene.construction);
  const materialsSection = compileMaterialsSection(scene.materials);
  const elementsSection = compileElementsSection(scene.elements);
  const cameraSection = compileCameraSection(scene.cameraConfig);
  const lensSection = compileLensSection(scene.lens);
  const lightingSection = compileLightingSection(scene.lighting);
  const actionSection = compileActionSection(scene.action);

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
export function compileVisualSceneShort(scene: VisualSceneState): string {
  const result = compileVisualScene(scene);

  // Versão resumida: apenas as partes essenciais
  const essentialParts = [
    result.sections.scene,
    result.sections.environment,
    result.sections.construction,
    result.sections.camera,
    result.sections.lens,
    result.sections.lighting,
  ].filter(Boolean);

  return essentialParts.join(' | ');
}

/**
 * Gera prompt focado apenas na composição visual (sem ação/tempo)
 */
export function compileVisualSceneCompositionOnly(scene: VisualSceneState): string {
  const result = compileVisualScene(scene);

  const compositionParts = [
    result.sections.scene,
    result.sections.environment,
    result.sections.construction,
    result.sections.materials,
    result.sections.elements,
    result.sections.camera,
    result.sections.lens,
    result.sections.lighting,
  ].filter(Boolean);

  return compositionParts.join('\n\n');
}