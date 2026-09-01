import { describe, expect, it } from 'vitest';
import type { CanonicalImagePromptSpec } from './canonical-image-prompt-spec';
import { adaptCanonicalImagePromptToNanoBanana } from './nano-banana-prompt-adapter';

function canonicalSpec(overrides: Partial<CanonicalImagePromptSpec> = {}): CanonicalImagePromptSpec {
  const value: CanonicalImagePromptSpec = {
    id: 'canonical-image-prompt:visual-state:project-1:scene-b:50:official:after',
    identity: {
      snapshotId: 'visual-state:project-1:scene-b:50:official:after',
      projectId: 'project-1',
      sceneId: 'scene-b',
      stageId: '50',
      operationId: 'operation-b',
      temporalPoint: 'AFTER',
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      worldStateSource: 'CANDIDATE',
      progress: 50,
    },
    subject: {
      characterId: 'builder-1',
      visualIdentityId: 'builder-visual-1',
      name: 'Canonical Builder',
      appearance: 'same face and body',
      clothing: 'orange work jacket',
      zone: 'Z2',
      orientation: 'north',
      toolInUse: 'hammer',
    },
    primaryAction: {
      physicalActionIRId: 'physical-action:scene-b:operation-b:50',
      visibility: 'COMMITTED',
      type: 'FASTEN',
      verb: 'fasten',
      description: 'fasten Beam B',
      target: { id: 'component-b', label: 'Beam B', elements: ['post-a', 'post-b'] },
      tools: ['hammer'],
      materials: ['wood'],
      expectedTargetStatus: 'PARTIAL',
    },
    currentConstruction: {
      type: 'cabin',
      status: 'in progress',
      progress: 50,
      presentComponents: ['component-a', 'component-b'],
      completedComponents: ['component-a'],
      partialComponents: ['component-b'],
      activeTarget: 'component-b',
      targetState: 'PARTIAL',
      pendingComponents: ['component-c'],
    },
    spatialContext: {
      activeZone: 'Z2',
      stateZone: 'Z2',
      relevantZones: [{
        id: 'Z2',
        name: 'North work zone',
        type: 'AREA',
        orientation: 'north',
        bounds: { x: 30, y: 0, width: 30, height: 30 },
      }],
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [],
    },
    camera: {
      id: 'A',
      relativePosition: { x: 10, y: 20 },
      orientation: 30,
      conceptualHeight: 'media',
      framing: 'wide',
      allowedMovement: 'FIXA',
      visibleZones: ['Z2'],
      partiallyVisibleZones: ['Z1'],
      hiddenZones: ['Z3'],
      viewpoint: {
        position: { x: 12, y: 18 },
        target: { x: 45, y: 40 },
        fov: 52,
        aspectRatio: 16 / 9,
        movement: 'FIXA',
      },
      lens: { focalLength: 35, aperture: 'f/8', focusDistance: 8, depthOfField: true },
    },
    environment: {
      preset: 'floresta_temperada',
      terrain: { type: 'flat', slope: 'none', vegetation: 'forest-edge', soil: 'dirt' },
      climate: 'clear',
      light: 'daylight',
      timeOfDay: 'day',
      weather: 'clear',
      permanentObjects: ['old-tree'],
      zoneVegetation: [{ zoneId: 'Z2', state: 'work-area' }],
    },
    mustShow: {
      subject: ['Canonical Builder (builder-1)', 'orange work jacket'],
      action: ['completed result of the single primary action: fasten Beam B'],
      construction: ['present component: component-a', 'present component: component-b'],
      toolsAndMaterials: ['tool required by the action: hammer', 'material required by the action: wood'],
      evidence: ['Beam B spans post A and post B with both endpoints visibly fixed'],
    },
    mustPreserve: [
      'exact actor identity: builder-1',
      'camera anchor: A',
      'existing component geometry: component-a',
      'terrain outside active zone Z2',
    ],
    mustNotShow: {
      futureComponents: ['component-c'],
      visualElements: ['modern-crane'],
      prohibitedChanges: ['no changes outside active zone Z2'],
    },
    completionEvidence: [
      'Beam B spans post A and post B with both endpoints visibly fixed',
      'target component-b is partial',
    ],
    realismRequirements: [
      'coherent physical geometry and contact between objects',
      'correct human anatomy and plausible working posture',
    ],
  };

  return { ...value, ...overrides };
}

