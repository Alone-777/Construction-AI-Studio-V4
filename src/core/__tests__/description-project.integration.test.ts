import { describe, expect, it } from 'vitest';
import {
  compileDescriptionToBlueprint,
  createProjectFromDescription,
} from '../blueprints/description-blueprint';

const description = 'Cabana pequena off-grid à beira de um riacho, em madeira e pedra, retangular, com um trabalhador.';

describe('Criar do zero: descrição → blueprint → Core', () => {
  const compiled = compileDescriptionToBlueprint({ description, name: 'Refúgio Experimental' });
  const project = createProjectFromDescription({ description, name: 'Refúgio Experimental' });
  const allStages = project.scenes.flatMap(scene => scene.stages);

  it('interpreta intenção sem reutilizar dados exclusivos da demo', () => {
    expect(compiled.config.construction).toBe('cabana');
    expect(compiled.config.environment).toBe('riacho');
    expect(compiled.config.materials).toEqual(expect.arrayContaining(['madeira', 'pedra']));
    expect(compiled.blueprint.id).not.toContain('cabana_do_riacho');
    expect(compiled.blueprint.components.some(component => component.id === 'sapatas_pedra')).toBe(false);
  });

  it('gera projeto completo com origem e hipóteses rastreáveis', () => {
    expect(project.status).toBe('complete');
    expect(project.planning?.source).toBe('description');
    expect(project.planning?.sourceDescription).toBe(description);
    expect(project.planning?.interpretation.length).toBeGreaterThan(3);
    expect(project.planning?.assumptions.length).toBeGreaterThan(0);
    expect(project.operations.length).toBeGreaterThan(4);
    expect(project.operations).toHaveLength(project.scenes.length);
    expect(project.storyboard).toHaveLength(project.scenes.length);
  });

  it('executa progressão física absoluta para o mesmo trabalho', () => {
    for (const scene of project.scenes) {
      expect(scene.stages.map(stage => stage.percentage)).toEqual([0, 25, 50, 75, 100]);
      for (const stage of scene.stages) {
        expect(stage.physicalState).toBeDefined();
        expect(Object.keys(stage.physicalState?.elementProgress ?? {})).toHaveLength(
          project.operations.find(operation => operation.id === scene.operationId)?.elements?.length ?? 0,
        );
      }
      expect(scene.stages[scene.stages.length - 1]?.physicalState?.completedElements).toEqual(
        project.operations.find(operation => operation.id === scene.operationId)?.elements,
      );
    }
  });

  it('mantém continuidade global entre todos os snapshots', () => {
    for (let index = 1; index < allStages.length; index += 1) {
      expect(allStages[index].worldStateBefore).toEqual(allStages[index - 1].worldStateAfter);
    }
    expect(project.worldState.existingComponents).toHaveLength(project.dependencyGraph.nodes.length);
    expect(project.worldState.futureComponents).toHaveLength(0);
  });

  it('gera zonas adaptativas e preserva a faixa ambiental', () => {
    expect(project.spatialMap.zones).toHaveLength(5);
    expect(project.spatialMap.zones.find(zone => zone.id === 'Z_PROTEGIDA_AGUA')?.status).toBe('pristine');
    expect(allStages.every(stage => stage.preservedZones.includes('Z_PROTEGIDA_AGUA'))).toBe(true);
  });

  it('conclui o grafo e conserva inventários rastreáveis', () => {
    expect(project.dependencyGraph.nodes.every(component => component.status === 'COMPLETE')).toBe(true);
    expect(project.worldState.materials.every(material => material.quantity >= 0)).toBe(true);
    expect(project.worldState.consumedMaterials.every(material => material.origin.startsWith('operação:'))).toBe(true);
    expect(project.worldState.tools.length).toBeGreaterThan(0);
  });

  it('expõe resultado fiscal por regra com PASS/WARNING/FAIL e explicação', () => {
    for (const stage of allStages) {
      expect(stage.validations.approved).toBe(true);
      expect(stage.validations.checks?.length).toBeGreaterThanOrEqual(10);
      expect(stage.validations.checks?.some(check => check.status === 'PASS')).toBe(true);
      expect(stage.validations.checks?.every(check => check.status !== 'FAIL')).toBe(true);
      expect(stage.validations.checks?.every(check => check.explanation.length > 10)).toBe(true);
    }
  });

  it('deriva prova, rota e prompts do estado real de cada estágio', () => {
    for (const stage of allStages.filter(item => item.percentage > 0)) {
      expect(stage.executionProof?.valid).toBe(true);
      expect(stage.workRoute?.length).toBeGreaterThan(0);
      expect(stage.prompts?.nanoBanana).toContain(`ZONE ${stage.activeZone}`);
      expect(stage.prompts?.kling).toContain(`zone ${stage.activeZone}`);
    }
  });

  it('usa o mesmo compilador genérico para outra tipologia', () => {
    const bridge = createProjectFromDescription({
      description: 'Ponte rústica de madeira sobre um rio, com guarda-corpo e terreno preservado.',
      name: 'Ponte de Teste',
    });
    expect(bridge.dna.finalConstruction).toBe('ponte');
    expect(bridge.operations.some(operation => operation.id === 'op_tabuleiro')).toBe(true);
    expect(bridge.operations.some(operation => operation.topology === 'POINTS')).toBe(true);
    expect(bridge.operations.some(operation => operation.topology === 'LINEAR')).toBe(true);
    expect(bridge.scenes.flatMap(scene => scene.stages).every(stage => stage.validations.approved)).toBe(true);
  });

  it('não inventa projeto quando não existe descrição', () => {
    expect(() => compileDescriptionToBlueprint({ description: '   ' })).toThrow(/Descreva o projeto/);
  });
});
