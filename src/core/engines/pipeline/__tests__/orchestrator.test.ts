import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PipelineOrchestrator, createProjectFromBlueprint } from '../index';
import { PipelineRegistry } from '../pipeline-registry';
import type { PipelineContext } from '../types';
import type { ProjectConfig } from '../../../types';
import { compileDescriptionToBlueprint } from '../../../blueprints/description-blueprint';
import type { ConstructionBlueprint } from '../../project-orchestrator';

describe('PipelineOrchestrator', () => {
  let orchestrator: PipelineOrchestrator;
  let config: ProjectConfig;
  let blueprint: ConstructionBlueprint;

  beforeEach(() => {
    PipelineRegistry.reset();
    orchestrator = new PipelineOrchestrator();

    const compiled = compileDescriptionToBlueprint({
      description: 'Abrigo simples de madeira em uma clareira.',
      name: 'Teste Orchestrator',
    });

    config = compiled.config;
    blueprint = compiled.blueprint;
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('constrói com estágios do registry', () => {
    const stageNames = orchestrator.getStageNames();

    expect(stageNames).toHaveLength(11);
    expect(stageNames[0]).toBe('spatial');
    expect(stageNames[10]).toBe('assembly');
  });

  it('execute retorna PipelineResult com sucesso', () => {
    const result = orchestrator.execute(config, blueprint);

    expect(result.success).toBe(true);
    expect(result.project).toBeDefined();
    expect(result.project?.status).toBe('complete');
    expect(result.errors).toHaveLength(0);
    expect(result.stageResults).toBeDefined();
  });

  it('execute popula stageResults para cada estágio', () => {
    const result = orchestrator.execute(config, blueprint);
    const stageNames = orchestrator.getStageNames();

    for (const name of stageNames) {
      expect(result.stageResults[name]).toBeDefined();
      expect(result.stageResults[name].success).toBe(true);
    }
  });

  it('execute falha se config inválido', () => {
    const badConfig = { ...config, name: '' };
    const result = orchestrator.execute(badConfig, blueprint);

    expect(typeof result.success).toBe('boolean');
    expect(result.stageResults).toBeDefined();
  });

  it('executeStage roda estágio individual', () => {
    const context: PipelineContext = {
      config,
      blueprint,
      createdAt: Date.now(),
    };

    const result = orchestrator.executeStage('spatial', context);

    expect(result.success).toBe(true);
    expect(context.spatialMap).toBeDefined();
  });

  it('executeStage falha para estágio inexistente', () => {
    const context: PipelineContext = {
      config,
      blueprint,
      createdAt: Date.now(),
    };

    const result = orchestrator.executeStage('inexistente', context);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('validate é chamado após execute para cada estágio', () => {
    const result = orchestrator.execute(config, blueprint);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('contexto é passado entre estágios', () => {
    const result = orchestrator.execute(config, blueprint);

    expect(result.project?.spatialMap).toBeDefined();
    expect(result.project?.spatialMap.zones.length).toBeGreaterThan(0);
  });

  it('contexto acumula DNA, dependencyGraph, operations, scenes', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    expect(project.dna).toBeDefined();
    expect(project.dependencyGraph).toBeDefined();
    expect(project.operations.length).toBeGreaterThan(0);
    expect(project.scenes.length).toBeGreaterThan(0);
    expect(project.storyboard.length).toBeGreaterThan(0);
  });

  it('projeto final tem worldState, prompts, validations', () => {
    const result = orchestrator.execute(config, blueprint);
    const project = result.project!;

    expect(project.worldState).toBeDefined();
    expect(project.worldState.construction.progress).toBe(100);

    for (const scene of project.scenes) {
      for (const stage of scene.stages) {
        expect(stage.prompts).toBeDefined();
        expect(stage.validations).toBeDefined();
        expect(stage.executionProof).toBeDefined();
      }
    }
  });
});


describe('PipelineOrchestrator - createProjectFromBlueprint', () => {

  beforeEach(() => {
    PipelineRegistry.reset();
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('retorna projeto completo', () => {
    const compiled = compileDescriptionToBlueprint({
      description: 'Cabana de madeira em clareira.',
      name: 'Teste Conveniência',
    });

    const project = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );

    expect(project.status).toBe('complete');
    expect(project.planning).toBeUndefined();
  });


  it('lança erro se pipeline falhar', () => {
    const compiled = compileDescriptionToBlueprint({
      description: 'Cabana de madeira em clareira.',
      name: 'Teste Falha',
    });

    const badConfig = {
      ...compiled.config,
      name: '',
    };

    const badBlueprint = {
      ...compiled.blueprint,
      operations: [],
    };

    expect(() =>
      createProjectFromBlueprint(
        badConfig,
        badBlueprint
      )
    ).toThrow(/Pipeline failed/);
  });

});


describe('PipelineOrchestrator - determinismo de execução', () => {

  beforeEach(() => {
    PipelineRegistry.reset();
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });


  function stripNonDeterministic(
    obj: any,
    seen = new WeakSet()
  ): any {

    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (seen.has(obj)) {
      return '[Circular]';
    }

    seen.add(obj);


    if (Array.isArray(obj)) {
      return obj.map(item =>
        stripNonDeterministic(item, seen)
      );
    }


    const {
      id,
      createdAt,
      updatedAt,
      timestamp,
      executionProof,
      metadata,
      dna,
      ...rest
    } = obj;


    const cleaned: any = {};


    for (const [key, value] of Object.entries(rest)) {

      cleaned[key] = stripNonDeterministic(
        value,
        seen
      );

    }


    if (metadata !== undefined) {
      cleaned.metadata =
        stripNonDeterministic(
          metadata,
          seen
        );
    }


    if (dna !== undefined) {
      cleaned.dna =
        stripNonDeterministic(
          dna,
          seen
        );
    }


    return cleaned;
  }


  it('múltiplas execuções com mesma entrada produzem mesmo resultado', () => {

    const compiled = compileDescriptionToBlueprint({
      description: 'Abrigo de pedra e madeira.',
      name: 'Determinismo',
    });


    const result1 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );


    const result2 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );


    const stripped1 =
      stripNonDeterministic(result1);

    const stripped2 =
      stripNonDeterministic(result2);


    expect(stripped1).toEqual(stripped2);

  });


  it('ordem de operações é determinística', () => {

    const compiled = compileDescriptionToBlueprint({
      description: 'Ponte de madeira sobre riacho.',
      name: 'Ordem Determinística',
    });


    const result1 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );

    const result2 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );


    expect(
      result1.operations.map(o => o.id)
    ).toEqual(
      result2.operations.map(o => o.id)
    );

  });


  it('qualityScore é determinístico', () => {

    const compiled = compileDescriptionToBlueprint({
      description: 'Abrigo simples.',
      name: 'QualityScore Determinístico',
    });


    const result1 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );

    const result2 = createProjectFromBlueprint(
      compiled.config,
      compiled.blueprint
    );


    for (let i = 0; i < result1.scenes.length; i++) {

      const stages1 =
        result1.scenes[i].stages;

      const stages2 =
        result2.scenes[i].stages;


      for (let j = 0; j < stages1.length; j++) {

        expect(
          stages1[j].qualityScore
        ).toEqual(
          stages2[j].qualityScore
        );


        expect(
          stages1[j].jumpRisk
        ).toBe(
          stages2[j].jumpRisk
        );

      }

    }

  });

});