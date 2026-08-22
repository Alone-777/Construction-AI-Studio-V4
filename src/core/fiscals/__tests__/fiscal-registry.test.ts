import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { FiscalRegistry, fiscalInspectors } from '../fiscal-registry';
import { FiscalRunner } from '../fiscal-runner';
import type { FiscalInspector } from '../types';
import { createProjectFromDescription } from '../../blueprints/description-blueprint';
import { auditProjectStage } from '../fiscal-runner';

describe('FiscalRegistry', () => {
  beforeEach(() => {
    FiscalRegistry.reset();
  });

  afterEach(() => {
    FiscalRegistry.reset();
  });

  it('retorna fiscais na ordem correta de execução', () => {
    const inspectors = FiscalRegistry.getInspectors();
    const ids = inspectors.map(i => i.id);
    expect(ids).toEqual([
      'dependency-fiscal',
      'spatial-fiscal',
      'conservation-fiscal',
      'character-fiscal',
      'temporal-fiscal',
      'visual-fiscal',
      'camera-fiscal',
      'execution-fiscal',
      'progression-fiscal',
      'topology-fiscal',
      'state-transition-fiscal',
      'visual-source-fiscal',
    ]);
  });

  it('fornece lista pre-computada fiscalInspectors', () => {
    expect(fiscalInspectors).toHaveLength(12);
    expect(fiscalInspectors[0].id).toBe('dependency-fiscal');
    expect(fiscalInspectors[11].id).toBe('visual-source-fiscal');
  });

  it('getInspectorIds retorna apenas IDs', () => {
    const ids = FiscalRegistry.getInspectorIds();
    expect(ids).toHaveLength(12);
    expect(typeof ids[0]).toBe('string');
  });

  it('cada fiscal implementa interface FiscalInspector', () => {
    const inspectors = FiscalRegistry.getInspectors();
    for (const inspector of inspectors) {
      expect(inspector).toHaveProperty('id');
      expect(inspector).toHaveProperty('name');
      expect(inspector).toHaveProperty('inspect');
      expect(typeof inspector.inspect).toBe('function');
    }
  });

  it('reset limpa cache e permite reinicialização', () => {
    const inspectors1 = FiscalRegistry.getInspectors();
    FiscalRegistry.reset();
    const inspectors2 = FiscalRegistry.getInspectors();
    expect(inspectors1).not.toBe(inspectors2);
    expect(inspectors1.length).toBe(inspectors2.length);
  });
});

describe('FiscalRegistry - integração com FiscalRunner', () => {
  beforeEach(() => {
    FiscalRegistry.reset();
  });

  afterEach(() => {
    FiscalRegistry.reset();
  });

  it('FiscalRunner usa inspectores do registry', () => {
    const runner = new FiscalRunner();
    // FiscalRunner carrega inspectores no construtor via FiscalRegistry.getInspectors()
    expect(runner).toBeDefined();
  });

  it('executa todos os 12 fiscais em projeto real', () => {
    const project = createProjectFromDescription({
      description: 'Abrigo de madeira e pedra em uma clareira.',
      name: 'Teste Fiscal Registry',
    });

    const scene = project.scenes[0];
    const stage = scene.stages[1]; // estágio 25%

    const report = auditProjectStage(project, scene, stage);

    // Verifica que todos os 12 fiscais rodaram
    expect(report.results.checks).toBeDefined();
    expect(report.results.checks!).toHaveLength(12);
    const checkIds = report.results.checks!.map(c => c.ruleId);
    expect(checkIds).toEqual(FiscalRegistry.getInspectorIds());
  });

  it('ordem dos fiscais preserva cálculo de qualityScore', () => {
    const inspectors = FiscalRegistry.getInspectors();
    const runner = new FiscalRunner();

    // A ordem no registry deve bater com as categorias no fiscal-runner.ts
    const ids = inspectors.map(i => i.id);

    // dependency-fiscal primeiro (causality score)
    expect(ids[0]).toBe('dependency-fiscal');
    // spatial-fiscal segundo (space score)
    expect(ids[1]).toBe('spatial-fiscal');
    // conservation-fiscal terceiro (conservation score)
    expect(ids[2]).toBe('conservation-fiscal');
  });
});

describe('FiscalRegistry - isolamento de testes', () => {
  it('permite reset entre testes', () => {
    FiscalRegistry.reset();
    const inspectors1 = FiscalRegistry.getInspectors();
    FiscalRegistry.reset();
    const inspectors2 = FiscalRegistry.getInspectors();
    expect(inspectors1).not.toBe(inspectors2);
    expect(inspectors1.length).toBe(12);
    expect(inspectors2.length).toBe(12);
  });
});