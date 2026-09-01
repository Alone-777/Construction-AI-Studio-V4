import { describe, expect, it, vi } from 'vitest';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import { compileCanonicalImagePromptSpec } from './canonical-image-prompt-compiler';
import { renderCanonicalImagePrompt } from './canonical-image-prompt-renderer';

function snapshot(overrides: Partial<VisualStateSnapshot> = {}): VisualStateSnapshot {
  const value: VisualStateSnapshot = {
    id: 'visual-state:project-1:scene-b:50:official:after',
    kind: 'OFFICIAL',
    temporalPoint: 'AFTER',
    stageOutcome: 'COMMITTED',
    worldStateSource: 'CANDIDATE',
    identity: {
      projectId: 'project-1',
      visualDNAId: 'visual-dna-1',
      sceneId: 'scene-b',
      stageId: '50',
      operationId: 'operation-b',
      progress: 50,
    },
    actor: {
      characterId: 'builder-1',
      visualIdentityId: 'builder-visual-1',
      name: 'Canonical Builder',
      appearance: 'same face and body',
      clothing: 'orange work jacket',
      zone: 'Z2',
      orientation: 'north',
      toolInUse: 'hammer',
    },
    action: {
      physicalActionIRId: 'physical-action:scene-b:operation-b:50',
      visibility: 'COMMITTED',
      primary: { type: 'FASTEN', verb: 'fasten', description: 'fasten Beam B' },
      target: { id: 'component-b', label: 'Beam B', elements: ['beam-b'] },
      tools: ['hammer'],
      materials: ['wood'],
      expectedTargetStatus: 'PARTIAL',
    },
    construction: {
      type: 'cabin',
      status: 'in progress',
      progress: 50,
      visibleComponents: ['component-a', 'component-b'],
      completedComponents: ['component-a'],
      partialComponents: ['component-b'],
      activeComponent: 'component-b',
      targetState: 'PARTIAL',
      pendingComponents: ['component-c'],
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8, status: 'available', location: 'Z1' }],
      active: ['wood'],
      incorporated: [],
    },
    space: {
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
      light: 'day',
      timeOfDay: 'day',
      weather: 'clear',
      permanentObjects: ['old-tree'],
      zoneVegetation: [{ zoneId: 'Z2', state: 'work-area' }],
    },
    continuity: {
      preserveActorIdentity: 'builder-1',
      preserveClothing: 'orange work jacket',
      preserveComponents: ['component-a'],
      preserveZones: ['Z1', 'Z3'],
      preserveMaterialPlacements: ['wood@Z1'],
      preserveCameraId: 'A',
      requiredVisualElements: ['old-tree'],
      forbiddenVisualElements: ['component-c', 'modern-crane'],
      futureForbidden: ['component-c'],
      terrainOutsideActiveZoneUnchanged: true,
    },
    evidence: {
      actionEvidence: ['Beam B is visibly fastened to component A'],
      target: { id: 'component-b', status: 'PARTIAL' },
      completedComponents: ['component-a'],
      partialComponents: ['component-b'],
      materialQuantityChanges: [{ materialId: 'wood', before: 10, after: 8 }],
    },
  };

  return { ...value, ...overrides };
}

function compile(value = snapshot()) {
  const spec = compileCanonicalImagePromptSpec(value);
  if (!spec) throw new Error('Expected canonical image prompt spec');
  return spec;
}

