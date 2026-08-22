import type {
  AdaptiveZoneDefinition,
  ConstructionComponent,
  ConstructionRule,
  DependencyGraph,
  JumpRisk,
  Operation,
  Project,
  ProjectConfig,
  Residue,
  Scene,
  StoryboardEntry,
  ToolInstance,
  Transformation,
  WorldState,
} from '../types';
import { createProjectDNA } from './project-dna';
import { createAdaptiveZones, createSpatialMap } from './spatial-map';
import {
  addComponent,
  addEdge,
  createDependencyGraph,
  updateComponentStatus,
} from './dependency-graph';
import { analyzeTopology } from './topology';
import { generateProgression } from './progression';
import { createInitialWorldState, applyTransformation, snapshotState } from './world-state';
import { changeTool, moveCharacter } from './character';
import { planWorkRoute } from './work-route';
import { generateExecutionProof } from './execution-proof';
import { generateMicroTimeline } from './timeline';
import { FiscalRunner } from '../fiscals/fiscal-runner';
import { generateNanoBananaPrompt } from '../prompts/nano-banana';
import { generateKlingPrompt } from '../prompts/kling';

export interface BlueprintMaterialStock {
  materialId: string;
  quantity: number;
  location: string;
  origin: string;
}

export interface BlueprintToolStock {
  toolId: string;
  location: string;
}

export interface BlueprintOperation {
  id: string;
  name: string;
  type: string;
  componentId: string;
  elements: string[];
  zones: string[];
  tool: string;
  physicalAction: string;
  materialUse?: Record<string, number>;
  residue?: Omit<Residue, 'id' | 'location'>;
  visualBasis?: NonNullable<Operation['visualBasis']>;
}

