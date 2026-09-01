import type {
  Scene,
  Operation,
  WorldState,
  Transformation,
  JumpRisk,
  Residue,
  ToolInstance,
  SpatialMap,
  DependencyGraph,
  ProjectDNA,
  ConstructionComponent,
} from '../../../types';
import type { BlueprintOperation } from '../../../engines/project-orchestrator';
import { moveCharacter, changeTool } from '../../../engines/character';
import { applyTransformation, snapshotState } from '../../../engines/world-state';
import { generateExecutionProof } from '../../../engines/execution-proof';
import { FiscalRunner } from '../../../fiscals/fiscal-runner';
import { updateComponentStatus } from '../../../engines/dependency-graph';
import { planWorkRoute } from '../../../engines/work-route';
import type { PipelineContext, StageResult } from '../types';
import { ConstructionDecisionEngine, createDecisionEngine } from '../../../decision/ConstructionDecisionEngine';
import type { DecisionContext, ConstructionDecision, OperationDependency } from '../../../decision/ConstructionDecision';
import type { Stage } from '../../../types/scene';
import {
  beginStageTransaction,
  commitStageTransaction,
  rejectStageTransaction,
} from '../../../transactions/stage-transaction';
import { compilePhysicalActionIR } from '../../../actions/physical-action-ir';

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

  for (const [materialId, quantity] of Object.entries((operation.materialUse ?? {}) as Record<string, number>)) {
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
 * Stage 7: Stages Execution
 * Executes all stages for each scene with world state transformations and fiscal validation
 * Calculates temporal decision per-stage after fiscal validation
 */
export class StagesExecutorStage {
  name = 'stages';
  private engine: ConstructionDecisionEngine;

  constructor() {
    this.engine = createDecisionEngine();
  }

  execute(context: PipelineContext): StageResult {
    if (!context.scenes || !context.operations || !context.blueprint || !context.spatialMap ||
        !context.dependencyGraph || !context.dna || !context.config || !context.worldState) {
      return { success: false, error: new Error('Missing required context for stages execution') };
    }

    try {
      const fiscalRunner = context.fiscalRunner ?? new FiscalRunner();
      context.fiscalRunner = fiscalRunner;
      let worldState = context.worldState;
      let previousScene: Scene | undefined;

      for (let operationIndex = 0; operationIndex < (context.operations?.length ?? 0); operationIndex++) {
        const operation = context.operations![operationIndex];
        const scene = context.scenes[operationIndex];
        const specification = context.blueprint.operations.find(op => op.id === operation.id);

        if (!specification) {
          throw new Error(`Specification not found for operation ${operation.id}`);
        }

        const component = context.dependencyGraph.nodes.find(node => node.id === operation.componentId);
        if (!component) throw new Error(`Component not found: ${operation.componentId}`);

        // Activate component before running stages
        if (!updateComponentStatus(context.dependencyGraph, component.id, 'ACTIVE')) {
          throw new Error(`Dependências não satisfeitas para ${component.id}`);
        }

        // Compute planned route for this operation
        const plannedRoute = planWorkRoute(
          context.spatialMap!,
          worldState.character.currentZone,
          unique(scene.activeZones),
          operation.name,
        );

        let sceneApproved = true;
        let sceneRisk: JumpRisk = 'LOW';
        let sceneRejected = false;

        for (let stageIndex = 0; stageIndex < scene.stages.length; stageIndex++) {
          const stage = scene.stages[stageIndex];
          const before = snapshotState(worldState);
          const movement = moveCharacter(before.character, stage.activeZone, context.spatialMap!);
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
          stage.preservedZones = unique([...stage.preservedZones, ...context.blueprint!.protectedZoneIds]);

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
            ((operationIndex + stage.percentage / 100) / context.blueprint!.operations.length) * 100,
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
            sceneId: scene.id,
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
          const transaction = beginStageTransaction({
            id: `stage-transaction:${scene.id}:${stage.percentage}`,
            sceneId: scene.id,
            stageId: String(stage.percentage),
            operationId: operation.id,
            officialStateBefore: worldState,
            candidateState: after,
          });

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
          stage.worldStateAfter = transaction.candidateState;
          stage.executionProof = generateExecutionProof(stage);
          stage.physicalActionIR = compilePhysicalActionIR({
            scene,
            stage,
            operation,
            worldStateBefore: before,
            candidateState: transaction.candidateState,
          });

          const report = fiscalRunner.runAllFiscals({
            scene,
            stage,
            worldStateBefore: before,
            worldStateAfter: transaction.candidateState,
            transformation,
            spatialMap: context.spatialMap!,
            dependencyGraph: context.dependencyGraph!,
            character: transaction.candidateState.character,
            previousScene,
            projectDNA: context.dna!,
            operation,
          });

          stage.validations = report.results;
          stage.qualityScore = report.qualityScore;
          stage.jumpRisk = report.jumpRisk;
          sceneApproved = sceneApproved && report.approved;
          sceneRisk = maxRisk(sceneRisk, report.jumpRisk);

          // FISCAL GATE: Only commit candidate state if approved
          if (report.approved) {
            const committedTransaction = commitStageTransaction(transaction);
            worldState = committedTransaction.officialStateAfter;
            // TEMPORAL DECISION: Calculate decision for THIS stage's committed state
            // Uses the worldState AFTER fiscal gate (committed state)
            const decisionContext = this.buildDecisionContext(
              context.operations!,
              worldState,
              context.blueprint
            );
            stage.decision = this.engine.decide(decisionContext);
          } else {
            const rejectedTransaction = rejectStageTransaction(transaction);
            worldState = rejectedTransaction.officialStateAfter;
            // Keep official worldState as 'before' (pre-transformation)
            // stage.worldStateAfter still holds the candidate for evidence/debugging
            stage.status = 'rejected';
            // Rejected stages have NO decision (undefined) - Stage.decision is temporal authority only for committed state
            stage.decision = undefined;
            // Stop further stage progression for this scene
            sceneRejected = true;
            break;
          }
        }

        // Update component status only if scene was fully approved
        if (sceneApproved && !sceneRejected) {
          updateComponentStatus(context.dependencyGraph, component.id, 'COMPLETE');
        }
        scene.status = sceneApproved && !sceneRejected ? 'validated' : 'draft';
        scene.riskLevel = sceneRisk;

        previousScene = scene;
      }

      // Finalize world state - only mark complete if all scenes approved
      const allScenesApproved = context.scenes!.every(s => s.status === 'validated');
      context.spatialMap.zones.forEach(zone => {
        if (context.blueprint!.protectedZoneIds.includes(zone.id)) {
          zone.status = 'pristine';
        } else if (allScenesApproved) {
          zone.status = 'complete';
        }
        // Else: preserve existing zone status (don't force 'incomplete')
      });
      worldState.construction = { ...worldState.construction, progress: allScenesApproved ? 100 : worldState.construction.progress, status: allScenesApproved ? 'concluída' : 'em andamento' };
      context.worldState = worldState;

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  private buildDecisionContext(
    operations: Operation[],
    worldState: WorldState,
    blueprint: any
  ): DecisionContext {
    const completedElements = this.getCompletedElements(worldState, operations, blueprint);
    const activeElements = this.getActiveElements(worldState, operations);
    const pendingElements = this.getPendingElements(operations, completedElements, activeElements);
    const materialState = this.getMaterialState(worldState);
    const workerState = this.getWorkerState(worldState);
    const availableOperations = this.buildAvailableOperations(operations, blueprint);
    const inventory = this.buildInventory(worldState);
    const dependencies = this.buildDependencies(blueprint);

    return {
      constructionState: { completedElements, activeElements, pendingElements, materialState, workerState },
      availableOperations,
      inventory,
      dependencies,
    };
  }

  private getCompletedElements(worldState: WorldState, operations: Operation[], blueprint: any): string[] {
    // Only return actually completed elements from worldState (no future leakage)
    // worldState.existingComponents reflects the official committed state
    return worldState.existingComponents || [];
  }

  private getActiveElements(worldState: WorldState, operations: Operation[]): string[] {
    return worldState.partialComponents || [];
  }

  private getPendingElements(operations: Operation[], completedElements: string[], activeElements: string[]): string[] {
    const allElements = new Set<string>();
    for (const op of operations) if (op.elements) op.elements.forEach(el => allElements.add(el));
    return Array.from(allElements).filter(el => !completedElements.includes(el) && !activeElements.includes(el));
  }

  private getMaterialState(worldState: WorldState): DecisionContext['constructionState']['materialState'] {
    const available: string[] = [], consumed: string[] = [], remaining: string[] = [];
    for (const material of worldState.materials) {
      if (material.status === 'disponivel' && material.quantity > 0) available.push(material.materialId);
      else if (material.status === 'incorporado' || material.status === 'em_uso') consumed.push(material.materialId);
      if (material.quantity > 0) remaining.push(material.materialId);
    }
    for (const consumedMat of worldState.consumedMaterials) if (!consumed.includes(consumedMat.materialId)) consumed.push(consumedMat.materialId);
    return { available, consumed, remaining };
  }

  private getWorkerState(worldState: WorldState): DecisionContext['constructionState']['workerState'] {
    return { position: worldState.character?.currentZone || 'site', action: worldState.character?.currentAction || 'idle', tools: worldState.tools?.filter(t => t.status === 'em_uso').map(t => t.toolId) || [] };
  }

  private buildAvailableOperations(operations: Operation[], blueprint: any): DecisionContext['availableOperations'] {
    return operations.map(op => {
      const spec = blueprint.operations.find((bop: any) => bop.id === op.id);
      return { id: op.id, name: op.name || spec?.name || op.id, elements: op.elements || [], zones: op.zones || [], visualBasis: { materials: spec?.materialUse ? Object.keys(spec.materialUse) : undefined, tools: spec?.tool ? [spec.tool] : undefined } };
    });
  }

  private buildInventory(worldState: WorldState): DecisionContext['inventory'] {
    const materials: Record<string, number> = {};
    for (const material of worldState.materials) materials[material.materialId] = material.quantity;
    return { materials, tools: worldState.tools?.map(t => t.toolId) || [] };
  }

  private buildDependencies(blueprint: any): OperationDependency[] {
    const dependencies: OperationDependency[] = [];
    if (blueprint.operations) {
      for (const op of blueprint.operations) if (op.dependsOn && op.dependsOn.length > 0) dependencies.push({ operationId: op.id, dependsOn: op.dependsOn });
    }
    return dependencies;
  }

  validate(context: PipelineContext): StageResult {
    if (!context.scenes) {
      return { success: false, error: new Error('No scenes to validate') };
    }
    for (const scene of context.scenes) {
      if (!scene.stages || scene.stages.length !== 5) {
        return { success: false, error: new Error(`Scene ${scene.id} doesn't have 5 stages`) };
      }
      for (const stage of scene.stages) {
        if (!stage.validations || !stage.executionProof) {
          return { success: false, error: new Error(`Stage ${stage.percentage}% of scene ${scene.id} missing validations/proof`) };
        }
      }
    }
    return { success: true };
  }
}
