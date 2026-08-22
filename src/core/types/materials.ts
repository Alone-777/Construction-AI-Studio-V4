export type MaterialId = string;

export type MaterialStatus = 'disponivel' | 'armazenado' | 'carregado' | 'em_uso' | 'incorporado' | 'descartado';

export type ToolStatus = 'em_uso' | 'armazenada' | 'abandonada' | 'indisponivel';

export interface Material {
  id: MaterialId;
  name: string;
  compatibleOperations: string[];
  usualActions: string[];
  relatedTools: string[];
  visualStates: string[];
  restrictions: string[];
  predecessors: string[];
  successors: string[];
}

export interface MaterialInstance {
  materialId: MaterialId;
  quantity: number;
  status: MaterialStatus;
  location: string;
  origin: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  compatibleMaterials: string[];
  compatibleOperations: string[];
}

export interface ToolInstance {
  toolId: string;
  status: ToolStatus;
  location: string;
  carrier?: string;
  inUse: boolean;
}

export interface Residue {
  id: string;
  source: string;
  materialId: string;
  location: string;
  quantity: number;
  status: 'presente' | 'movido' | 'reutilizado' | 'removido' | 'oculto';
}

/**
 * Dicionário de materiais padrão.
 */
export const DEFAULT_MATERIALS: Record<string, Partial<Material>> = {
  madeira: { id: 'madeira', name: 'Madeira' },
  troncos: { id: 'troncos', name: 'Troncos' },
  bambu: { id: 'bambu', name: 'Bambu' },
  pedra: { id: 'pedra', name: 'Pedra' },
  argila: { id: 'argila', name: 'Argila' },
  terra: { id: 'terra', name: 'Terra' },
  barro: { id: 'barro', name: 'Barro' },
  palha: { id: 'palha', name: 'Palha' },
  fibras: { id: 'fibras', name: 'Fibras' },
  cascalho: { id: 'cascalho', name: 'Cascalho' }
};

/**
 * Dicionário de ferramentas padrão.
 */
export const DEFAULT_TOOLS: Record<string, Partial<Tool>> = {
  machado: { id: 'machado', name: 'Machado' },
  pa: { id: 'pa', name: 'Pá' },
  enxada: { id: 'enxada', name: 'Enxada' },
  serra: { id: 'serra', name: 'Serra' },
  martelo: { id: 'martelo', name: 'Martelo' },
  facao: { id: 'facao', name: 'Facão' },
  cinzel: { id: 'cinzel', name: 'Cinzel' },
  corda: { id: 'corda', name: 'Corda' }
};