describe('adaptCanonicalImagePromptToNanoBanana', () => {
  it('returns deterministic output for identical input and options', () => {
    const spec = canonicalSpec();
    const options = { mode: 'GENERATE' as const, profile: 'FULL' as const };
    expect(adaptCanonicalImagePromptToNanoBanana(spec, options)).toEqual(
      adaptCanonicalImagePromptToNanoBanana(spec, options),
    );
  });

  it('produces structured GENERATE mode output', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output).toMatchObject({
      provider: 'NANO_BANANA',
      mode: 'GENERATE',
      profile: 'FULL',
    });
    expect(output.prompt).toContain('Generate a new image');
    expect(output.referenceGuidance).toBeUndefined();
  });

  it('produces structured EDIT mode output', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'EDIT' });
    expect(output.mode).toBe('EDIT');
    expect(output.prompt).toContain('Edit the supplied reference image conservatively');
    expect(output.referenceGuidance).toContain('previously accepted image');
    expect(output.warnings.map(warning => warning.code)).toContain('REFERENCE_REQUIRED_FOR_EDIT');
  });

  it('makes EDIT mode preserve the existing scene and continuity locks', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'EDIT' });
    expect(output.prompt).toContain('PRESERVE EXACTLY');
    expect(output.prompt).toContain('exact actor identity: builder-1');
    expect(output.prompt).toContain('existing component geometry: component-a');
    expect(output.prompt).toContain('terrain outside active zone Z2');
  });

  it('limits EDIT mode to the intended physical delta', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'EDIT' });
    expect(output.prompt).toContain('CHANGE ONLY: the single physical delta “fasten Beam B”');
    expect(output.prompt).not.toMatch(/cut wood|carr(?:y|ies) beam|install wall|prepare roof/i);
  });

  it('keeps future components out of the positive prompt and in forbidden output', () => {
    const base = canonicalSpec();
    const afterA = canonicalSpec({
      identity: { ...base.identity, operationId: 'operation-a', progress: 25 },
      primaryAction: {
        ...base.primaryAction,
        physicalActionIRId: 'physical-action:scene-a:operation-a:100',
        description: 'fasten Component A',
        target: { id: 'component-a', label: 'Component A', elements: ['component-a'] },
        expectedTargetStatus: 'COMPLETE',
      },
      currentConstruction: {
        ...base.currentConstruction,
        progress: 25,
        presentComponents: ['component-a'],
        completedComponents: ['component-a'],
        partialComponents: [],
        activeTarget: 'component-a',
        targetState: 'COMPLETE',
        pendingComponents: ['component-b', 'component-c'],
      },
      mustShow: {
        ...base.mustShow,
        action: ['completed result of the single primary action: fasten Component A'],
        construction: ['present component: component-a'],
        evidence: ['Component A is visibly complete'],
      },
      mustNotShow: {
        ...base.mustNotShow,
        futureComponents: ['component-b', 'component-c'],
      },
      completionEvidence: ['Component A is visibly complete'],
    });
    const output = adaptCanonicalImagePromptToNanoBanana(afterA, { mode: 'GENERATE' });

    expect(output.prompt).toContain('present components: component-a');
    expect(output.prompt).not.toContain('component-b');
    expect(output.prompt).not.toContain('component-c');
    expect(output.temporalForbidden).toEqual(expect.arrayContaining([
      'no future or not-yet-built component: component-b',
      'no future or not-yet-built component: component-c',
    ]));
    expect(output.negativePrompt).toContain('component-b');
    expect(output.negativePrompt).toContain('component-c');
  });

  it('preserves one primary action without expanding it into a sequence', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt.match(/\[ONE PRIMARY PHYSICAL ACTION\]/g)).toHaveLength(1);
    expect(output.prompt).toContain('FASTEN: fasten Beam B');
    expect(output.prompt).not.toMatch(/cut wood|carr(?:y|ies) beam|install wall|prepare roof/i);
  });

  it('preserves the canonical action target', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt).toContain('target: Beam B (component-b)');
    expect(output.prompt).toContain('target elements: post-a, post-b');
  });

  it('gives observable evidence a dedicated high-priority section', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt).toContain('[COMPLETION EVIDENCE — MUST BE VISIBLE]');
    expect(output.prompt).toContain('both endpoints visibly fixed');
  });

  it('preserves canonical camera configuration', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt).toContain('camera A; framing wide; orientation 30');
    expect(output.prompt).toContain('FOV 52');
    expect(output.prompt).toContain('lens 35mm f/8');
  });

  it('preserves canonical environment configuration', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt).toContain('preset floresta_temperada');
    expect(output.prompt).toContain('lighting daylight; time day; weather clear');
    expect(output.prompt).toContain('old-tree');
  });

  it('preserves identity locks', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.prompt).toContain('Canonical Builder (builder-1); visual identity builder-visual-1');
    expect(output.prompt).toContain('same face and body');
    expect(output.prompt).toContain('orange work jacket');
  });

  it('adds provider-specific quality negatives', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.qualityForbidden).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicated people'),
      expect.stringContaining('malformed hands'),
      expect.stringContaining('physically impossible objects'),
    ]));
    expect(output.negativePrompt).toContain('[QUALITY ARTIFACTS FORBIDDEN]');
  });

  it('keeps temporal negatives separate from quality negatives', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.temporalForbidden).toContain('no future or not-yet-built component: component-c');
    expect(output.qualityForbidden).not.toContain('no future or not-yet-built component: component-c');
    expect(output.negativePrompt).toContain('[TEMPORAL AND SCOPE FORBIDDEN]');
  });

  it('reports missing canonical data instead of inventing it', () => {
    const base = canonicalSpec();
    const spec = canonicalSpec({
      camera: {
        ...base.camera,
        id: '' as CanonicalImagePromptSpec['camera']['id'],
        viewpoint: { ...base.camera.viewpoint, fov: Number.NaN },
      },
      environment: { ...base.environment, light: '' },
      primaryAction: {
        ...base.primaryAction,
        target: { ...base.primaryAction.target, elements: [] },
      },
      completionEvidence: [],
    });
    const output = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });

    expect(output.warnings.map(warning => warning.code)).toEqual([
      'CAMERA_UNSPECIFIED',
      'LIGHTING_UNSPECIFIED',
      'TARGET_GEOMETRY_UNKNOWN',
      'COMPLETION_EVIDENCE_UNSPECIFIED',
    ]);
    expect(output.prompt).toContain('camera unspecified');
    expect(output.prompt).toContain('lighting unspecified');
    expect(output.prompt).toContain('target elements: unspecified');
  });

  it('produces FULL output with all optional detail sections', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), {
      mode: 'GENERATE',
      profile: 'FULL',
    });
    expect(output.profile).toBe('FULL');
    expect(output.includedSections).toEqual(expect.arrayContaining([
      'SPATIAL_DETAIL',
      'MATERIAL_INVENTORY_DETAIL',
      'EXTENDED_REALISM',
    ]));
    expect(output.omittedOptionalSections).toEqual([]);
    expect(output.prompt).toContain('[VISIBLE MATERIAL STATE]');
  });

  it('produces deterministic COMPACT output by omitting only optional detail sections', () => {
    const spec = canonicalSpec();
    const full = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE', profile: 'FULL' });
    const compact = adaptCanonicalImagePromptToNanoBanana(spec, {
      mode: 'GENERATE',
      profile: 'COMPACT',
    });
    expect(compact.profile).toBe('COMPACT');
    expect(compact.omittedOptionalSections).toEqual([
      'SPATIAL_DETAIL',
      'MATERIAL_INVENTORY_DETAIL',
      'EXTENDED_REALISM',
    ]);
    expect(compact.prompt.length).toBeLessThan(full.prompt.length);
    expect(compact.prompt).not.toContain('[VISIBLE MATERIAL STATE]');
  });

  it('keeps all critical temporal information in COMPACT output', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), {
      mode: 'EDIT',
      profile: 'COMPACT',
    });
    expect(output.prompt).toContain('OFFICIAL TIMELINE IMAGE');
    expect(output.prompt).toContain('Canonical Builder (builder-1)');
    expect(output.prompt).toContain('present: component-a, component-b');
    expect(output.prompt).toContain('FASTEN: fasten Beam B; target Beam B (component-b)');
    expect(output.prompt).toContain('both endpoints visibly fixed');
    expect(output.prompt).toContain('exact actor identity: builder-1');
    expect(output.negativePrompt).toContain('component-c');
  });

  it('does not mutate the canonical spec', () => {
    const spec = canonicalSpec();
    const original = structuredClone(spec);
    adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'EDIT', profile: 'COMPACT' });
    expect(spec).toEqual(original);
  });

  it('keeps a rejected candidate classified as candidate evidence', () => {
    const base = canonicalSpec();
    const spec = canonicalSpec({
      identity: {
        ...base.identity,
        snapshotKind: 'CANDIDATE',
        stageOutcome: 'REJECTED',
      },
      primaryAction: { ...base.primaryAction, visibility: 'ATTEMPTED' },
    });
    const output = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });
    expect(output.temporalAuthority).toMatchObject({
      snapshotKind: 'CANDIDATE',
      stageOutcome: 'REJECTED',
      officialTimeline: false,
    });
    expect(output.prompt).toContain('CANDIDATE ATTEMPT ONLY — rejected evidence');
  });

  it('keeps an official snapshot classified as official timeline state', () => {
    const output = adaptCanonicalImagePromptToNanoBanana(canonicalSpec(), { mode: 'GENERATE' });
    expect(output.temporalAuthority).toMatchObject({
      snapshotKind: 'OFFICIAL',
      stageOutcome: 'COMMITTED',
      officialTimeline: true,
    });
    expect(output.prompt).toContain('OFFICIAL TIMELINE IMAGE');
  });
});