describe('compileCanonicalImagePromptSpec', () => {
  it('produces the same spec for the same snapshot', () => {
    const input = snapshot();
    expect(compile(input)).toEqual(compile(input));
  });

  it('renders the same text for the same spec', () => {
    const spec = compile();
    expect(renderCanonicalImagePrompt(spec)).toBe(renderCanonicalImagePrompt(spec));
  });

  it('does not mutate the visual state snapshot', () => {
    const input = snapshot();
    const original = structuredClone(input);
    compile(input);
    expect(input).toEqual(original);
  });

  it('preserves exactly one primary action', () => {
    const spec = compile();
    expect(spec.primaryAction).toMatchObject({ type: 'FASTEN', verb: 'fasten' });
    expect(spec.primaryAction.description).toBe('fasten Beam B');
  });

  it('preserves the canonical target', () => {
    expect(compile().primaryAction.target).toEqual({
      id: 'component-b',
      label: 'Beam B',
      elements: ['beam-b'],
    });
  });

  it('preserves action tools', () => {
    expect(compile().primaryAction.tools).toEqual(['hammer']);
  });

  it('preserves action materials', () => {
    const spec = compile();
    expect(spec.primaryAction.materials).toEqual(['wood']);
    expect(spec.materials.visible).toEqual([
      { materialId: 'wood', quantity: 8, status: 'available', location: 'Z1' },
    ]);
  });

  it('preserves only current construction as present', () => {
    expect(compile().currentConstruction.presentComponents).toEqual([
      'component-a',
      'component-b',
    ]);
  });

  it('places future components only in pending and forbidden structures', () => {
    const spec = compile();
    expect(spec.currentConstruction.presentComponents).not.toContain('component-c');
    expect(spec.currentConstruction.pendingComponents).toContain('component-c');
    expect(spec.mustNotShow.futureComponents).toContain('component-c');
    expect(spec.mustShow.construction.join(' ')).not.toContain('component-c');
  });

  it('turns continuity invariants into explicit locks', () => {
    expect(compile().mustPreserve).toEqual(expect.arrayContaining([
      'exact actor identity: builder-1',
      'existing component geometry: component-a',
      'camera anchor: A',
      'terrain outside active zone Z2',
    ]));
  });

  it('preserves existing camera information', () => {
    expect(compile().camera).toMatchObject({
      id: 'A',
      framing: 'wide',
      orientation: 30,
      viewpoint: { position: { x: 12, y: 18 }, fov: 52 },
    });
  });

  it('preserves existing environment information', () => {
    expect(compile().environment).toMatchObject({
      preset: 'floresta_temperada',
      climate: 'clear',
      light: 'day',
      timeOfDay: 'day',
      weather: 'clear',
    });
  });

  it('includes observable completion evidence', () => {
    expect(compile().completionEvidence).toEqual(expect.arrayContaining([
      'Beam B is visibly fastened to component A',
      'target component-b is partial',
    ]));
  });

  it('identifies a rejected attempt as a candidate, never official', () => {
    const input = snapshot({
      id: 'visual-state:project-1:scene-b:50:candidate:after',
      kind: 'CANDIDATE',
      stageOutcome: 'REJECTED',
      action: { ...snapshot().action, visibility: 'ATTEMPTED' },
    });
    const spec = compile(input);

    expect(spec.identity.snapshotKind).toBe('CANDIDATE');
    expect(spec.identity.stageOutcome).toBe('REJECTED');
    expect(spec.primaryAction.visibility).toBe('ATTEMPTED');
  });

  it('identifies a committed official snapshot as official', () => {
    const spec = compile();
    expect(spec.identity.snapshotKind).toBe('OFFICIAL');
    expect(spec.identity.stageOutcome).toBe('COMMITTED');
  });

  it('cannot create a fake spec without an executed-stage snapshot', () => {
    expect(compileCanonicalImagePromptSpec(undefined)).toBeUndefined();
  });

  it('does not depend on time or randomness', () => {
    const dateSpy = vi.spyOn(Date, 'now');
    const randomSpy = vi.spyOn(Math, 'random');

    const spec = compile();
    const text = renderCanonicalImagePrompt(spec);

    expect(dateSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(spec.id).toBe(`canonical-image-prompt:${snapshot().id}`);
    expect(text).not.toMatch(/\b\d{13}\b/);
    dateSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('keeps present and forbidden component sets disjoint', () => {
    const spec = compile();
    const forbidden = new Set([
      ...spec.mustNotShow.futureComponents,
      ...spec.mustNotShow.visualElements,
    ]);
    expect(spec.currentConstruction.presentComponents.filter(item => forbidden.has(item))).toEqual([]);
  });

  it('rejects a snapshot with a present/forbidden temporal conflict', () => {
    const input = snapshot({
      construction: {
        ...snapshot().construction,
        visibleComponents: ['component-a', 'component-c'],
      },
    });

    expect(() => compileCanonicalImagePromptSpec(input)).toThrow(
      'both present and forbidden: component-c',
    );
  });
});
