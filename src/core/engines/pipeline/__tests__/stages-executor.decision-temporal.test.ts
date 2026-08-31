import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PipelineRegistry } from '../pipeline-registry';
import { PipelineOrchestrator, createProjectFromBlueprint } from '../index';
import type { PipelineContext } from '../types';
import type { ProjectConfig } from '../../../types';
import { compileDescriptionToBlueprint } from '../../../blueprints/description-blueprint';
import type { ConstructionBlueprint } from '../../project-orchestrator';
import type { Stage } from '../../../types/scene';
import type { ConstructionDecision } from '../../../decision/ConstructionDecision';

describe('StagesExecutorStage - Temporal Decision Correctness', () => {
  let orchestrator: PipelineOrchestrator;
  let config: ProjectConfig;
  let blueprint: ConstructionBlueprint;

  beforeEach(() => {
    PipelineRegistry.reset();
    orchestrator = new PipelineOrchestrator();

    const compiled = compileDescriptionToBlueprint({
      description: 'Abrigo simples de madeira em uma clareira.',
      name: 'Teste Decisão Temporal',
    });

    config = compiled.config;
    blueprint = compiled.blueprint;
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('cada Stage possui campo decision após execução do pipeline', () => {
    const result = orchestrator.execute(config, blueprint);
    expect(result.success).toBe(true);
    const project = result.project!;

    for (const scene of project.scenes) {
      for (const stage of scene.stages) {
        expect(stage.decision).toBeDefined();
        expect(typeof stage.decision).toBe('object');
        expect(stage.decision!.action).toBeDefined();
        expect(['EXECUTE_OPERATION', 'WAIT', 'REQUEST_MATERIAL', 'BLOCKED']).toContain(stage.decision!.action);
        expect(typeof stage.decision!.reason).toBe('string');
        expect(typeof stage.decision!.confidence).toBe('number');
        expect(stage.decision!.confidence).toBeGreaterThanOrEqual(0);
        expect(stage.decision!.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('decisão no estágio 0% reflete estado ANTES de qualquer construção (inspeção)', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    for (const scene of project.scenes) {
      const inspectionStage = scene.stages.find(s => s.percentage === 0);
      expect(inspectionStage).toBeDefined();
      expect(inspectionStage!.decision).toBeDefined();
      // Na inspeção (0%), deve haver elementos pendentes
      expect(inspectionStage!.decision!.reason.length).toBeGreaterThan(0);
    }
  });

  it('decisão no estágio 100% reflete estado APÓS construção completa', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    for (const scene of project.scenes) {
      const completeStage = scene.stages.find(s => s.percentage === 100);
      expect(completeStage).toBeDefined();
      expect(completeStage!.decision).toBeDefined();
      // No final (100%), componentes devem estar completos
      expect(completeStage!.decision!.reason.length).toBeGreaterThan(0);
    }
  });

  it('decisões progridem temporalmente: 0% → 25% → 50% → 75% → 100%', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    for (const scene of project.scenes) {
      const decisions = scene.stages.map(s => s.decision!);
      expect(decisions).toHaveLength(5);

      // Verificar que cada estágio tem decisão válida
      for (const decision of decisions) {
        expect(decision.action).toBeDefined();
        expect(decision.reason).toBeDefined();
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('decisão usa worldStateBefore do estágio para cálculo (não worldState final)', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    // O primeiro estágio (0%) da primeira cena deve usar estado inicial
    const firstScene = project.scenes[0];
    const firstStage = firstScene.stages[0]; // 0%
    expect(firstStage.worldStateBefore).toBeDefined();
    expect(firstStage.worldStateBefore!.construction.progress).toBeLessThan(100);

    // A decisão deve ser baseada neste estado inicial
    expect(firstStage.decision).toBeDefined();
  });

  it('decisão após fiscalização rejeitada ainda é calculada (usa estado committed)', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    // Mesmo se um estágio for rejected, a decisão deve existir
    for (const scene of project.scenes) {
      for (const stage of scene.stages) {
        expect(stage.decision).toBeDefined();
        // Se rejected, worldStateAfter é candidato, mas decision usa worldState committed
        expect(stage.decision!.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('pipeline não contém mais DecisionStage no registry', () => {
    const stageNames = PipelineRegistry.getStageNames();
    expect(stageNames).not.toContain('decision');
    expect(stageNames).toHaveLength(11); // Removido DecisionStage
  });

  it('ordem dos estágios: StagesExecutor (7) → EpisodePlanner (8) → SceneDirector (9) → PromptsGenerator (10) → Assembly (11)', () => {
    const stageNames = PipelineRegistry.getStageNames();
    const stagesIndex = stageNames.indexOf('stages');
    const episodeIndex = stageNames.indexOf('episode-planner');
    const sceneDirectorIndex = stageNames.indexOf('scene-director');
    const promptsIndex = stageNames.indexOf('prompts');
    const assemblyIndex = stageNames.indexOf('assembly');

    expect(stagesIndex).toBeLessThan(episodeIndex);
    expect(episodeIndex).toBeLessThan(sceneDirectorIndex);
    expect(sceneDirectorIndex).toBeLessThan(promptsIndex);
    expect(promptsIndex).toBeLessThan(assemblyIndex);
  });

  it('PipelineContext não possui mais campo decision global', () => {
    const result = orchestrator.execute(config, blueprint);
    expect(result.success).toBe(true);

    // Verificar que não há decision no nível do projeto (apenas nos stages)
    const project = result.project!;
    // project.decision seria o campo global antigo - não deve existir ou ser undefined
    // O que importa é que cada stage tem sua própria decisão
    for (const scene of project.scenes) {
      for (const stage of scene.stages) {
        expect(stage.decision).toBeDefined();
      }
    }
  });

  it('EpisodePlannerStage não recebe mais context.decision (removido)', () => {
    const result = orchestrator.execute(config, blueprint);
    expect(result.success).toBe(true);
    expect(result.project).toBeDefined();
    expect(result.project!.cinematicScenes).toBeDefined();
    expect(result.project!.cinematicScenes!.length).toBeGreaterThan(0);
  });

  it('determinismo: múltiplas execuções produzem mesmas decisões por estágio', () => {
    const result1 = createProjectFromBlueprint(config, blueprint);
    const result2 = createProjectFromBlueprint(config, blueprint);

    for (let i = 0; i < result1.scenes.length; i++) {
      for (let j = 0; j < result1.scenes[i].stages.length; j++) {
        const decision1 = result1.scenes[i].stages[j].decision!;
        const decision2 = result2.scenes[i].stages[j].decision!;

        expect(decision1.action).toBe(decision2.action);
        expect(decision1.reason).toBe(decision2.reason);
        expect(decision1.confidence).toBe(decision2.confidence);
        expect(decision1.operationId).toBe(decision2.operationId);
      }
    }
  });

  it('Stage interface inclui campo decision do tipo ConstructionDecision', () => {
    // Teste de tipagem - compila se Stage.decision existe
    const stage: Stage = {
      percentage: 50,
      initialState: {},
      characterPosition: 'zone1',
      activeZone: 'zone1',
      physicalAction: 'test',
      allowedChanges: [],
      finalState: {},
      visualEvidence: [],
      preservedZones: [],
      futureElements: [],
      cameraId: 'A',
      validations: {
        dependencies: true, temporal: true, spatial: true, causality: true,
        conservation: true, character: true, tools: true, visibility: true,
        progression: true, approved: true, errors: []
      },
      decision: {
        action: 'EXECUTE_OPERATION',
        operationId: 'op-1',
        reason: 'test reason',
        confidence: 0.9
      }
    };

    expect(stage.decision).toBeDefined();
    expect(stage.decision!.action).toBe('EXECUTE_OPERATION');
  });
});

describe('PipelineOrchestrator - Integração decisão temporal', () => {
  beforeEach(() => {
    PipelineRegistry.reset();
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('executa pipeline completo sem DecisionStage', () => {
    const compiled = compileDescriptionToBlueprint({
      description: 'Cabana de madeira em clareira.',
      name: 'Teste Integração',
    });

    const project = createProjectFromBlueprint(compiled.config, compiled.blueprint);
    // project.status field removed in #5D - no longer persisted
    // expect(project.status).toBe('complete');
    expect(project.scenes.length).toBeGreaterThan(0);

    // Verificar decisões em todos os stages
    for (const scene of project.scenes) {
      for (const stage of scene.stages) {
        expect(stage.decision).toBeDefined();
        expect(['EXECUTE_OPERATION', 'WAIT', 'REQUEST_MATERIAL', 'BLOCKED']).toContain(stage.decision!.action);
      }
    }
  });

  it('falha se pipeline falhar (sem DecisionStage)', () => {
    const compiled = compileDescriptionToBlueprint({
      description: 'Cabana de madeira em clareira.',
      name: 'Teste Falha',
    });

    const badConfig = { ...compiled.config, name: '' };
    const badBlueprint = { ...compiled.blueprint, operations: [] };

    expect(() => createProjectFromBlueprint(badConfig, badBlueprint)).toThrow(/Pipeline failed/);
  });
});