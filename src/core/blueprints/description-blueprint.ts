import type {
  Camera,
  DetailLevel,
  EnvironmentPreset,
  Project,
  ProjectConfig,
  VisualStyle,
} from '../types';
import { DEFAULT_CHARACTER, DEFAULT_MATERIALS } from '../types';
import { createProjectFromBlueprint, type BlueprintOperation, type ConstructionBlueprint } from '../engines/pipeline';

export interface ProjectDescriptionInput {
  description: string;
  name?: string;
  environment?: EnvironmentPreset;
  construction?: string;
  approximateForm?: string;
  materials?: string[];
  workerCount?: number;
  totalDuration?: number;
  sceneDuration?: number;
  detailLevel?: DetailLevel;
  visualStyle?: VisualStyle;
}

export interface DescriptionBlueprintResult {
  config: ProjectConfig;
  blueprint: ConstructionBlueprint;
  interpretation: string[];
  assumptions: string[];
}

interface OperationDefinition {
  key: string;
  name: string;
  type: string;
  dependency?: string;
  tool: string;
  physicalAction: string;
  material?: string;
  quantity?: number;
  local?: boolean;
  residue?: { materialId: string; quantity: number; source: string };
}

const ENVIRONMENT_MATCHERS: Array<[EnvironmentPreset, string[]]> = [
  ['riacho', ['riacho', 'corrego', 'córrego']],
  ['margem_rio', ['margem do rio', 'beira do rio', 'rio']],
  ['pinheiros', ['pinheiro', 'pinheiros']],
  ['montanha', ['montanha', 'montanhoso']],
  ['area_rochosa', ['rochoso', 'rochas', 'pedregoso']],
  ['terreno_inclinado', ['inclinado', 'encosta', 'declive']],
  ['vale', ['vale']],
  ['clareira', ['clareira']],
  ['floresta_umida', ['floresta umida', 'mata umida']],
  ['floresta_temperada', ['floresta temperada']],
  ['floresta_tropical', ['floresta', 'mata', 'selva']],
  ['terreno_plano', ['terreno plano', 'planicie']],
];

const CONSTRUCTION_MATCHERS: Array<[string, string[]]> = [
  ['casa_arvore', ['casa na arvore', 'casa de arvore']],
  ['piscina_natural', ['piscina natural', 'lago artificial', 'lago']],
  ['casa_elevada', ['casa elevada', 'palafita']],
  ['casa_pedra', ['casa de pedra']],
  ['casa_barro', ['casa de barro', 'taipa']],
  ['casa_madeira', ['casa de madeira']],
  ['casa_rustica', ['casa rustica']],
  ['plataforma', ['plataforma', 'deck']],
  ['ponte', ['ponte', 'passarela']],
  ['torre', ['torre', 'mirante']],
  ['sauna', ['sauna']],
  ['galpao', ['galpao', 'celeiro']],
  ['cabana', ['cabana', 'chale']],
  ['abrigo', ['abrigo', 'refugio']],
];

