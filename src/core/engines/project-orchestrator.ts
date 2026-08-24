import type {
  AdaptiveZoneDefinition,
  ConstructionComponent,
  ConstructionRule,
  Operation,
  Residue,
} from '../types';

export interface BlueprintMaterialStock {
  materialId: string;
  quantity: number;
  location: string;
  origin: string;
}

export interface BlueprintToolStock {
  toolId: string;
  location: string;
}

export interface BlueprintOperation {
  id: string;
  name: string;
  type: string;
  componentId: string;
  elements: string[];
  zones: string[];
  tool: string;
  physicalAction: string;
  materialUse?: Record<string, number>;
  residue?: Omit<Residue, 'id' | 'location'>;
  visualBasis?: NonNullable<Operation['visualBasis']>;
}

export interface ConstructionBlueprint {
  id: string;
  map: { id: string; width: number; height: number; zones: AdaptiveZoneDefinition[] };
  components: Omit<ConstructionComponent, 'status'>[];
  operations: BlueprintOperation[];
  materials: BlueprintMaterialStock[];
  tools: BlueprintToolStock[];
  protectedZoneIds: string[];
  restrictions: string[];
  permanentObjects: string[];
  forbiddenElements: string[];
  rules: ConstructionRule[];
}
