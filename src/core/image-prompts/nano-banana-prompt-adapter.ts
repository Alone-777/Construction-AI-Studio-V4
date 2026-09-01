import type { CanonicalImagePromptSpec } from './canonical-image-prompt-spec';

export type NanoBananaPromptMode = 'GENERATE' | 'EDIT';
export type NanoBananaPromptProfile = 'FULL' | 'COMPACT';

export type NanoBananaPromptWarningCode =
  | 'CAMERA_UNSPECIFIED'
  | 'LIGHTING_UNSPECIFIED'
  | 'REFERENCE_REQUIRED_FOR_EDIT'
  | 'TARGET_GEOMETRY_UNKNOWN'
  | 'COMPLETION_EVIDENCE_UNSPECIFIED';

export interface NanoBananaPromptWarning {
  code: NanoBananaPromptWarningCode;
  message: string;
}

export interface NanoBananaPromptAdapterOptions {
  mode: NanoBananaPromptMode;
  profile?: NanoBananaPromptProfile;
}

export interface NanoBananaPromptOutput {
  provider: 'NANO_BANANA';
  canonicalSpecId: string;
  mode: NanoBananaPromptMode;
  profile: NanoBananaPromptProfile;
  prompt: string;
  negativePrompt: string;
  referenceGuidance?: string;
  temporalAuthority: {
    snapshotKind: CanonicalImagePromptSpec['identity']['snapshotKind'];
    temporalPoint: CanonicalImagePromptSpec['identity']['temporalPoint'];
    stageOutcome: CanonicalImagePromptSpec['identity']['stageOutcome'];
    worldStateSource: CanonicalImagePromptSpec['identity']['worldStateSource'];
    officialTimeline: boolean;
  };
  temporalForbidden: string[];
  qualityForbidden: string[];
  includedSections: string[];
  omittedOptionalSections: string[];
  warnings: NanoBananaPromptWarning[];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function display(value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return 'unspecified';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'unspecified';
  return String(value);
}

function section(title: string, values: string[]): string {
  const content = values.length > 0 ? values.map(value => `- ${value}`).join('\n') : '- unspecified';
  return `[${title}]\n${content}`;
}

function temporalAuthorityLine(spec: CanonicalImagePromptSpec): string {
  if (spec.identity.snapshotKind === 'CANDIDATE') {
    return spec.identity.stageOutcome === 'REJECTED'
      ? 'CANDIDATE ATTEMPT ONLY — rejected evidence, never official timeline imagery'
      : 'CANDIDATE ATTEMPT ONLY — not yet official timeline imagery';
  }
  return 'OFFICIAL TIMELINE IMAGE — render only the committed visual state identified below';
}

function warningsFor(
  spec: CanonicalImagePromptSpec,
  mode: NanoBananaPromptMode,
): NanoBananaPromptWarning[] {
  const warnings: NanoBananaPromptWarning[] = [];
  if (!spec.camera.id || !Number.isFinite(spec.camera.viewpoint.fov)) {
    warnings.push({
      code: 'CAMERA_UNSPECIFIED',
      message: 'Canonical spec does not provide a complete camera identity/viewpoint; no camera was invented.',
    });
  }
  if (!spec.environment.light) {
    warnings.push({
      code: 'LIGHTING_UNSPECIFIED',
      message: 'Canonical spec does not provide lighting; the adapter leaves lighting unspecified.',
    });
  }
  if (mode === 'EDIT') {
    warnings.push({
      code: 'REFERENCE_REQUIRED_FOR_EDIT',
      message: 'EDIT mode requires the caller to supply the previously accepted image as its reference.',
    });
  }
  if (spec.primaryAction.target.elements.length === 0) {
    warnings.push({
      code: 'TARGET_GEOMETRY_UNKNOWN',
      message: 'Canonical spec identifies the target but provides no target element geometry.',
    });
  }
  if (spec.completionEvidence.length === 0) {
    warnings.push({
      code: 'COMPLETION_EVIDENCE_UNSPECIFIED',
      message: 'Canonical spec provides no observable completion evidence; none was invented.',
    });
  }
  return warnings;
}

function temporalForbiddenFor(spec: CanonicalImagePromptSpec): string[] {
  const futureSet = new Set(spec.mustNotShow.futureComponents);
  const future = spec.mustNotShow.futureComponents.map(
    component => `no future or not-yet-built component: ${component}`,
  );
  const forbiddenVisuals = spec.mustNotShow.visualElements
    .filter(element => !futureSet.has(element))
    .map(
    element => `no forbidden visual element: ${element}`,
  );
  const tools = spec.primaryAction.tools.length > 0
    ? `no tools other than the specified action tools: ${spec.primaryAction.tools.join(', ')}`
    : 'no unrequested tools';

  return uniqueSorted([
    ...future,
    ...forbiddenVisuals,
    ...spec.mustNotShow.prohibitedChanges,
    'no additional workers',
    'no unrelated materials',
    tools,
  ]);
}

const QUALITY_FORBIDDEN = [
  'no duplicated people, limbs, tools, materials, or structural elements',
  'no floating, intersecting, disconnected, or physically impossible objects',
  'no malformed hands, incorrect hand/tool interaction, or impossible working posture',
  'no implausible scale, material contact, load path, or structural geometry',
  'no blur, text, watermark, rendering artifacts, or unexplained objects',
];

const PROVIDER_REALISM = [
  'photorealistic construction documentation image',
  'physically plausible geometry, scale, load paths, and material contact',
  'correct human anatomy, hands, working posture, and hand/tool interaction',
  'coherent tools and materials with realistic contact at the action target',
  'lighting consistent with the specified environment, without invented cinematic styling',
];

function modeDirective(
  spec: CanonicalImagePromptSpec,
  mode: NanoBananaPromptMode,
): { lines: string[]; referenceGuidance?: string } {
  if (mode === 'GENERATE') {
    return {
      lines: [
        'Generate a new image from the complete canonical state below; do not assume a previous image',
        'Render exactly one temporal point and exactly one primary physical action',
      ],
    };
  }

  const referenceGuidance = [
    'Use the caller-supplied previously accepted image as the immutable visual baseline.',
    'Preserve exact worker identity, environment layout, camera anchor, terrain, existing construction, and already-built components.',
    `Change only the physical delta at target ${spec.primaryAction.target.id}: ${spec.primaryAction.description}.`,
  ].join(' ');
  return {
    referenceGuidance,
    lines: [
      'Edit the supplied reference image conservatively',
      `CHANGE ONLY: the single physical delta “${spec.primaryAction.description}” at target ${spec.primaryAction.target.label} (${spec.primaryAction.target.id})`,
      'PRESERVE EXACTLY: worker identity, environment, camera, terrain, existing construction, already-built components, and all canonical continuity locks',
      'DO NOT ADD: future components, unrelated materials, new tools, extra workers, or changes outside the action target',
    ],
  };
}

function fullPrompt(
  spec: CanonicalImagePromptSpec,
  mode: NanoBananaPromptMode,
  directive: ReturnType<typeof modeDirective>,
): string {
  const terrain = Object.entries(spec.environment.terrain)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${display(value)}`);
  const mustShow = uniqueSorted([
    ...spec.mustShow.subject,
    ...spec.mustShow.action,
    ...spec.mustShow.construction,
    ...spec.mustShow.toolsAndMaterials,
    ...spec.mustShow.evidence,
  ]);
  const parts = [
    section('TEMPORAL STATE — HIGHEST PRIORITY', [
      temporalAuthorityLine(spec),
      `snapshot=${spec.identity.snapshotKind}; temporal point=${spec.identity.temporalPoint}; stage outcome=${spec.identity.stageOutcome}; state source=${spec.identity.worldStateSource}`,
      `project=${spec.identity.projectId}; scene=${spec.identity.sceneId}; stage=${spec.identity.stageId}; operation=${spec.identity.operationId}; progress=${spec.identity.progress}%`,
    ]),
    section(`${mode} DIRECTIVE`, directive.lines),
    ...(directive.referenceGuidance ? [section('REFERENCE GUIDANCE', [directive.referenceGuidance])] : []),
    section('WORKER IDENTITY — LOCKED', [
      `${spec.subject.name} (${spec.subject.characterId}); visual identity ${spec.subject.visualIdentityId}`,
      `appearance: ${display(spec.subject.appearance)}`,
      `clothing: ${display(spec.subject.clothing)}`,
      `zone: ${spec.subject.zone}; orientation: ${display(spec.subject.orientation)}`,
    ]),
    section('CURRENT CONSTRUCTION — PRESENT NOW', [
      `${spec.currentConstruction.type}; status ${spec.currentConstruction.status}; progress ${spec.currentConstruction.progress}%`,
      `present components: ${spec.currentConstruction.presentComponents.join(', ') || 'none'}`,
      `completed components: ${spec.currentConstruction.completedComponents.join(', ') || 'none'}`,
      `partial components: ${spec.currentConstruction.partialComponents.join(', ') || 'none'}`,
      `active target: ${display(spec.currentConstruction.activeTarget)}; current target state: ${spec.currentConstruction.targetState}`,
    ]),
    section('ONE PRIMARY PHYSICAL ACTION', [
      `${spec.primaryAction.type}: ${spec.primaryAction.description}`,
      `action visibility: ${spec.primaryAction.visibility}`,
      `target: ${spec.primaryAction.target.label} (${spec.primaryAction.target.id})`,
      `target elements: ${spec.primaryAction.target.elements.join(', ') || 'unspecified'}`,
      `expected target state: ${spec.primaryAction.expectedTargetStatus}`,
      `tools: ${spec.primaryAction.tools.join(', ') || 'none specified'}`,
      `materials: ${spec.primaryAction.materials.join(', ') || 'none specified'}`,
    ]),
    section('COMPLETION EVIDENCE — MUST BE VISIBLE', spec.completionEvidence),
    section('MUST SHOW', mustShow),
    section('CONTINUITY LOCKS — PRESERVE EXACTLY', spec.mustPreserve),
    section('CAMERA — LOCKED', [
      `camera ${display(spec.camera.id)}; framing ${display(spec.camera.framing)}; orientation ${display(spec.camera.orientation)}; height ${display(spec.camera.conceptualHeight)}`,
      `viewpoint ${display(spec.camera.viewpoint.position.x)},${display(spec.camera.viewpoint.position.y)} toward ${display(spec.camera.viewpoint.target.x)},${display(spec.camera.viewpoint.target.y)}; FOV ${display(spec.camera.viewpoint.fov)}; aspect ${display(spec.camera.viewpoint.aspectRatio)}`,
      `movement ${display(spec.camera.viewpoint.movement)}; lens ${display(spec.camera.lens.focalLength)}mm ${display(spec.camera.lens.aperture)}; focus ${display(spec.camera.lens.focusDistance)}`,
    ]),
    section('ENVIRONMENT — LOCKED', [
      `preset ${display(spec.environment.preset)}; terrain ${terrain.join(', ') || 'unspecified'}`,
      `climate ${display(spec.environment.climate)}; lighting ${display(spec.environment.light)}; time ${display(spec.environment.timeOfDay)}; weather ${display(spec.environment.weather)}`,
      `permanent objects: ${spec.environment.permanentObjects.join(', ') || 'none specified'}`,
    ]),
    section('SPATIAL CONTEXT', [
      `active zone ${spec.spatialContext.activeZone}; state zone ${spec.spatialContext.stateZone}`,
      ...spec.spatialContext.relevantZones.map(zone =>
        `${zone.id}: ${zone.name}, ${zone.type}${zone.orientation ? `, ${zone.orientation}` : ''}`
      ),
    ]),
    section('VISIBLE MATERIAL STATE', [
      ...spec.materials.visible.map(material =>
        `${material.materialId}: quantity ${material.quantity}, ${material.status}, at ${material.location}`
      ),
      ...spec.materials.incorporated.map(material =>
        `${material.materialId}: incorporated quantity ${material.quantity}${material.location ? ` at ${material.location}` : ''}`
      ),
    ]),
    section('NANO BANANA REALISM', uniqueSorted([
      ...spec.realismRequirements,
      ...PROVIDER_REALISM,
    ])),
  ];
  return parts.join('\n\n');
}

function compactPrompt(
  spec: CanonicalImagePromptSpec,
  mode: NanoBananaPromptMode,
  directive: ReturnType<typeof modeDirective>,
): string {
  const mustShow = uniqueSorted([
    ...spec.mustShow.subject,
    ...spec.mustShow.action,
    ...spec.mustShow.construction,
    ...spec.mustShow.toolsAndMaterials,
    ...spec.mustShow.evidence,
  ]);
  return [
    section('TEMPORAL', [
      temporalAuthorityLine(spec),
      `${spec.identity.snapshotKind}/${spec.identity.temporalPoint}/${spec.identity.stageOutcome}; source ${spec.identity.worldStateSource}; progress ${spec.identity.progress}%`,
    ]),
    section(mode, directive.lines),
    ...(directive.referenceGuidance ? [section('REFERENCE', [directive.referenceGuidance])] : []),
    section('IDENTITY LOCK', [
      `${spec.subject.name} (${spec.subject.characterId}); ${display(spec.subject.appearance)}; ${display(spec.subject.clothing)}; zone ${spec.subject.zone}`,
    ]),
    section('PRESENT CONSTRUCTION', [
      `present: ${spec.currentConstruction.presentComponents.join(', ') || 'none'}; complete: ${spec.currentConstruction.completedComponents.join(', ') || 'none'}; partial: ${spec.currentConstruction.partialComponents.join(', ') || 'none'}`,
    ]),
    section('ONE ACTION / TARGET', [
      `${spec.primaryAction.type}: ${spec.primaryAction.description}; target ${spec.primaryAction.target.label} (${spec.primaryAction.target.id}); target state ${spec.currentConstruction.targetState}; expected ${spec.primaryAction.expectedTargetStatus}`,
      `tools ${spec.primaryAction.tools.join(', ') || 'none specified'}; materials ${spec.primaryAction.materials.join(', ') || 'none specified'}`,
    ]),
    section('EVIDENCE', spec.completionEvidence),
    section('MUST SHOW', mustShow),
    section('CONTINUITY', spec.mustPreserve),
    section('CAMERA', [
      `${display(spec.camera.id)}; ${display(spec.camera.framing)}; orientation ${display(spec.camera.orientation)}; viewpoint target ${display(spec.camera.viewpoint.target.x)},${display(spec.camera.viewpoint.target.y)}`,
    ]),
    section('ENVIRONMENT', [
      `${display(spec.environment.preset)}; light ${display(spec.environment.light)}; ${display(spec.environment.timeOfDay)}; ${display(spec.environment.weather)}`,
    ]),
    section('REALISM', [
      'photorealistic, physically plausible construction; correct hands/tool contact; realistic scale; no artifacts',
    ]),
  ].join('\n\n');
}

function assertNoFutureLeakage(spec: CanonicalImagePromptSpec): void {
  const present = new Set(spec.currentConstruction.presentComponents);
  const conflicts = spec.mustNotShow.futureComponents.filter(component => present.has(component));
  if (conflicts.length > 0) {
    throw new Error(
      `Canonical spec contains future components as present: ${uniqueSorted(conflicts).join(', ')}`,
    );
  }
}

export function adaptCanonicalImagePromptToNanoBanana(
  spec: CanonicalImagePromptSpec,
  options: NanoBananaPromptAdapterOptions,
): NanoBananaPromptOutput {
  assertNoFutureLeakage(spec);
  const profile = options.profile ?? 'FULL';
  const directive = modeDirective(spec, options.mode);
  const temporalForbidden = temporalForbiddenFor(spec);
  const qualityForbidden = [...QUALITY_FORBIDDEN];
  const prompt = profile === 'FULL'
    ? fullPrompt(spec, options.mode, directive)
    : compactPrompt(spec, options.mode, directive);
  const negativePrompt = [
    section('TEMPORAL AND SCOPE FORBIDDEN', temporalForbidden),
    section('QUALITY ARTIFACTS FORBIDDEN', qualityForbidden),
  ].join('\n\n');

  const coreSections = [
    'TEMPORAL_STATE',
    'MODE_DIRECTIVE',
    'IDENTITY',
    'CURRENT_CONSTRUCTION',
    'PRIMARY_ACTION',
    'COMPLETION_EVIDENCE',
    'MUST_SHOW',
    'CONTINUITY',
    'CAMERA',
    'ENVIRONMENT',
    'REALISM',
    'FORBIDDEN',
  ];
  const fullOnlySections = ['SPATIAL_DETAIL', 'MATERIAL_INVENTORY_DETAIL', 'EXTENDED_REALISM'];

  return {
    provider: 'NANO_BANANA',
    canonicalSpecId: spec.id,
    mode: options.mode,
    profile,
    prompt,
    negativePrompt,
    referenceGuidance: directive.referenceGuidance,
    temporalAuthority: {
      snapshotKind: spec.identity.snapshotKind,
      temporalPoint: spec.identity.temporalPoint,
      stageOutcome: spec.identity.stageOutcome,
      worldStateSource: spec.identity.worldStateSource,
      officialTimeline: spec.identity.snapshotKind === 'OFFICIAL',
    },
    temporalForbidden,
    qualityForbidden,
    includedSections: profile === 'FULL'
      ? [...coreSections, ...fullOnlySections]
      : coreSections,
    omittedOptionalSections: profile === 'COMPACT' ? fullOnlySections : [],
    warnings: warningsFor(spec, options.mode),
  };
}
