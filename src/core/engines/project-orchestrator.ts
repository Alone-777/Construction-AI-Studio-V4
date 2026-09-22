import type {
  AdaptiveZoneDefinition,
  ConstructionComponent,
  ConstructionRule,
  Operation,
  Residue,
} from '../types';
import type { HandlingProfile, LogisticsEquipment } from '../types/materials';
import type { LogisticsArea } from '../actions/physical-execution-v2/logistics-types';

export interface BlueprintMaterialStock {
  materialId: string;
  quantity: number;
  location: string;
  origin: string;
  handling?: HandlingProfile;
}

export interface BlueprintToolStock {
  toolId: string;
  location: string;
  equipment?: LogisticsEquipment;
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
  handling?: HandlingProfile;
  handlingByMaterial?: Record<string, HandlingProfile>;
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
  /** Describes a compact stock point in an existing zone; does not move OFFICIAL stock. */
  logisticsArea?: LogisticsArea;
}
