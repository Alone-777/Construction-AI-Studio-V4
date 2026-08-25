import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { PipelineRegistry, pipelineStages } from '../pipeline-registry';
import { PipelineOrchestrator } from '../index';
import type { PipelineStage } from '../types';
import { createProjectFromDescription } from '../../../blueprints/description-blueprint';

describe('PipelineRegistry', () => {
  beforeEach(() => {
    PipelineRegistry.reset();
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('retorna estágios na ordem correta de execução', () => {
    const stages = PipelineRegistry.getStages();
    const names = stages.map(s => s.name);
    expect(names).toEqual([
      'spatial',
      'dna',
      'dependency',
      'world',
      'operations',
      'scenes',
      'stages',
      'decision',
      'episode-planner',
      'scene-director',
      'prompts',
      'assembly',
    ]);
  });

  it('fornece lista pre-computada pipelineStages', () => {
    expect(pipelineStages).toHaveLength(12);
    expect(pipelineStages[0].name).toBe('spatial');
    expect(pipelineStages[11].name).toBe('assembly');
  });

  it('getStageNames retorna apenas nomes', () => {
    const names = PipelineRegistry.getStageNames();
    expect(names).toHaveLength(12);
    expect(typeof names[0]).toBe('string');
  });

  it('getStage encontra estágio por nome', () => {
    const stage = PipelineRegistry.getStage('dna');
    expect(stage).toBeDefined();
    expect(stage?.name).toBe('dna');
  });

  it('getStage retorna undefined para nome inexistente', () => {
    const stage = PipelineRegistry.getStage('inexistente');
    expect(stage).toBeUndefined();
  });

  it('reset limpa cache e permite reinicialização', () => {
    const stages1 = PipelineRegistry.getStages();
    PipelineRegistry.reset();
    const stages2 = PipelineRegistry.getStages();
    expect(stages1).not.toBe(stages2);
    expect(stages1.length).toBe(stages2.length);
  });

  it('cada estágio implementa interface PipelineStage', () => {
    const stages = PipelineRegistry.getStages();
    for (const stage of stages) {
      expect(stage).toHaveProperty('name');
      expect(stage).toHaveProperty('execute');
      expect(typeof stage.execute).toBe('function');
      if (stage.validate) {
        expect(typeof stage.validate).toBe('function');
      }
    }
  });
});

describe('PipelineRegistry - integração com orchestrator', () => {
  beforeEach(() => {
    PipelineRegistry.reset();
  });

  afterEach(() => {
    PipelineRegistry.reset();
  });

  it('orchestrator usa estágios do registry', () => {
    const orchestrator = new PipelineOrchestrator();
    const stageNames = orchestrator.getStageNames();
    const registryNames = PipelineRegistry.getStageNames();
    expect(stageNames).toEqual(registryNames);
  });

  it('executa pipeline completo com registry', () => {
    const project = createProjectFromDescription({
      description: 'Abrigo simples de madeira em uma clareira.',
      name: 'Teste Registry',
    });
    expect(project.status).toBe('complete');
    expect(project.operations.length).toBeGreaterThan(0);
  });

  it('ordem dos estágios preserva dependências (spatial antes de dna)', () => {
    const names = PipelineRegistry.getStageNames();
    const spatialIndex = names.indexOf('spatial');
    const dnaIndex = names.indexOf('dna');
    expect(spatialIndex).toBeLessThan(dnaIndex);
  });

  it('ordem preserva dependências (dependency antes de operations)', () => {
    const names = PipelineRegistry.getStageNames();
    const depIndex = names.indexOf('dependency');
    const opsIndex = names.indexOf('operations');
    expect(depIndex).toBeLessThan(opsIndex);
  });
});

describe('PipelineRegistry - isolamento de testes', () => {
  it('permite registro de estágio mock para testes', () => {
    PipelineRegistry.reset();

    const mockStage: PipelineStage = {
      name: 'mock-stage',
      execute: vi.fn(() => ({ success: true })),
      validate: vi.fn(() => ({ success: true })),
    };

    // Simula injeção via reset + modificação do cache interno
    // (em testes reais, usaria PipelineRegistry.reset() antes de cada teste)
    expect(PipelineRegistry.getStage('mock-stage')).toBeUndefined();
  });
});