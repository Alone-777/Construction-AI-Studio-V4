import type {
  MaterialAffordanceV2,
  PhysicalEffectTypeV2,
  PhysicalNodeKindV2,
  ToolAffordanceV2,
} from './types';

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .trim();
}

export const TOOL_AFFORDANCES_V2: ToolAffordanceV2[] = [
  {
    id: 'shovel',
    aliases: ['shovel', 'pa', 'pá'],
    contactModes: ['DIG', 'SCRAPE', 'LIFT', 'PLACE'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'SCRAPE', 'DIG', 'LIFT', 'MOVE_MATERIAL', 'PLACE', 'RELEASE'],
    supportedEffects: ['SURFACE_REMOVED', 'MATERIAL_MOVED', 'MATERIAL_DEPOSITED', 'STATE_CHANGED'],
    compatibleMaterialClasses: ['SOIL', 'VEGETATION', 'AGGREGATE'],
    forceModes: ['PUSH', 'PULL', 'LIFT', 'SCRAPE'],
    requiresTwoHands: true,
  },
  {
    id: 'hammer',
    aliases: ['hammer', 'martelo'],
    contactModes: ['STRIKE', 'FASTEN'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'FASTEN'],
    supportedEffects: ['COMPONENT_ATTACHED', 'STATE_CHANGED'],
    compatibleMaterialClasses: ['WOOD', 'METAL', 'FASTENER'],
    forceModes: ['STRIKE'],
    requiresTwoHands: false,
  },
  {
    id: 'mallet',
    aliases: ['mallet', 'marreta'],
    contactModes: ['STRIKE', 'FASTEN', 'PLACE'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'FASTEN', 'PLACE'],
    supportedEffects: ['COMPONENT_ATTACHED', 'STATE_CHANGED'],
    compatibleMaterialClasses: ['WOOD', 'STONE'],
    forceModes: ['STRIKE'],
    requiresTwoHands: false,
  },
  {
    id: 'hand-saw',
    aliases: ['hand-saw', 'hand saw', 'serra'],
    contactModes: ['CUT'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'CUT'],
    supportedEffects: ['STATE_CHANGED', 'MATERIAL_MOVED'],
    compatibleMaterialClasses: ['WOOD'],
    forceModes: ['PUSH', 'PULL'],
    requiresTwoHands: true,
  },
  {
    id: 'level',
    aliases: ['level', 'nivel', 'nível'],
    contactModes: ['INSPECT'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'INSPECT'],
    supportedEffects: ['STATE_CHANGED'],
    compatibleMaterialClasses: ['WOOD', 'METAL', 'CONCRETE'],
    forceModes: [],
    requiresTwoHands: false,
  },
  {
    id: 'hand-tamper',
    aliases: ['hand-tamper', 'hand tamper', 'soquete', 'compactador-manual'],
    contactModes: ['PRESS'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE'],
    supportedEffects: ['STATE_CHANGED'],
    compatibleMaterialClasses: ['SOIL', 'AGGREGATE'],
    forceModes: ['PRESS'],
    requiresTwoHands: true,
  },
  {
    id: 'trowel',
    aliases: ['trowel', 'colher-de-pedreiro', 'colher de pedreiro'],
    contactModes: ['APPLY', 'SPREAD', 'SMOOTH'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'PLACE'],
    supportedEffects: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED'],
    compatibleMaterialClasses: ['MORTAR', 'CONCRETE', 'FINISH'],
    forceModes: ['PUSH', 'PULL'],
    requiresTwoHands: false,
  },
  {
    id: 'axe',
    aliases: ['axe', 'machado'],
    contactModes: ['CUT', 'STRIKE'],
    supportedNodeKinds: ['ACQUIRE_TOOL', 'GRIP', 'POSITION', 'CONTACT', 'APPLY_FORCE', 'CUT'],
    supportedEffects: ['STATE_CHANGED', 'MATERIAL_MOVED'],
    compatibleMaterialClasses: ['WOOD', 'VEGETATION'],
    forceModes: ['STRIKE'],
    requiresTwoHands: true,
  },
];

export const MATERIAL_AFFORDANCES_V2: MaterialAffordanceV2[] = [
  { materialClass: 'SOIL', aliases: ['soil', 'terra', 'barro', 'argila'], compatibleTools: ['shovel', 'hand-tamper'], supportedEffects: ['SURFACE_REMOVED', 'MATERIAL_MOVED', 'MATERIAL_DEPOSITED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: true, canBeLifted: true, canBeAttached: false },
  { materialClass: 'VEGETATION', aliases: ['vegetation', 'vegetacao', 'vegetação', 'grama', 'raizes', 'raízes'], compatibleTools: ['shovel', 'axe'], supportedEffects: ['SURFACE_REMOVED', 'MATERIAL_MOVED', 'MATERIAL_DEPOSITED', 'STATE_CHANGED'], canBeCut: true, canBeScraped: true, canBeLifted: true, canBeAttached: false },
  { materialClass: 'WOOD', aliases: ['wood', 'madeira', 'troncos', 'bambu'], compatibleTools: ['hammer', 'mallet', 'hand-saw', 'axe'], supportedEffects: ['COMPONENT_MOVED', 'COMPONENT_ATTACHED', 'STATE_CHANGED', 'MATERIAL_MOVED'], canBeCut: true, canBeScraped: false, canBeLifted: true, canBeAttached: true },
  { materialClass: 'STONE', aliases: ['stone', 'pedra'], compatibleTools: ['mallet'], supportedEffects: ['COMPONENT_MOVED', 'COMPONENT_ATTACHED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: false, canBeLifted: true, canBeAttached: true },
  { materialClass: 'AGGREGATE', aliases: ['aggregate', 'cascalho', 'gravel'], compatibleTools: ['shovel', 'hand-tamper'], supportedEffects: ['MATERIAL_MOVED', 'MATERIAL_DEPOSITED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: true, canBeLifted: true, canBeAttached: false },
  { materialClass: 'MORTAR', aliases: ['mortar', 'argamassa'], compatibleTools: ['trowel'], supportedEffects: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: false, canBeLifted: false, canBeAttached: false },
  { materialClass: 'CONCRETE', aliases: ['concrete', 'concreto'], compatibleTools: ['trowel', 'level'], supportedEffects: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: false, canBeLifted: false, canBeAttached: false },
  { materialClass: 'FINISH', aliases: ['finish', 'acabamento'], compatibleTools: ['trowel'], supportedEffects: ['MATERIAL_APPLIED', 'MATERIAL_CONSUMED', 'STATE_CHANGED'], canBeCut: false, canBeScraped: false, canBeLifted: false, canBeAttached: false },
];

export function canonicalToolIdV2(value: string | undefined): string | null {
  const key = normalize(value || '');
  const match = TOOL_AFFORDANCES_V2.find(tool => tool.aliases.some(alias => normalize(alias) === key));
  return match?.id ?? (key || null);
}

export function resolveToolAffordanceV2(value: string | undefined): ToolAffordanceV2 | null {
  const id = canonicalToolIdV2(value);
  return TOOL_AFFORDANCES_V2.find(tool => tool.id === id) ?? null;
}

export function resolveMaterialAffordanceV2(value: string | undefined): MaterialAffordanceV2 | null {
  const key = normalize(value || '');
  return MATERIAL_AFFORDANCES_V2.find(material =>
    material.aliases.some(alias => normalize(alias) === key),
  ) ?? null;
}

export function toolSupportsNodeV2(
  tool: ToolAffordanceV2,
  kind: PhysicalNodeKindV2,
  contactMode: string | undefined,
  effects: PhysicalEffectTypeV2[],
): boolean {
  if (!tool.supportedNodeKinds.includes(kind) && !['APPROACH', 'INSPECT', 'STOP', 'SETTLE'].includes(kind)) return false;
  if (contactMode && !tool.contactModes.includes(contactMode)) return false;
  return effects.every(effect => effect === 'PROGRESS_ADVANCED' || tool.supportedEffects.includes(effect));
}