export interface ConstructionBlueprint {
  id: string;
  map: { id: string; width: number; height: number; zones: AdaptiveZoneDefinition[] };
  components: Omit<ConstructionComponent, 'status'>[];
  operations: BlueprintOperation[];
  materials: BlueprintMaterialStock[];
  tools: BlueprintToolStock[];
  protectedZoneIds: string[];
  restrictions: string[];
  permanentObjects: string[];
  forbiddenElements: string[];
  rules: ConstructionRule[];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function maxRisk(a: JumpRisk, b: JumpRisk): JumpRisk {
  const weights: Record<JumpRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return weights[b] > weights[a] ? b : a;
}

function consumeMaterials(
  state: WorldState,
  operation: BlueprintOperation,
  location: string,
): Pick<WorldState, 'materials' | 'consumedMaterials'> {
  const materials = state.materials.map(material => ({ ...material }));
  const consumedMaterials = state.consumedMaterials.map(material => ({ ...material }));

  for (const [materialId, quantity] of Object.entries(operation.materialUse ?? {})) {
    const source = materials.find(material => material.materialId === materialId);
    if (!source || source.quantity < quantity) {
      throw new Error(`Material insuficiente para ${operation.id}: ${materialId}`);
    }
    source.quantity -= quantity;
    consumedMaterials.push({
      materialId,
      quantity,
      status: 'incorporado',
      location,
      origin: `operação:${operation.id}`,
    });
  }

  return { materials, consumedMaterials };
}

function updateTools(
  tools: ToolInstance[],
  activeTool: string,
  location: string,
  characterId: string,
): ToolInstance[] {
  return tools.map(tool => tool.toolId === activeTool
    ? { ...tool, status: 'em_uso', location, carrier: characterId, inUse: true }
    : { ...tool, status: 'armazenada', carrier: undefined, inUse: false });
}

/**
 * Orquestra um blueprint usando exclusivamente os motores do Core. O blueprint
 * descreve domínio; estados, progressão, rotas, cenas, provas e validações são
 * derivados, o que impede uma demonstração desconectada da lógica real.
 */
export function createProjectFromBlueprint(
  config: ProjectConfig,
  blueprint: ConstructionBlueprint,
): Project {
  const createdAt = Date.now();
  const spatialMap = createAdaptiveZones(
    createSpatialMap(blueprint.map.id, blueprint.map.width, blueprint.map.height),
    blueprint.map.zones,
  );
  const visibleZones = spatialMap.zones.filter(zone => !zone.occluded).map(zone => zone.id);
  const dna = createProjectDNA(config);
  dna.cameras = {
    a: {
      ...dna.cameras.a,
      visibleZones: dna.cameras.a.visibleZones.length > 0 ? dna.cameras.a.visibleZones : visibleZones,
    },
    b: {
      ...dna.cameras.b,
      visibleZones: dna.cameras.b.visibleZones.length > 0 ? dna.cameras.b.visibleZones : visibleZones,
    },
  };
  dna.restrictions = unique([...dna.restrictions, ...blueprint.restrictions]);
  dna.permanentObjects = unique([...dna.permanentObjects, ...blueprint.permanentObjects]);
  dna.forbiddenElements = unique([...dna.forbiddenElements, ...blueprint.forbiddenElements]);
  dna.rules = [...dna.rules, ...blueprint.rules];

  const dependencyGraph: DependencyGraph = createDependencyGraph();
  for (const definition of blueprint.components) {
    addComponent(dependencyGraph, {
      ...definition,
      dependencies: [...definition.dependencies],
      zones: [...definition.zones],
      status: definition.dependencies.length === 0 ? 'READY' : 'BLOCKED',
    });
  }
  for (const component of blueprint.components) {
    for (const dependency of component.dependencies) {
      addEdge(dependencyGraph, dependency, component.id, true);
    }
  }

  let worldState = createInitialWorldState(dna, spatialMap);
  worldState.futureComponents = blueprint.components.map(component => component.id);
  worldState.materials = blueprint.materials.map(material => ({
    ...material,
    status: 'disponivel',
  }));
  worldState.tools = blueprint.tools.map(tool => ({
    ...tool,
    status: 'armazenada',
    inUse: false,
  }));
  worldState.vegetation = Object.fromEntries(
    spatialMap.zones.map(zone => [zone.id, blueprint.protectedZoneIds.includes(zone.id) ? 'protegida' : 'intacta']),
  );

  const operations: Operation[] = [];
  const scenes: Scene[] = [];
  const storyboard: StoryboardEntry[] = [];
  const fiscalRunner = new FiscalRunner();
  let previousScene: Scene | undefined;

  blueprint.operations.forEach((specification, operationIndex) => {
    const component = dependencyGraph.nodes.find(node => node.id === specification.componentId);
    if (!component) throw new Error(`Componente não encontrado: ${specification.componentId}`);
    if (!updateComponentStatus(dependencyGraph, component.id, 'ACTIVE')) {
      throw new Error(`Dependências não satisfeitas para ${component.id}`);
    }

    const topology = analyzeTopology(specification.elements, specification.type, specification.zones);
    const operation: Operation = {
      id: specification.id,
      name: specification.name,
      type: specification.type,
      componentId: specification.componentId,
      elements: [...specification.elements],
      zones: [...specification.zones],
      visualBasis: specification.visualBasis ? { ...specification.visualBasis } : undefined,
      stages: [0, 25, 50, 75, 100],
      topology: topology.recommendedType,
      estimatedDuration: config.sceneDuration,
      scenes: [],
    };
    const sceneId = `scene_${specification.id}`;
    operation.scenes = [sceneId];
    operations.push(operation);

    const stages = generateProgression(
      specification.id,
      specification.type,
      specification.elements,
      specification.zones,
      { component: component.id, status: component.status },
    );
    const plannedRoute = planWorkRoute(
      spatialMap,
      worldState.character.currentZone,
      unique(stages.map(stage => stage.activeZone)),
      specification.name,
    );
    const scene: Scene = {
      id: sceneId,
      number: operationIndex + 1,
      timecodeStart: operationIndex * config.sceneDuration,
      timecodeEnd: (operationIndex + 1) * config.sceneDuration,
      duration: config.sceneDuration,
      operationId: operation.id,
      stages,
      camera: 'A/B',
      activeZones: unique(stages.map(stage => stage.activeZone)),
      characterId: dna.character.id,
      status: 'draft',
      riskLevel: 'LOW',
      microTimeline: generateMicroTimeline(operation),
    };

    let sceneApproved = true;
    let sceneRisk: JumpRisk = 'LOW';
    stages.forEach((stage, stageIndex) => {
      const before = snapshotState(worldState);
      const movement = moveCharacter(before.character, stage.activeZone, spatialMap);
      if (movement.error) throw new Error(movement.error.message);

      let character = movement.newState;
      if (stage.percentage > 0 && character.currentTool !== specification.tool) {
        character = changeTool(character, undefined).newState;
        character = changeTool(character, specification.tool).newState;
      }
      character = {
        ...character,
        currentAction: stage.percentage === 0
          ? `inspecionar ${specification.name.toLowerCase()}`
          : specification.physicalAction,
      };

      stage.component = component.id;
      stage.tool = stage.percentage === 0 ? undefined : specification.tool;
      stage.physicalAction = stage.percentage === 0
        ? `Inspecionar, medir e marcar ${specification.name.toLowerCase()}`
        : `${specification.physicalAction} — marco ${stage.percentage}%`;
      stage.displacement = before.character.currentZone === stage.activeZone
        ? undefined
        : { from: before.character.currentZone, to: stage.activeZone };
      const plannedStep = plannedRoute.sequence.find(step =>
        step.fromZone === before.character.currentZone && step.toZone === stage.activeZone
      );
      stage.workRoute = plannedStep?.route.length ? plannedStep.route : movement.route;
      stage.preservedZones = unique([...stage.preservedZones, ...blueprint.protectedZoneIds]);

      const isPartial = stage.percentage > 0 && stage.percentage < 100;
      const isComplete = stage.percentage === 100;
      const existingComponents = isComplete
        ? unique([...before.existingComponents, component.id])
        : [...before.existingComponents];
      const partialComponents = before.partialComponents.filter(id => id !== component.id);
      if (isPartial) partialComponents.push(component.id);
      const futureComponents = isComplete
        ? before.futureComponents.filter(id => id !== component.id)
        : [...before.futureComponents];
      const overallProgress = Math.round(
        ((operationIndex + stage.percentage / 100) / blueprint.operations.length) * 100,
      );
      const materialState = isComplete
        ? consumeMaterials(before, specification, stage.activeZone)
        : { materials: before.materials, consumedMaterials: before.consumedMaterials };
      const residues = before.residues.map(residue => ({ ...residue }));
      if (stage.percentage === 25 && specification.residue) {
        residues.push({
          ...specification.residue,
          id: `residue_${specification.id}_${stageIndex}`,
          location: stage.activeZone,
        });
      }

      const transformation: Transformation = {
        id: `transform_${specification.id}_${stage.percentage}`,
        sceneId,
        stageId: String(stage.percentage),
        logicalTimestamp: operationIndex * 5 + stageIndex,
        zone: stage.activeZone,
        actor: character.characterId,
        tool: stage.tool,
        material: Object.keys(specification.materialUse ?? {})[0],
        before: stage.initialState,
        action: stage.percentage === 0 ? 'INSPECIONAR' : 'CONSTRUIR',
        after: {
          construction: {
            ...before.construction,
            progress: overallProgress,
            status: overallProgress === 100 ? 'concluída' : 'em andamento',
          },
          existingComponents,
          partialComponents: unique(partialComponents),
          futureComponents,
          materials: materialState.materials,
          consumedMaterials: materialState.consumedMaterials,
          residues,
          tools: stage.percentage === 0
            ? before.tools
            : updateTools(before.tools, specification.tool, stage.activeZone, character.characterId),
          character,
          camera: stage.cameraId,
        },
        evidence: stage.visualEvidence,
        consumption: isComplete ? Object.keys(specification.materialUse ?? {}) : [],
        movement: stage.workRoute,
      };
      const after = applyTransformation(before, transformation);

      stage.initialState = {
        ...stage.initialState,
        progress: before.construction.progress,
        existingComponents: before.existingComponents,
        partialComponents: before.partialComponents,
      };
      stage.finalState = {
        ...stage.finalState,
        progress: after.construction.progress,
        existingComponents: after.existingComponents,
        partialComponents: after.partialComponents,
      };
      stage.worldStateBefore = before;
      stage.worldStateAfter = after;
      stage.executionProof = generateExecutionProof(stage);

      const report = fiscalRunner.runAllFiscals({
        scene,
        stage,
        worldStateBefore: before,
        worldStateAfter: after,
        transformation,
        spatialMap,
        dependencyGraph,
        character: after.character,
        previousScene,
        projectDNA: dna,
        operation,
      });
      stage.validations = report.results;
      stage.qualityScore = report.qualityScore;
      stage.jumpRisk = report.jumpRisk;
      sceneApproved = sceneApproved && report.approved;
      sceneRisk = maxRisk(sceneRisk, report.jumpRisk);
      worldState = after;
    });

    updateComponentStatus(dependencyGraph, component.id, 'COMPLETE');
    scene.status = sceneApproved ? 'validated' : 'draft';
    scene.riskLevel = sceneRisk;
    for (const stage of stages) {
      const promptState = stage.worldStateBefore ?? worldState;
      stage.prompts = {
        nanoBanana: generateNanoBananaPrompt(
          scene, stage, promptState, dna, spatialMap, previousScene,
        ).fullText,
        kling: generateKlingPrompt(scene, stage, promptState, dna).fullText,
      };
    }

    scenes.push(scene);
    storyboard.push({
      sceneId,
      description: `${operation.name}: ${operation.topology}, zonas ${scene.activeZones.join(' → ')}, progressão 0/25/50/75/100`,
      locked: false,
      imageAttached: false,
    });
    previousScene = scene;
  });

  spatialMap.zones.forEach(zone => {
    zone.status = blueprint.protectedZoneIds.includes(zone.id) ? 'pristine' : 'complete';
  });
  worldState.construction = { ...worldState.construction, progress: 100, status: 'concluída' };

  return {
    id: `${blueprint.id}_${createdAt}`,
    name: config.name,
    dna,
    worldState,
    spatialMap,
    dependencyGraph,
    operations,
    scenes,
    storyboard,
    createdAt,
    updatedAt: createdAt,
    status: 'complete',
  };
}
