import type { PhysicalEffect, PhysicalNodeKind } from './types';

export interface ToolAffordanceV2 {
  id: string;
  aliases: string[];
  allowedNodeKinds: PhysicalNodeKind[];
  allowedContactModes: string[];
  supportedEffectTypes: PhysicalEffect['type'][];
  compatibleMaterialClasses: string[];
}

export interface MaterialAffordanceV2 {
  materialClass: string;
  aliases: string[];
  supportedEffectTypes: PhysicalEffect['type'][];
  compatibleToolIds: string[];
}

const TOOLS: ToolAffordanceV2[] = [
  {
    id: 'shovel',
    aliases: ['shovel', 'pa', 'pá'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'SCRAPE', 'DIG', 'LIFT', 'MOVE_MATERIAL', 'PLACE', 'RELEASE', 'SETTLE', 'INSPECT', 'STOP'],
    allowedContactModes: ['DIG', 'SCRAPE', 'GRIP', 'PLACE', 'PRESS', 'INSPECT'],
    supportedEffectTypes: ['SURFACE_REMOVED', 'MATERIAL_TRANSFER', 'STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['SOIL', 'VEGETATION', 'AGGREGATE'],
  },
  {
    id: 'hammer',
    aliases: ['hammer', 'martelo'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'FASTEN', 'PLACE', 'INSPECT', 'STOP'],
    allowedContactModes: ['STRIKE', 'FASTEN', 'GRIP', 'PLACE', 'INSPECT'],
    supportedEffectTypes: ['COMPONENT_ATTACHED', 'STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['WOOD', 'METAL'],
  },
  {
    id: 'mallet',
    aliases: ['mallet', 'marreta'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'FASTEN', 'PLACE', 'INSPECT', 'STOP'],
    allowedContactModes: ['STRIKE', 'FASTEN', 'GRIP', 'PLACE', 'INSPECT'],
    supportedEffectTypes: ['COMPONENT_ATTACHED', 'STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['WOOD', 'STONE'],
  },
  {
    id: 'level',
    aliases: ['level', 'nivel', 'nível'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'INSPECT', 'STOP'],
    allowedContactModes: ['INSPECT', 'GRIP'],
    supportedEffectTypes: ['STATE_CHANGED'],
    compatibleMaterialClasses: ['WOOD', 'METAL', 'CONCRETE', 'STONE'],
  },
  {
    id: 'hand-tamper',
    aliases: ['hand tamper', 'hand-tamper', 'compactador manual'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'SETTLE', 'INSPECT', 'STOP'],
    allowedContactModes: ['PRESS', 'GRIP', 'INSPECT'],
    supportedEffectTypes: ['STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['SOIL', 'AGGREGATE'],
  },
  {
    id: 'hand-saw',
    aliases: ['hand saw', 'hand-saw', 'serrote', 'serra'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'CUT', 'INSPECT', 'STOP'],
    allowedContactModes: ['CUT', 'GRIP', 'INSPECT'],
    supportedEffectTypes: ['STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['WOOD'],
  },
  {
    id: 'trowel',
    aliases: ['trowel', 'colher de pedreiro'],
    allowedNodeKinds: ['ACQUIRE_TOOL', 'APPROACH', 'GRIP', 'POSITION', 'CONTACT', 'PLACE', 'SETTLE', 'INSPECT', 'STOP'],
    allowedContactModes: ['PLACE', 'GRIP', 'INSPECT', 'PRESS'],
    supportedEffectTypes: ['MATERIAL_APPLIED', 'STATE_CHANGED', 'CANONICAL_PROGRESS_ADVANCED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleMaterialClasses: ['CONCRETE', 'MORTAR', 'CLAY'],
  },
];

const MATERIALS: MaterialAffordanceV2[] = [
  {
    materialClass: 'SOIL',
    aliases: ['soil', 'terra', 'barro'],
    supportedEffectTypes: ['SURFACE_REMOVED', 'MATERIAL_TRANSFER', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['shovel', 'hand-tamper'],
  },
  {
    materialClass: 'VEGETATION',
    aliases: ['vegetation', 'vegetacao', 'vegetação', 'grass', 'grama'],
    supportedEffectTypes: ['SURFACE_REMOVED', 'MATERIAL_TRANSFER', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['shovel'],
  },
  {
    materialClass: 'WOOD',
    aliases: ['wood', 'madeira', 'troncos'],
    supportedEffectTypes: ['COMPONENT_ATTACHED', 'COMPONENT_MOVED', 'MATERIAL_CONSUMED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['hammer', 'mallet', 'hand-saw'],
  },
  {
    materialClass: 'STONE',
    aliases: ['stone', 'pedra'],
    supportedEffectTypes: ['COMPONENT_ATTACHED', 'COMPONENT_MOVED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['mallet'],
  },
  {
    materialClass: 'AGGREGATE',
    aliases: ['aggregate', 'cascalho'],
    supportedEffectTypes: ['MATERIAL_TRANSFER', 'MATERIAL_APPLIED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['shovel', 'hand-tamper'],
  },
  {
    materialClass: 'CONCRETE',
    aliases: ['concrete', 'concreto'],
    supportedEffectTypes: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['trowel', 'level'],
  },
  {
    materialClass: 'MORTAR',
    aliases: ['mortar', 'argamassa'],
    supportedEffectTypes: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['trowel'],
  },
  {
    materialClass: 'CLAY',
    aliases: ['clay', 'argila'],
    supportedEffectTypes: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['trowel'],
  },
  {
    materialClass: 'METAL',
    aliases: ['metal', 'aco', 'aço'],
    supportedEffectTypes: ['COMPONENT_ATTACHED', 'COMPONENT_MOVED', 'STATE_CHANGED', 'PHYSICAL_PROGRESS_ADVANCED'],
    compatibleToolIds: ['hammer', 'level'],
  },
];

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function resolveToolAffordance(toolId?: string): ToolAffordanceV2 | undefined {
  if (!toolId) return undefined;
  const needle = normalized(toolId);
  return TOOLS.find(item =>
    item.id === needle || item.aliases.some(alias => normalized(alias) === needle),
  );
}

export function canonicalToolId(toolId?: string): string | undefined {
  return resolveToolAffordance(toolId)?.id;
}

export function resolveMaterialAffordance(materialId?: string): MaterialAffordanceV2 | undefined {
  if (!materialId) return undefined;
  const needle = normalized(materialId);
  return MATERIALS.find(item =>
    item.aliases.some(alias => normalized(alias) === needle),
  );
}

export function toolSupportsEffect(
  toolId: string | undefined,
  effectType: PhysicalEffect['type'],
): boolean {
  const tool = resolveToolAffordance(toolId);
  return tool ? tool.supportedEffectTypes.includes(effectType) : false;
}

export function toolSupportsNode(
  toolId: string | undefined,
  kind: PhysicalNodeKind,
): boolean {
  const tool = resolveToolAffordance(toolId);
  return tool ? tool.allowedNodeKinds.includes(kind) : false;
}

export function toolSupportsContact(
  toolId: string | undefined,
  mode: string | undefined,
): boolean {
  if (!mode) return true;
  const tool = resolveToolAffordance(toolId);
  return tool ? tool.allowedContactModes.includes(mode) : false;
}

export function materialCompatibleWithTool(
  materialId: string | undefined,
  toolId: string | undefined,
): boolean {
  if (!materialId || !toolId) return true;
  const material = resolveMaterialAffordance(materialId);
  const tool = resolveToolAffordance(toolId);
  if (!material || !tool) return false;
  return material.compatibleToolIds.includes(tool.id)
    && tool.compatibleMaterialClasses.includes(material.materialClass);
}
