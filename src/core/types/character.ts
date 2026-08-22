import { Orientation } from './spatial';

/**
 * Definição do personagem e aparência.
 */
export interface Character {
  id: string;
  name: string;
  appearance: string;
  apparentAge: number;
  hair: string;
  beard: string;
  clothes: string;
  shoes: string;
  accessories: string[];
  tools: string[];
  referenceImage?: string;
}

/**
 * Configurações de preservação de personagem nas gerações.
 */
export interface CharacterPreservation {
  identity: boolean;
  clothes: boolean;
  accessories: boolean;
  appearance: boolean;
}

/**
 * Estado atual do personagem em um momento do tempo.
 */
export interface CharacterState {
  characterId: string;
  currentZone: string;
  previousZone?: string;
  targetZone?: string;
  orientation: Orientation;
  currentAction?: string;
  currentTool?: string;
  carriedObjects: string[];
  movementRequired: boolean;
}

/**
 * Personagem padrão de exemplo.
 */
export const DEFAULT_CHARACTER: Character = {
  id: 'builder_01',
  name: 'Construtor Padrão',
  appearance: 'Homem atlético, traços rústicos',
  apparentAge: 35,
  hair: 'Curto castanho',
  beard: 'Barba por fazer',
  clothes: 'Camisa de linho cru e calça de algodão resistente',
  shoes: 'Botas de couro',
  accessories: [],
  tools: ['machado', 'facao']
};