const MATERIAL_ALIASES: Record<string, string[]> = {
  madeira: ['madeira', 'tabua', 'tábua'],
  troncos: ['tronco', 'troncos', 'toras'],
  bambu: ['bambu'],
  pedra: ['pedra', 'pedras', 'rocha'],
  argila: ['argila'],
  terra: ['terra'],
  barro: ['barro', 'taipa'],
  palha: ['palha', 'sapê', 'sape'],
  fibras: ['fibra', 'fibras'],
  cascalho: ['cascalho'],
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function slug(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'projeto';
}

function title(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function inferFromMatchers<T>(description: string, matchers: Array<[T, string[]]>, fallback: T): T {
  const normalized = normalize(description);
  return matchers.find(([, terms]) => terms.some(term => normalized.includes(normalize(term))))?.[0] ?? fallback;
}

function inferMaterials(description: string, construction: string): string[] {
  const normalized = normalize(description);
  const detected = Object.entries(MATERIAL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => normalized.includes(normalize(alias))))
    .map(([material]) => material);
  if (detected.length > 0) return detected;
  if (construction === 'piscina_natural') return ['pedra', 'argila', 'cascalho'];
  if (construction === 'casa_pedra' || construction === 'sauna') return ['pedra', 'madeira'];
  if (construction === 'casa_barro') return ['barro', 'madeira', 'palha'];
  return ['madeira', 'pedra', 'palha'];
}

function selectMaterial(materials: string[], preferences: string[]): string {
  return preferences.find(material => materials.includes(material)) ?? materials[0] ?? 'madeira';
}

function operationPlan(construction: string, materials: string[]): OperationDefinition[] {
  const structural = selectMaterial(materials, ['madeira', 'troncos', 'bambu', 'pedra', 'barro']);
  const foundation = selectMaterial(materials, ['pedra', 'cascalho', 'madeira', 'troncos', 'argila']);
  const surface = selectMaterial(materials, ['palha', 'madeira', 'bambu', 'barro', 'pedra']);

  const preparation: OperationDefinition = {
    key: 'preparacao', name: 'Preparação seletiva do local', type: 'limpeza', tool: 'facao',
    physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
    residue: { source: 'preparação seletiva', materialId: 'fibras', quantity: 8 },
  };

  if (construction === 'ponte') {
    return [
      preparation,
      { key: 'apoios', name: 'Execução dos apoios', type: 'sapata', dependency: 'preparacao', tool: 'pa', physicalAction: 'escavar e consolidar cada apoio', material: foundation, quantity: 24 },
      { key: 'vigas', name: 'Montagem das vigas longitudinais', type: 'viga', dependency: 'apoios', tool: 'serra', physicalAction: 'posicionar e travar as vigas entre os apoios', material: structural, quantity: 28 },
      { key: 'tabuleiro', name: 'Montagem do tabuleiro', type: 'piso', dependency: 'vigas', tool: 'martelo', physicalAction: 'fixar sequencialmente os módulos do tabuleiro', material: structural, quantity: 28 },
      { key: 'guarda_corpo', name: 'Instalação do guarda-corpo', type: 'parede linear', dependency: 'tabuleiro', tool: 'martelo', physicalAction: 'fixar montantes e travessas de proteção', material: structural, quantity: 12 },
    ];
  }

  if (['plataforma', 'casa_arvore'].includes(construction)) {
    return [
      preparation,
      { key: 'ancoragem', name: 'Execução das ancoragens', type: 'sapata', dependency: 'preparacao', tool: 'corda', physicalAction: 'posicionar e conferir cada ponto de ancoragem', material: foundation, quantity: 20 },
      { key: 'estrutura', name: 'Montagem da estrutura portante', type: 'viga', dependency: 'ancoragem', tool: 'serra', physicalAction: 'cortar, elevar e travar as vigas portantes', material: structural, quantity: 30 },
      { key: 'piso', name: 'Fechamento do piso', type: 'piso', dependency: 'estrutura', tool: 'martelo', physicalAction: 'fixar os módulos do piso sobre a estrutura', material: structural, quantity: 26 },
      { key: 'protecao', name: 'Instalação da proteção perimetral', type: 'parede', dependency: 'piso', tool: 'martelo', physicalAction: 'montar guarda-corpo ao redor da superfície', material: structural, quantity: 14 },
    ];
  }

  if (construction === 'piscina_natural') {
    return [
      preparation,
      { key: 'escavacao', name: 'Escavação controlada', type: 'fundação', dependency: 'preparacao', tool: 'pa', physicalAction: 'escavar o volume por quadrantes e separar o solo', residue: { source: 'escavação controlada', materialId: 'terra', quantity: 30 } },
      { key: 'base', name: 'Regularização da base', type: 'base', dependency: 'escavacao', tool: 'enxada', physicalAction: 'regularizar e compactar a base', material: foundation, quantity: 30 },
      { key: 'contencao', name: 'Construção da contenção', type: 'parede', dependency: 'base', tool: 'martelo', physicalAction: 'assentar a contenção por trechos', material: selectMaterial(materials, ['pedra', 'argila', 'barro']), quantity: 32 },
      { key: 'acabamento', name: 'Aplicação da camada de acabamento', type: 'cobertura', dependency: 'contencao', tool: 'enxada', physicalAction: 'aplicar a camada final continuamente', material: surface, quantity: 22 },
    ];
  }

  if (construction === 'torre') {
    return [
      preparation,
      { key: 'fundacao', name: 'Execução das fundações', type: 'sapata', dependency: 'preparacao', tool: 'pa', physicalAction: 'escavar e consolidar as sapatas', material: foundation, quantity: 28 },
      { key: 'pilares', name: 'Elevação dos pilares', type: 'pilar', dependency: 'fundacao', tool: 'corda', physicalAction: 'elevar, aprumar e escorar cada pilar', material: structural, quantity: 34 },
      { key: 'travamento', name: 'Montagem dos travamentos', type: 'travessa', dependency: 'pilares', tool: 'martelo', physicalAction: 'fixar travessas e contraventamentos', material: structural, quantity: 24 },
      { key: 'plataforma', name: 'Montagem da plataforma superior', type: 'piso', dependency: 'travamento', tool: 'martelo', physicalAction: 'fixar o piso da plataforma superior', material: structural, quantity: 20 },
      { key: 'acesso', name: 'Instalação do acesso', type: 'porta local', dependency: 'plataforma', tool: 'martelo', physicalAction: 'instalar e testar a escada de acesso', material: structural, quantity: 10, local: true },
    ];
  }

  return [
    preparation,
    { key: 'fundacao', name: 'Execução das fundações', type: 'sapata', dependency: 'preparacao', tool: 'pa', physicalAction: 'escavar e assentar cada fundação', material: foundation, quantity: 24 },
    { key: 'base', name: 'Montagem da base e piso', type: 'piso', dependency: 'fundacao', tool: 'martelo', physicalAction: 'montar e fixar os módulos da base', material: structural, quantity: 24 },
    { key: 'pilares', name: 'Elevação dos pilares', type: 'pilar', dependency: 'base', tool: 'martelo', physicalAction: 'posicionar, aprumar e fixar cada pilar', material: structural, quantity: 20 },
    { key: 'paredes', name: 'Fechamento das paredes', type: 'parede', dependency: 'pilares', tool: 'martelo', physicalAction: 'montar o trecho de parede sobre a estrutura', material: structural, quantity: 25 },
    { key: 'vigas', name: 'Estrutura da cobertura', type: 'viga', dependency: 'paredes', tool: 'serra', physicalAction: 'cortar, elevar e encaixar as vigas de cobertura', material: structural, quantity: 15 },
    { key: 'cobertura', name: 'Aplicação da cobertura', type: 'cobertura', dependency: 'vigas', tool: 'corda', physicalAction: 'fixar progressivamente a cobertura à estrutura', material: surface, quantity: 30 },
    { key: 'acesso', name: 'Instalação do acesso principal', type: 'porta', dependency: 'paredes', tool: 'martelo', physicalAction: 'alinhar, encaixar e testar o acesso', material: structural, quantity: 6, local: true },
  ];
}

function camera(id: 'A' | 'B'): Camera {
  return {
    id,
    relativePosition: id === 'A' ? { x: 48, y: 92 } : { x: 96, y: 42 },
    orientation: id === 'A' ? 0 : 270,
    conceptualHeight: id === 'A' ? 'media' : 'alta',
    framing: 'wide',
    allowedMovement: id === 'A' ? 'FOLLOW' : 'CUT',
    visibleZones: [],
    partiallyVisibleZones: [],
    hiddenZones: [],
  };
}

function protectedZone(environment: EnvironmentPreset): { id: string; name: string; type: 'LINEAR' | 'AREA' } {
  if (environment === 'riacho' || environment === 'margem_rio') {
    return { id: 'Z_PROTEGIDA_AGUA', name: 'Faixa protegida do curso d’água', type: 'LINEAR' };
  }
  if (environment === 'montanha' || environment === 'terreno_inclinado') {
    return { id: 'Z_PROTEGIDA_ENCOSTA', name: 'Faixa protegida da encosta', type: 'AREA' };
  }
  return { id: 'Z_PROTEGIDA_AMBIENTE', name: 'Faixa ambiental preservada', type: 'AREA' };
}

export function compileDescriptionToBlueprint(input: ProjectDescriptionInput): DescriptionBlueprintResult {
  if (!input.description.trim()) throw new Error('Descreva o projeto antes de gerar o planejamento.');

  const inferredConstruction = inferFromMatchers(input.description, CONSTRUCTION_MATCHERS, 'construcao_personalizada');
  const inferredEnvironment = inferFromMatchers<EnvironmentPreset>(input.description, ENVIRONMENT_MATCHERS, 'personalizado');
  const construction = input.construction || inferredConstruction;
  const environment = input.environment || inferredEnvironment;
  const materials = [...new Set((input.materials?.length ? input.materials : inferMaterials(input.description, construction))
    .map(material => slug(material))
    .filter(material => material in DEFAULT_MATERIALS))];
  if (materials.length === 0) materials.push(...inferMaterials(input.description, construction));

  const normalizedDescription = normalize(input.description);
  const approximateForm = input.approximateForm?.trim() || (
    normalizedDescription.includes('circular') ? 'circular' :
    normalizedDescription.includes('irregular') ? 'irregular' :
    normalizedDescription.includes('elevad') ? 'elevada' : 'retangular'
  );
  const name = input.name?.trim() || `${title(construction)} — ${title(environment)}`;
  const plan = operationPlan(construction, materials);
  const tools = [...new Set(plan.map(operation => operation.tool))];
  const character = { ...DEFAULT_CHARACTER, tools };
  const config: ProjectConfig = {
    name,
    environment,
    construction,
    approximateForm,
    materials,
    workerCount: Math.max(1, input.workerCount ?? 1),
    character,
    tools,
    cameraA: camera('A'),
    cameraB: camera('B'),
    visualStyle: input.visualStyle ?? 'cinematografico',
    totalDuration: Math.max(30, input.totalDuration ?? plan.length * 15),
    sceneDuration: Math.max(5, input.sceneDuration ?? 15),
    detailLevel: input.detailLevel ?? 'alto',
    visualReferences: [],
    preserveTerrain: true,
  };

  const workZones = ['Z1', 'Z2', 'Z3', 'Z4'];
  const protectedArea = protectedZone(environment);
  const components = plan.map(definition => ({
    id: `component_${definition.key}`,
    name: definition.name,
    type: definition.key,
    dependencies: definition.dependency ? [`component_${definition.dependency}`] : [],
    zones: definition.local ? ['Z2'] : workZones,
    creationOperation: `op_${definition.key}`,
  }));
  const operations: BlueprintOperation[] = plan.map(definition => {
    const zones = definition.local ? ['Z2'] : workZones;
    const materialUse = definition.material && definition.quantity
      ? { [definition.material]: definition.quantity }
      : undefined;
    return {
      id: `op_${definition.key}`,
      name: definition.name,
      type: definition.type,
      componentId: `component_${definition.key}`,
      elements: definition.local
        ? [`element_${definition.key}`]
        : zones.map(zone => `${definition.key}_${zone}`),
      zones,
      tool: definition.tool,
      physicalAction: definition.physicalAction,
      materialUse,
      residue: definition.residue ? {
        source: definition.residue.source,
        materialId: definition.residue.materialId,
        quantity: definition.residue.quantity,
        status: 'presente',
      } : undefined,
    };
  });

  const requiredMaterials = new Map<string, number>();
  operations.forEach(operation => Object.entries(operation.materialUse ?? {}).forEach(([material, quantity]) => {
    requiredMaterials.set(material, (requiredMaterials.get(material) ?? 0) + quantity);
  }));
  materials.forEach(material => {
    if (!requiredMaterials.has(material)) requiredMaterials.set(material, 12);
  });

  const blueprint: ConstructionBlueprint = {
    id: `blueprint_${slug(name)}`,
    map: {
      id: `map_${slug(environment)}`,
      width: 120,
      height: 100,
      zones: [
        { id: 'Z1', name: 'Frente esquerda', type: 'AREA', relativeBounds: { x: 0.05, y: 0.06, width: 0.44, height: 0.35 }, orientation: 'frente' },
        { id: 'Z2', name: 'Frente direita', type: 'AREA', relativeBounds: { x: 0.51, y: 0.06, width: 0.44, height: 0.35 }, orientation: 'frente' },
        { id: 'Z3', name: 'Fundo esquerdo', type: 'AREA', relativeBounds: { x: 0.05, y: 0.42, width: 0.44, height: 0.34 }, orientation: 'fundo' },
        { id: 'Z4', name: 'Fundo direito', type: 'AREA', relativeBounds: { x: 0.51, y: 0.42, width: 0.44, height: 0.34 }, orientation: 'fundo' },
        { id: protectedArea.id, name: protectedArea.name, type: protectedArea.type, relativeBounds: { x: 0.03, y: 0.82, width: 0.94, height: 0.14 }, orientation: 'fundo' },
      ],
    },
    components,
    operations,
    materials: [...requiredMaterials].map(([materialId, required]) => ({
      materialId,
      quantity: Math.ceil(required * 1.25),
      location: 'Z1',
      origin: 'estoque inicial derivado do blueprint e documentado',
    })),
    tools: tools.map(toolId => ({ toolId, location: 'Z1' })),
    protectedZoneIds: [protectedArea.id],
    restrictions: [
      `Preservar integralmente ${protectedArea.name}`,
      'Executar componentes somente após suas dependências obrigatórias',
      'Manter a identidade e o deslocamento contínuo dos trabalhadores',
    ],
    permanentObjects: [protectedArea.name, `terreno original: ${environment}`],
    forbiddenElements: [
      'componentes futuros antecipados',
      'teleporte de trabalhadores',
      'materiais sem origem rastreável',
      'transformações fora das zonas ativas',
    ],
    rules: [
      { id: 'rule_protected_zone', description: 'A zona ambiental protegida é imutável', condition: `zona == ${protectedArea.id}`, consequence: 'bloquear transformação', editable: false },
      { id: 'rule_dependency', description: 'O grafo construtivo é obrigatório', condition: 'predecessores != COMPLETE', consequence: 'componente BLOCKED', editable: false },
      { id: 'rule_progression', description: 'Toda operação possui marcos físicos absolutos', condition: 'operação ativa', consequence: 'gerar 0/25/50/75/100', editable: false },
    ],
  };

  const interpretation = [
    `Construção: ${title(construction)}`,
    `Ambiente: ${title(environment)}`,
    `Forma: ${approximateForm}`,
    `Materiais rastreados: ${materials.join(', ')}`,
    `${operations.length} operações derivadas com dependências explícitas`,
  ];
  const assumptions = [
    'Dimensões conceituais de 120 × 100 unidades para o mapa adaptativo.',
    'Um trabalhador contínuo quando a descrição não informa equipe.',
    'Quantidades de estoque incluem margem conceitual de 25%; não constituem cálculo executivo.',
  ];

  return { config, blueprint, interpretation, assumptions };
}

export function createProjectFromDescription(input: ProjectDescriptionInput): Project {
  const compiled = compileDescriptionToBlueprint(input);
  const project = createProjectFromBlueprint(compiled.config, compiled.blueprint);
  return {
    ...project,
    planning: {
      source: 'description',
      sourceDescription: input.description.trim(),
      blueprintId: compiled.blueprint.id,
      interpretation: compiled.interpretation,
      assumptions: compiled.assumptions,
    },
  };
}
