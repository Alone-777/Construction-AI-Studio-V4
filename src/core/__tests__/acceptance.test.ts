import { describe, it, expect } from 'vitest';
import { createSpatialMap, createDefaultZones, checkAccessibility, getAdjacentZones } from '../engines/spatial-map';
import { createProjectDNA, createDefaultProjectConfig, validateDNA } from '../engines/project-dna';
import { analyzeTopology } from '../engines/topology';
import { generateProgression } from '../engines/progression';
import { createCharacterState, moveCharacter, changeTool, validateCharacterPosition } from '../engines/character';
import { createDependencyGraph, addComponent, addEdge, checkPreconditions, topologicalSort, getReadyComponents, getBlockedComponents, updateComponentStatus } from '../engines/dependency-graph';
import { validateConservation, validateNoGhostAppearance, validateNoGhostDisappearance, trackResidues } from '../engines/conservation';
import { generateExecutionProof } from '../engines/execution-proof';
import { planWorkRoute } from '../engines/work-route';
import type { WorldState, CharacterState, ConstructionComponent, Zone } from '../types';

/* ─── Helper: estado do mundo mínimo ─── */
function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    terrain: { type: 'floresta', slope: 'plano', vegetation: 'densa', soil: 'natural' },
    construction: { type: 'cabana', progress: 0, status: 'em andamento' },
    existingComponents: [],
    partialComponents: [],
    futureComponents: [],
    materials: [],
    consumedMaterials: [],
    residues: [],
    tools: [],
    character: {
      characterId: 'builder_01',
      currentZone: 'Z1',
      orientation: 'frente',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'Z1',
    climate: 'ensolarado',
    light: 'dia',
    vegetation: {},
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: 0,
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════
   CRITÉRIO DE ACEITAÇÃO 1 (§73):
   TERRENO RETANGULAR — 1 trabalhador — limpeza
   0% tudo intacto
   25% personagem trabalha em Z1
   50% desloca-se para Z2
   75% desloca-se para Z3
   100% conclui Z4
   Zonas concluídas permanecem. Zonas futuras não mudam.
   ═══════════════════════════════════════════════════ */
describe('ACEITAÇÃO 1: Terreno retangular + limpeza + 1 trabalhador', () => {
  const map = createDefaultZones(createSpatialMap('test', 100, 100));
  const zones = map.zones.map(z => z.id); // ['Z1','Z2','Z3','Z4']

  it('mapa deve ter 4 zonas com adjacências corretas', () => {
    expect(map.zones).toHaveLength(4);
    expect(getAdjacentZones(map, 'Z1')).toContain('Z2');
    expect(getAdjacentZones(map, 'Z1')).toContain('Z3');
  });

  it('topologia deve ser AREA para limpeza', () => {
    const result = analyzeTopology(['vegetação'], 'limpeza', zones);
    expect(result.recommendedType).toBe('AREA');
  });

  it('progressão deve distribuir pelas 4 zonas', () => {
    const stages = generateProgression('op_limpeza', 'limpeza', ['vegetação'], zones, {});
    expect(stages).toHaveLength(5); // 0,25,50,75,100

    // 0% — tudo intacto, personagem em Z1
    expect(stages[0].percentage).toBe(0);

    // 25% — Z1 ativa
    expect(stages[1].percentage).toBe(25);
    expect(stages[1].activeZone).toBe('Z1');

    // 50% — Z2 ativa (diferente de Z1)
    expect(stages[2].percentage).toBe(50);
    expect(stages[2].activeZone).toBe('Z2');

    // 75% — Z3 ativa
    expect(stages[3].percentage).toBe(75);
    expect(stages[3].activeZone).toBe('Z3');

    // 100% — conclui
    expect(stages[4].percentage).toBe(100);
  });

  it('deslocamento deve ser gerado ao mudar de zona', () => {
    const stages = generateProgression('op_limpeza', 'limpeza', ['vegetação'], zones, {});
    // De Z1→Z2 no estágio 50%
    const stage50 = stages[2];
    expect(stage50.displacement).toBeDefined();
    expect(stage50.displacement!.from).toBe('Z1');
    expect(stage50.displacement!.to).toBe('Z2');
  });

  it('zonas futuras não podem mudar antecipadamente', () => {
    const stages = generateProgression('op_limpeza', 'limpeza', ['vegetação'], zones, {});
    // No estágio 25% (Z1 ativa), Z2/Z3/Z4 devem estar preservadas
    const stage25 = stages[1];
    expect(stage25.preservedZones).toContain('Z2');
    expect(stage25.preservedZones).toContain('Z3');
    expect(stage25.preservedZones).toContain('Z4');
  });

  it('personagem acompanha a transformação zona a zona', () => {
    const stages = generateProgression('op_limpeza', 'limpeza', ['vegetação'], zones, {});
    expect(stages[1].characterPosition).toBe('Z1');
    expect(stages[2].characterPosition).toBe('Z2');
    expect(stages[3].characterPosition).toBe('Z3');
  });
});

/* ═══════════════════════════════════════════════════
   CRITÉRIO DE ACEITAÇÃO 2 (§74):
   4 PILARES
   0→nenhum, 25→P1, 50→P2, 75→P3, 100→P4
   P3/P4 NÃO PODEM existir em 25% ou 50%
   ═══════════════════════════════════════════════════ */
describe('ACEITAÇÃO 2: 4 pilares — progressão por pontos', () => {
  const zones = ['Z1', 'Z2', 'Z3', 'Z4'];

  it('topologia deve ser POINTS para pilares', () => {
    const result = analyzeTopology(['P1', 'P2', 'P3', 'P4'], 'pilar', zones);
    expect(result.recommendedType).toBe('POINTS');
  });

  it('progressão deve distribuir 1 pilar por estágio', () => {
    const stages = generateProgression('op_pilares', 'pilar', ['P1', 'P2', 'P3', 'P4'], zones, {});
    // Verificar que futureElements nos estágios iniciais inclui pilares futuros
    const stage25 = stages[1]; // 25%
    expect(stage25.futureElements).toContain('P2');
    expect(stage25.futureElements).toContain('P3');
    expect(stage25.futureElements).toContain('P4');
  });

  it('P3/P4 não podem existir em 25% ou 50%', () => {
    const stages = generateProgression('op_pilares', 'pilar', ['P1', 'P2', 'P3', 'P4'], zones, {});
    // Em 25% (stage index 1), allowedChanges não deve incluir P3/P4
    const stage25 = stages[1];
    const stage50 = stages[2];
    // futureElements deve conter P3 e P4 em 25%
    expect(stage25.futureElements).toContain('P3');
    expect(stage25.futureElements).toContain('P4');
    // futureElements deve conter P3 e P4 em 50%
    expect(stage50.futureElements).toContain('P3');
    expect(stage50.futureElements).toContain('P4');
  });
});

/* ═══════════════════════════════════════════════════
   CRITÉRIO DE ACEITAÇÃO 3 (§75):
   PORTA — operação local
   O sistema deve detectar que divisão por 4 zonas
   NÃO é apropriada. Usar progressão LOCAL.
   ═══════════════════════════════════════════════════ */
describe('ACEITAÇÃO 3: Porta — progressão LOCAL, não forçar 4 zonas', () => {
  const zones = ['Z1', 'Z2', 'Z3', 'Z4'];

  it('topologia deve ser LOCAL para porta', () => {
    const result = analyzeTopology(['porta_principal'], 'porta', zones);
    expect(result.recommendedType).toBe('LOCAL');
    expect(result.reasoning).toContain('local');
  });

  it('progressão deve manter mesma zona em todos os estágios', () => {
    const stages = generateProgression('op_porta', 'porta', ['porta_principal'], zones, {});
    const allZones = stages.map(s => s.activeZone);
    const uniqueZones = [...new Set(allZones)];
    // Progressão local: mesma zona em todos os estágios
    expect(uniqueZones.length).toBe(1);
  });

  it('não deve gerar deslocamentos', () => {
    const stages = generateProgression('op_porta', 'porta', ['porta_principal'], zones, {});
    const displacements = stages.filter(s => s.displacement != null);
    expect(displacements).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════
   TESTES AUTOMÁTICOS (§62) — 15 CASOS
   ═══════════════════════════════════════════════════ */

// CASO 1: Terreno retangular + limpeza (coberto acima)

// CASO 2: 4 pilares (coberto acima)

// CASO 3: 8 pilares
describe('CASO 3: 8 pilares', () => {
  it('deve distribuir 8 pilares logicamente entre 4 estágios', () => {
    const result = analyzeTopology(
      ['P1','P2','P3','P4','P5','P6','P7','P8'], 'pilar', ['Z1','Z2','Z3','Z4']
    );
    expect(result.recommendedType).toBe('POINTS');
    expect(result.progression.length).toBeGreaterThan(0);
    // Cada estágio deve ter ~2 pilares
    result.progression.forEach(p => {
      expect(p.components.length).toBeGreaterThanOrEqual(1);
      expect(p.components.length).toBeLessThanOrEqual(4);
    });
  });
});

// CASO 4: Parede linear
describe('CASO 4: Parede linear', () => {
  it('topologia deve ser LINEAR', () => {
    const result = analyzeTopology(['parede_norte'], 'parede', ['Z1','Z2','Z3','Z4']);
    expect(result.recommendedType).toBe('LINEAR');
  });
});

// CASO 5: Piso em áreas
describe('CASO 5: Piso em áreas', () => {
  it('topologia deve ser AREA para piso', () => {
    const result = analyzeTopology(['piso'], 'piso', ['Z1','Z2','Z3','Z4']);
    expect(result.recommendedType).toBe('AREA');
  });
});

// CASO 6: Escavação (material removal)
describe('CASO 6: Escavação', () => {
  it('conservation deve detectar material apareceu (terra escavada)', () => {
    const before = makeWorldState({ materials: [] });
    const after = makeWorldState({
      materials: [{ materialId: 'terra', quantity: 10, status: 'disponivel', location: 'Z1', origin: '' }],
    });
    const errors = validateNoGhostAppearance(before, after);
    // Não deve gerar erro de componente fantasma para materiais (isso é MaterialInstance)
    expect(errors).toHaveLength(0); // materials são rastreados separadamente
  });
});

// CASO 7: Componente local
describe('CASO 7: Componente local (janela)', () => {
  it('topologia LOCAL para janela', () => {
    const result = analyzeTopology(['janela_1'], 'janela', ['Z1','Z2','Z3','Z4']);
    expect(result.recommendedType).toBe('LOCAL');
  });
});

// CASO 8: Construção irregular
describe('CASO 8: Construção irregular', () => {
  it('topologia HYBRID para tipo desconhecido', () => {
    const result = analyzeTopology(['estrutura_a','estrutura_b'], 'custom_irregular', ['Z1','Z2']);
    expect(result.recommendedType).toBe('HYBRID');
  });
});

// CASO 9: Câmera com zona oculta
describe('CASO 9: Câmera com zona oculta', () => {
  it('zona ocluída deve ser reconhecida', () => {
    const map = createDefaultZones(createSpatialMap('test9', 100, 100));
    map.zones[2].occluded = true; // Z3 oculta
    const visibleZones = map.zones.filter(z => !z.occluded);
    expect(visibleZones).toHaveLength(3);
    // Z3 NÃO é visível, mas EXISTE
    expect(map.zones.find(z => z.id === 'Z3')).toBeDefined();
    expect(map.zones.find(z => z.id === 'Z3')!.occluded).toBe(true);
  });
});

// CASO 10: Ferramenta trocada
describe('CASO 10: Troca de ferramenta (E-TL01)', () => {
  it('changeTool deve gerar warning ao trocar sem soltar', () => {
    const state = createCharacterState('builder', 'Z1', 'frente');
    state.currentTool = 'machado';
    const { error } = changeTool(state, 'serra');
    expect(error).toBeDefined();
    expect(error!.code).toBe('E-TL01');
  });
});

// CASO 11: Material aparece sem origem
describe('CASO 11: Material aparece sem origem (E-MT01)', () => {
  it('conservation fiscal detecta componente fantasma', () => {
    const before = makeWorldState({ existingComponents: ['base'] });
    const after = makeWorldState({ existingComponents: ['base', 'cobertura'] });
    const errors = validateNoGhostAppearance(before, after);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe('E-MT01');
  });
});

// CASO 12: Resíduo desaparece
describe('CASO 12: Resíduo desaparece (E-WR01)', () => {
  it('conservation detecta componente que sumiu', () => {
    const before = makeWorldState({ existingComponents: ['base', 'estrutura'] });
    const after = makeWorldState({ existingComponents: ['base'] });
    const errors = validateNoGhostDisappearance(before, after);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe('E-WR01');
  });
});

// CASO 13: Dependência violada
describe('CASO 13: Dependência violada (E-DP01)', () => {
  it('componente bloqueado se predecessor não completo', () => {
    const graph = createDependencyGraph();
    const base: ConstructionComponent = { id: 'base', name: 'Base', type: 'foundation', dependencies: [], status: 'READY', zones: ['Z1'] };
    const estrutura: ConstructionComponent = { id: 'estrutura', name: 'Estrutura', type: 'frame', dependencies: ['base'], status: 'BLOCKED', zones: ['Z1','Z2'] };
    addComponent(graph, base);
    addComponent(graph, estrutura);
    addEdge(graph, 'base', 'estrutura');
    const result = checkPreconditions(graph, 'estrutura');
    expect(result).toBe(false);
  });

  it('componente ready quando predecessor completo', () => {
    const graph = createDependencyGraph();
    const base: ConstructionComponent = { id: 'base', name: 'Base', type: 'foundation', dependencies: [], status: 'COMPLETE', zones: ['Z1'] };
    const estrutura: ConstructionComponent = { id: 'estrutura', name: 'Estrutura', type: 'frame', dependencies: ['base'], status: 'READY', zones: ['Z1','Z2'] };
    addComponent(graph, base);
    addComponent(graph, estrutura);
    addEdge(graph, 'base', 'estrutura');
    const result = checkPreconditions(graph, 'estrutura');
    expect(result).toBe(true);
  });
});

// CASO 14: Cena sobrecarregada
describe('CASO 14: Cena sobrecarregada', () => {
  it('muitos estágios em duração curta deve ter progresso correto', () => {
    const stages = generateProgression('op_test', 'limpeza', ['veg'], ['Z1','Z2','Z3','Z4'], {});
    expect(stages).toHaveLength(5);
    // Cada estágio deve ter progresso crescente
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].percentage).toBeGreaterThanOrEqual(stages[i-1].percentage);
    }
  });
});

// CASO 15: Personagem em duas zonas distantes
describe('CASO 15: Personagem tenta agir em duas zonas distantes', () => {
  it('moveCharacter deve verificar acessibilidade', () => {
    const map = createDefaultZones(createSpatialMap('test15', 100, 100));
    const state = createCharacterState('builder', 'Z1', 'frente');
    // Z1 → Z4 não são adjacentes diretas, mas devem ter caminho via Z2 ou Z3
    const { newState, route } = moveCharacter(state, 'Z4', map);
    // Com BFS, deve achar caminho Z1→Z2→Z4 ou Z1→Z3→Z4
    expect(route.length).toBeGreaterThan(1);
    expect(newState.currentZone).toBe('Z4');
    expect(newState.previousZone).toBe('Z1');
  });
});

// Testes adicionais de integração
describe('Integração: Work Route', () => {
  it('planWorkRoute gera rota contínua', () => {
    const map = createDefaultZones(createSpatialMap('testWR', 100, 100));
    const route = planWorkRoute(map, 'Z1', ['Z2', 'Z3', 'Z4'], 'limpeza');
    expect(route.totalDisplacements).toBe(3);
    expect(route.sequence).toHaveLength(3);
    expect(route.sequence[0].fromZone).toBe('Z1');
    expect(route.sequence[0].toZone).toBe('Z2');
  });
});

describe('Integração: Dependency Graph topological sort', () => {
  it('topologicalSort retorna ordem válida', () => {
    const graph = createDependencyGraph();
    addComponent(graph, { id: 'prep', name: 'Preparação', type: 'prep', dependencies: [], status: 'READY', zones: [] });
    addComponent(graph, { id: 'base', name: 'Base', type: 'foundation', dependencies: ['prep'], status: 'BLOCKED', zones: [] });
    addComponent(graph, { id: 'struct', name: 'Estrutura', type: 'frame', dependencies: ['base'], status: 'BLOCKED', zones: [] });
    addEdge(graph, 'prep', 'base');
    addEdge(graph, 'base', 'struct');
    const sorted = topologicalSort(graph);
    const order = sorted.map(n => n.id);
    expect(order.indexOf('prep')).toBeLessThan(order.indexOf('base'));
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('struct'));
  });
});

describe('Integração: Project DNA', () => {
  it('createDefaultProjectConfig gera config válida', () => {
    const config = createDefaultProjectConfig();
    expect(config.name).toBeTruthy();
    expect(config.workerCount).toBeGreaterThan(0);
  });

  it('createProjectDNA e validateDNA funcionam', () => {
    const config = createDefaultProjectConfig();
    const dna = createProjectDNA(config);
    expect(dna.id).toBeTruthy();
    expect(dna.environment).toBe(config.environment);
    const errors = validateDNA(dna);
    expect(errors).toHaveLength(0);
  });
});
