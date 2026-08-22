/**
 * Status de um componente na construção.
 */
export type ComponentStatus = 'READY' | 'BLOCKED' | 'ACTIVE' | 'PARTIAL' | 'COMPLETE' | 'LOCKED';

/**
 * Componente construtivo.
 */
export interface ConstructionComponent {
  id: string;
  name: string;
  type: string;
  dependencies: string[];
  status: ComponentStatus;
  zones: string[];
  creationOperation?: string;
  modificationOperation?: string;
  removalOperation?: string;
}

/**
 * Regra de construção.
 */
export interface ConstructionRule {
  id: string;
  description: string;
  condition: string;
  consequence: string;
  editable: boolean;
}

/**
 * Tipo/Estilo de construção.
 */
export interface ConstructionType {
  id: string;
  name: string;
  description: string;
  defaultComponents: ConstructionComponent[];
  rules: ConstructionRule[];
}

/**
 * Aresta do grafo de dependência construtiva.
 */
export interface DependencyEdge {
  from: string;
  to: string;
  required: boolean;
  description?: string;
}

/**
 * Tipos de construções disponíveis por padrão.
 */
export const DEFAULT_CONSTRUCTION_TYPES: ConstructionType[] = [
  {
    id: 'cabana',
    name: 'Cabana',
    description: 'Cabana rústica simples',
    defaultComponents: [], // Em produção: base, estrutura, cobertura, etc.
    rules: []
  },
  { id: 'casa_rustica', name: 'Casa Rústica', description: 'Casa rústica avançada', defaultComponents: [], rules: [] },
  { id: 'casa_madeira', name: 'Casa de Madeira', description: 'Estrutura completa em madeira', defaultComponents: [], rules: [] },
  { id: 'casa_pedra', name: 'Casa de Pedra', description: 'Estrutura alvenaria rústica', defaultComponents: [], rules: [] },
  { id: 'casa_barro', name: 'Casa de Barro', description: 'Casa tradicional de taipa', defaultComponents: [], rules: [] },
  { id: 'abrigo', name: 'Abrigo', description: 'Abrigo de sobrevivência', defaultComponents: [], rules: [] },
  { id: 'casa_elevada', name: 'Casa Elevada', description: 'Cabana sobre palafitas', defaultComponents: [], rules: [] },
  { id: 'casa_arvore', name: 'Casa na Árvore', description: 'Plataforma em altura', defaultComponents: [], rules: [] },
  { id: 'ponte', name: 'Ponte', description: 'Ponte rústica sobre curso d\'água', defaultComponents: [], rules: [] },
  { id: 'torre', name: 'Torre', description: 'Torre de observação', defaultComponents: [], rules: [] },
  { id: 'plataforma', name: 'Plataforma', description: 'Deck ou base de madeira', defaultComponents: [], rules: [] },
  { id: 'piscina_natural', name: 'Piscina Natural', description: 'Escavação e contenção de água', defaultComponents: [], rules: [] },
  { id: 'lago', name: 'Lago Artificial', description: 'Corpo d\'água com paisagismo', defaultComponents: [], rules: [] },
  { id: 'sauna', name: 'Sauna', description: 'Sauna rústica de pedra/barro', defaultComponents: [], rules: [] },
  { id: 'galpao', name: 'Galpão', description: 'Estrutura grande coberta', defaultComponents: [], rules: [] }
];
