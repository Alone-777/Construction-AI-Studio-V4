import type { Camera, Project, ProjectConfig } from '../types';
import { DEFAULT_CHARACTER } from '../types';
import {
  createProjectFromBlueprint,
  type ConstructionBlueprint,
} from '../engines/project-orchestrator';

const WORK_ZONES = ['Z1', 'Z2', 'Z4', 'Z3'];

function camera(id: 'A' | 'B'): Camera {
  return {
    id,
    relativePosition: id === 'A' ? { x: 60, y: 95 } : { x: 108, y: 48 },
    orientation: id === 'A' ? 0 : 270,
    conceptualHeight: id === 'A' ? 'media' : 'alta',
    framing: 'wide',
    allowedMovement: id === 'A' ? 'FOLLOW' : 'CUT',
    visibleZones: ['Z1', 'Z2', 'Z3', 'Z4', 'Z_RIACHO'],
    partiallyVisibleZones: [],
    hiddenZones: [],
  };
}

export function createCabanaDoRiachoConfig(): ProjectConfig {
  return {
    name: 'Cabana do Riacho',
    environment: 'riacho',
    construction: 'cabana',
    approximateForm: 'retangular com cobertura inclinada',
    materials: ['madeira', 'pedra', 'palha'],
    workerCount: 1,
    character: { ...DEFAULT_CHARACTER, tools: ['facao', 'pa', 'martelo', 'serra', 'machado', 'corda'] },
    tools: ['facao', 'pa', 'martelo', 'serra', 'machado', 'corda'],
    cameraA: camera('A'),
    cameraB: camera('B'),
    visualStyle: 'cinematografico',
    totalDuration: 120,
    sceneDuration: 15,
    detailLevel: 'alto',
    visualReferences: [],
    preserveTerrain: true,
  };
}

