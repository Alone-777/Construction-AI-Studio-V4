import { describe, expect, it } from 'vitest';
import { createCabanaDoRiachoProject } from '../demo/cabana-do-riacho';
import { checkAccessibility, createAdaptiveZones, createSpatialMap } from '../engines/spatial-map';
import { topologicalSort } from '../engines/dependency-graph';

describe('Integração ponta a ponta: Cabana do Riacho', () => {
  const project = createCabanaDoRiachoProject();
  const allStages = project.scenes.flatMap(scene => scene.stages);

  it('gera projeto completo pelo pipeline real', () => {
    expect(project.name).toBe('Cabana do Riacho');
    expect(project.operations).toHaveLength(8);
    expect(project.scenes).toHaveLength(8);
    expect(project.storyboard).toHaveLength(8);
    expect(allStages).toHaveLength(40);
  });

  it('preserva DNA, riacho e regras construtivas', () => {
    expect(project.dna.environment).toBe('riacho');
    expect(project.dna.permanentObjects).toContain('riacho');
    expect(project.dna.restrictions.some(rule => rule.includes('Z_RIACHO'))).toBe(true);
    expect(project.dna.rules).toHaveLength(3);
    expect(project.spatialMap.zones.find(zone => zone.id === 'Z_RIACHO')?.status).toBe('pristine');
  });

  it('deriva mapa adaptativo conectado e rotas acessíveis', () => {
    expect(project.spatialMap.zones).toHaveLength(5);
    for (const stage of allStages) {
      expect(project.spatialMap.zones.some(zone => zone.id === stage.activeZone)).toBe(true);
      if (stage.displacement) {
        const access = checkAccessibility(project.spatialMap, stage.displacement.from, stage.displacement.to);
        const route = stage.workRoute ?? [];
        expect(access.accessible).toBe(true);
        expect(route[0]).toBe(stage.displacement.from);
        expect(route[route.length - 1]).toBe(stage.displacement.to);
      }
    }
  });

  it('respeita o grafo de dependências e conclui todos os componentes', () => {
    const order = topologicalSort(project.dependencyGraph).map(component => component.id);
    expect(order.indexOf('limpeza_controlada')).toBeLessThan(order.indexOf('sapatas_pedra'));
    expect(order.indexOf('sapatas_pedra')).toBeLessThan(order.indexOf('base_piso'));
    expect(order.indexOf('paredes_madeira')).toBeLessThan(order.indexOf('porta_principal'));
    expect(project.dependencyGraph.nodes.every(component => component.status === 'COMPLETE')).toBe(true);
  });

  it('usa topologias adequadas sem forçar uma única divisão espacial', () => {
    const topologies = Object.fromEntries(project.operations.map(operation => [operation.id, operation.topology]));
    expect(topologies.op_limpeza).toBe('AREA');
    expect(topologies.op_sapatas).toBe('POINTS');
    expect(topologies.op_pilares).toBe('POINTS');
    expect(topologies.op_paredes).toBe('LINEAR');
    expect(topologies.op_cobertura).toBe('SURFACE');
    expect(topologies.op_porta).toBe('LOCAL');
  });

  it('mantém progressão 0/25/50/75/100 em cada operação', () => {
    for (const scene of project.scenes) {
      expect(scene.stages.map(stage => stage.percentage)).toEqual([0, 25, 50, 75, 100]);
      const progress = scene.stages.map(stage => stage.worldStateAfter?.construction.progress ?? -1);
      expect(progress).toEqual([...progress].sort((a, b) => a - b));
    }
  });

  it('persiste snapshots, personagem e prova de execução por estágio', () => {
    for (const stage of allStages) {
      expect(stage.worldStateBefore).toBeDefined();
      expect(stage.worldStateAfter).toBeDefined();
      expect(stage.worldStateAfter?.character.currentZone).toBe(stage.activeZone);
      expect(stage.executionProof).toBeDefined();
      if (stage.percentage > 0) expect(stage.executionProof?.valid).toBe(true);
    }
  });

  it('aprova fiscais automáticos sem esconder ocorrências informativas', () => {
    for (const stage of allStages) {
      expect(stage.validations.approved).toBe(true);
      expect(stage.validations.errors.filter(error => error.severity === 'ERROR')).toHaveLength(0);
      expect(stage.qualityScore?.overall).toBe(100);
      expect(stage.jumpRisk).toBe('LOW');
    }
  });

  it('conserva materiais, resíduos e componentes até o estado final', () => {
    expect(project.worldState.construction.progress).toBe(100);
    expect(project.worldState.existingComponents).toHaveLength(project.dependencyGraph.nodes.length);
    expect(project.worldState.futureComponents).toHaveLength(0);
    expect(project.worldState.residues.some(residue => residue.source === 'vegetação removida')).toBe(true);
    expect(project.worldState.consumedMaterials.reduce((sum, material) => sum + material.quantity, 0)).toBeGreaterThan(0);
    for (const stage of allStages) {
      const state = stage.worldStateAfter!;
      expect(state.existingComponents.filter(id => state.futureComponents.includes(id))).toHaveLength(0);
    }
  });

  it('gera prompts Nano Banana e Kling a partir de cada estado auditado', () => {
    const constructionStages = allStages.filter(stage => stage.percentage > 0);
    for (const stage of constructionStages) {
      expect(stage.prompts?.nanoBanana).toContain(`ZONE ${stage.activeZone}`);
      expect(stage.prompts?.nanoBanana).toContain('PRESERVE');
      expect(stage.prompts?.kling).toContain(`zone ${stage.activeZone}`);
      expect(stage.prompts?.kling).toContain('no teleportation');
    }
  });
});

describe('Spatial Map adaptativo', () => {
  it('escala limites relativos e calcula adjacência', () => {
    const map = createAdaptiveZones(createSpatialMap('adaptive', 200, 100), [
      { id: 'A', name: 'A', type: 'AREA', relativeBounds: { x: 0, y: 0, width: 0.5, height: 1 } },
      { id: 'B', name: 'B', type: 'LOCAL', relativeBounds: { x: 0.5, y: 0, width: 0.5, height: 1 } },
    ]);
    expect(map.zones[0].bounds.width).toBe(100);
    expect(map.zones[0].adjacentZones).toContain('B');
    expect(map.zones[1].adjacentZones).toContain('A');
  });

  it('recusa definições fora do mapa', () => {
    expect(() => createAdaptiveZones(createSpatialMap('invalid', 100, 100), [
      { id: 'A', name: 'A', type: 'AREA', relativeBounds: { x: 0.8, y: 0, width: 0.4, height: 1 } },
    ])).toThrow(/Limites relativos inválidos/);
  });
});