export const CABANA_DO_RIACHO_BLUEPRINT: ConstructionBlueprint = {
  id: 'cabana_do_riacho',
  map: {
    id: 'riacho_adaptive_map',
    width: 120,
    height: 100,
    zones: [
      { id: 'Z1', name: 'Frente esquerda', type: 'AREA', relativeBounds: { x: 0.05, y: 0.08, width: 0.45, height: 0.34 }, orientation: 'frente' },
      { id: 'Z2', name: 'Frente direita', type: 'AREA', relativeBounds: { x: 0.50, y: 0.08, width: 0.45, height: 0.34 }, orientation: 'frente' },
      { id: 'Z3', name: 'Fundo esquerdo', type: 'AREA', relativeBounds: { x: 0.05, y: 0.42, width: 0.45, height: 0.34 }, orientation: 'fundo' },
      { id: 'Z4', name: 'Fundo direito', type: 'AREA', relativeBounds: { x: 0.50, y: 0.42, width: 0.45, height: 0.34 }, orientation: 'fundo' },
      { id: 'Z_RIACHO', name: 'Faixa de preservação do riacho', type: 'LINEAR', relativeBounds: { x: 0.03, y: 0.81, width: 0.94, height: 0.16 }, orientation: 'fundo' },
    ],
  },
  protectedZoneIds: ['Z_RIACHO'],
  components: [
    { id: 'limpeza_controlada', name: 'Limpeza controlada', type: 'preparation', dependencies: [], zones: WORK_ZONES, creationOperation: 'op_limpeza' },
    { id: 'sapatas_pedra', name: 'Sapatas de pedra', type: 'foundation', dependencies: ['limpeza_controlada'], zones: WORK_ZONES, creationOperation: 'op_sapatas' },
    { id: 'base_piso', name: 'Base e piso', type: 'floor', dependencies: ['sapatas_pedra'], zones: WORK_ZONES, creationOperation: 'op_base' },
    { id: 'pilares_madeira', name: 'Pilares de madeira', type: 'frame', dependencies: ['base_piso'], zones: WORK_ZONES, creationOperation: 'op_pilares' },
    { id: 'paredes_madeira', name: 'Paredes de madeira', type: 'wall', dependencies: ['pilares_madeira'], zones: WORK_ZONES, creationOperation: 'op_paredes' },
    { id: 'vigas_cobertura', name: 'Vigas da cobertura', type: 'roof-frame', dependencies: ['paredes_madeira'], zones: WORK_ZONES, creationOperation: 'op_vigas' },
    { id: 'cobertura_palha', name: 'Cobertura de palha', type: 'roof', dependencies: ['vigas_cobertura'], zones: WORK_ZONES, creationOperation: 'op_cobertura' },
    { id: 'porta_principal', name: 'Porta principal', type: 'door', dependencies: ['paredes_madeira'], zones: ['Z2'], creationOperation: 'op_porta' },
  ],
  operations: [
    { id: 'op_limpeza', name: 'Limpeza seletiva', type: 'limpeza', componentId: 'limpeza_controlada', elements: WORK_ZONES.map(zone => `vegetacao_${zone}`), zones: WORK_ZONES, tool: 'facao', physicalAction: 'cortar apenas a vegetação dentro da implantação', residue: { source: 'vegetação removida', materialId: 'fibras', quantity: 12, status: 'presente' } },
    { id: 'op_sapatas', name: 'Execução das sapatas', type: 'sapata', componentId: 'sapatas_pedra', elements: WORK_ZONES.map(zone => `sapata_${zone}`), zones: WORK_ZONES, tool: 'pa', physicalAction: 'escavar e assentar uma sapata de pedra', materialUse: { pedra: 24 } },
    { id: 'op_base', name: 'Montagem da base e piso', type: 'piso', componentId: 'base_piso', elements: WORK_ZONES.map(zone => `quadrante_base_${zone}`), zones: WORK_ZONES, tool: 'martelo', physicalAction: 'encaixar e fixar a estrutura do piso', materialUse: { madeira: 24 } },
    { id: 'op_pilares', name: 'Elevação dos pilares', type: 'pilar', componentId: 'pilares_madeira', elements: WORK_ZONES.map(zone => `pilar_${zone}`), zones: WORK_ZONES, tool: 'martelo', physicalAction: 'posicionar, aprumar e fixar o pilar', materialUse: { madeira: 20 } },
    { id: 'op_paredes', name: 'Fechamento das paredes', type: 'parede', componentId: 'paredes_madeira', elements: ['parede_norte', 'parede_leste', 'parede_sul', 'parede_oeste'], zones: WORK_ZONES, tool: 'martelo', physicalAction: 'montar o trecho de parede sobre a estrutura existente', materialUse: { madeira: 25 } },
    { id: 'op_vigas', name: 'Estrutura da cobertura', type: 'viga', componentId: 'vigas_cobertura', elements: ['viga_norte', 'viga_leste', 'viga_sul', 'viga_oeste'], zones: WORK_ZONES, tool: 'serra', physicalAction: 'cortar, elevar e encaixar a viga de cobertura', materialUse: { madeira: 15 } },
    { id: 'op_cobertura', name: 'Aplicação da cobertura', type: 'cobertura', componentId: 'cobertura_palha', elements: WORK_ZONES.map(zone => `painel_palha_${zone}`), zones: WORK_ZONES, tool: 'corda', physicalAction: 'amarrar a camada de palha à estrutura de cobertura', materialUse: { palha: 30 } },
    { id: 'op_porta', name: 'Instalação da porta', type: 'porta', componentId: 'porta_principal', elements: ['porta_principal'], zones: ['Z2'], tool: 'martelo', physicalAction: 'alinhar, encaixar e testar a porta', materialUse: { madeira: 6 } },
  ],
  materials: [
    { materialId: 'madeira', quantity: 100, location: 'Z1', origin: 'depósito inicial documentado' },
    { materialId: 'pedra', quantity: 40, location: 'Z1', origin: 'depósito inicial documentado' },
    { materialId: 'palha', quantity: 40, location: 'Z1', origin: 'depósito inicial documentado' },
  ],
  tools: ['facao', 'pa', 'martelo', 'serra', 'machado', 'corda'].map(toolId => ({ toolId, location: 'Z1' })),
  restrictions: [
    'Preservar integralmente a faixa Z_RIACHO',
    'Executar cada componente somente após suas dependências',
    'Manter um único trabalhador contínuo em todas as cenas',
  ],
  permanentObjects: ['riacho', 'margens naturais', 'árvores fora da implantação'],
  forbiddenElements: [
    'máquinas pesadas',
    'alteração do curso do riacho',
    'componentes futuros antecipados',
    'teleporte do trabalhador',
    'materiais sem origem',
  ],
  rules: [
    { id: 'rule_riacho', description: 'A faixa do riacho é imutável', condition: 'zona == Z_RIACHO', consequence: 'bloquear transformação', editable: false },
    { id: 'rule_dependency', description: 'Respeitar o grafo construtivo', condition: 'predecessores != COMPLETE', consequence: 'componente BLOCKED', editable: false },
    { id: 'rule_progression', description: 'Toda operação usa marcos verificáveis', condition: 'operação ativa', consequence: 'gerar 0/25/50/75/100', editable: false },
  ],
};

export function createCabanaDoRiachoProject(): Project {
  return createProjectFromBlueprint(createCabanaDoRiachoConfig(), CABANA_DO_RIACHO_BLUEPRINT);
}
