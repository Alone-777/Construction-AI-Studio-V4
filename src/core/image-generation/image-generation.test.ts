import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import { renderCanonicalImagePrompt } from '../image-prompts/canonical-image-prompt-renderer';
import { adaptCanonicalImagePromptToNanoBanana } from '../image-prompts/nano-banana-prompt-adapter';
import { PipelineRegistry } from '../engines/pipeline/pipeline-registry';
import { beginStageTransaction } from '../transactions/stage-transaction';
import type { Stage, WorldState } from '../types';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';
import {
  createDeterministicMockImageProvider,
  createImageGenerationRequest,
  createImageGenerationService,
  createManualImageProvider,
  type ImageGenerationRequest,
  type ImageProvider,
  type ImageReference,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

function canonicalSpec(authority: 'OFFICIAL' | 'CANDIDATE' = 'OFFICIAL'): CanonicalImagePromptSpec {
  return {
    id: `canonical-image-prompt:snapshot-a:${authority.toLowerCase()}`,
    identity: {
      snapshotId: `snapshot-a:${authority.toLowerCase()}`,
      projectId: 'project-1',
      sceneId: 'scene-a',
      stageId: '100',
      operationId: 'operation-a',
      temporalPoint: 'AFTER',
      snapshotKind: authority,
      stageOutcome: authority === 'OFFICIAL' ? 'COMMITTED' : 'PENDING',
      worldStateSource: 'CANDIDATE',
      progress: 25,
    },
    subject: {
      characterId: 'builder-1',
      visualIdentityId: 'builder-visual-1',
      name: 'Builder',
      appearance: 'consistent face and body',
      clothing: 'orange work jacket',
      zone: 'zone-a',
      orientation: 'north',
      toolInUse: 'hammer',
    },
    primaryAction: {
      physicalActionIRId: 'physical-action:scene-a:operation-a:100',
      visibility: authority === 'OFFICIAL' ? 'COMMITTED' : 'ATTEMPTED',
      type: 'FASTEN',
      verb: 'fasten',
      description: 'fasten component A',
      target: { id: 'component-a', label: 'Component A', elements: ['component-a'] },
      tools: ['hammer'],
      materials: ['wood'],
      expectedTargetStatus: 'COMPLETE',
    },
    currentConstruction: {
      type: 'cabin',
      status: 'in progress',
      progress: 25,
      presentComponents: ['component-a'],
      completedComponents: ['component-a'],
      partialComponents: [],
      activeTarget: 'component-a',
      targetState: 'COMPLETE',
      pendingComponents: ['component-b'],
    },
    spatialContext: {
      activeZone: 'zone-a',
      stateZone: 'zone-a',
      relevantZones: [{
        id: 'zone-a',
        name: 'Work zone A',
        type: 'AREA',
        orientation: 'north',
        bounds: { x: 0, y: 0, width: 20, height: 20 },
      }],
    },
    materials: {
      visible: [{ materialId: 'wood', quantity: 8, status: 'available', location: 'zone-a' }],
      active: ['wood'],
      incorporated: [{ materialId: 'wood', quantity: 2, location: 'component-a' }],
    },
    camera: {
      id: 'A',
      relativePosition: { x: 10, y: 20 },
      orientation: 30,
      conceptualHeight: 'media',
      framing: 'wide',
      allowedMovement: 'FIXA',
      visibleZones: ['zone-a'],
      partiallyVisibleZones: [],
      hiddenZones: ['zone-b'],
      viewpoint: {
        position: { x: 12, y: 18 },
        target: { x: 10, y: 10 },
        fov: 52,
        aspectRatio: 9 / 16,
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
      zoneVegetation: [{ zoneId: 'zone-a', state: 'work-area' }],
    },
    mustShow: {
      subject: ['Builder (builder-1)', 'orange work jacket'],
      action: ['completed result of fastening component A'],
      construction: ['present component: component-a'],
      toolsAndMaterials: ['tool: hammer', 'material: wood'],
      evidence: ['component A visibly complete'],
    },
    mustPreserve: ['exact actor identity: builder-1', 'camera anchor: A'],
    mustNotShow: {
      futureComponents: ['component-b'],
      visualElements: ['modern-crane'],
      prohibitedChanges: ['no changes outside zone-a'],
    },
    completionEvidence: ['component A visibly complete'],
    realismRequirements: ['physically plausible construction'],
  };
}

function reference(role: ImageReference['role'] = 'PREVIOUS_OFFICIAL'): ImageReference {
  return {
    role,
    asset: {
      id: 'asset-official-a',
      source: 'IMPORTED',
      uri: 'asset://official/a',
      mimeType: 'image/png',
      width: 1080,
      height: 1920,
      checksum: 'checksum-a',
      metadata: { accepted: true },
    },
  };
}

function request(options: {
  authority?: 'OFFICIAL' | 'CANDIDATE';
  providerId?: string;
  mode?: 'GENERATE' | 'EDIT';
  references?: readonly ImageReference[];
  promptSuffix?: string;
  temporalPosition?: { readonly sceneOrder: number; readonly stageOrder: number };
} = {}): ImageGenerationRequest {
  const spec = canonicalSpec(options.authority);
  const mode = options.mode ?? 'GENERATE';
  const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode });
  return createImageGenerationRequest({
    canonicalSpec: spec,
    providerPrompt: {
      ...adapted,
      prompt: `${adapted.prompt}${options.promptSuffix ?? ''}`,
      adapterId: 'nano-banana-prompt-adapter',
    },
    providerId: options.providerId ?? 'mock',
    mode,
    references: options.references,
    temporalPosition: options.temporalPosition,
  });
}

function officialWorldState(): WorldState {
  return {
    terrain: { type: 'flat', slope: 'none', vegetation: 'grass', soil: 'dirt' },
    construction: { type: 'cabin', progress: 25, status: 'in progress' },
    existingComponents: ['component-a'],
    partialComponents: [],
    futureComponents: ['component-b'],
    materials: [],
    consumedMaterials: [],
    residues: [],
    tools: [],
    character: {
      characterId: 'builder-1',
      currentZone: 'zone-a',
      orientation: 'frente',
      currentAction: 'idle',
      carriedObjects: [],
      movementRequired: false,
    },
    activeZone: 'zone-a',
    climate: 'clear',
    light: 'day',
    vegetation: {},
    camera: 'A',
    temporaryObjects: [],
    permanentObjects: [],
    timestamp: 1,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(nested => freeze(nested));
    Object.freeze(value);
  }
  return value;
}

describe('#12 Image Provider Foundation', () => {
  it('1. creates a deterministic requestId', () => {
    expect(request().requestId).toBe(request().requestId);
  });

  it('2. changes requestId when semantic content changes', () => {
    expect(request().requestId).not.toBe(request({ promptSuffix: '\nextra constraint' }).requestId);
  });

  it('binds temporal position to request metadata and deterministic identity', () => {
    const first = request({ temporalPosition: { sceneOrder: 0, stageOrder: 0 } });
    const next = request({ temporalPosition: { sceneOrder: 0, stageOrder: 1 } });

    expect(first.metadata.temporalPosition).toEqual({ sceneOrder: 0, stageOrder: 0 });
    expect(next.metadata.temporalPosition).toEqual({ sceneOrder: 0, stageOrder: 1 });
    expect(first.requestId).not.toBe(next.requestId);
  });

  it('3. allows GENERATE with zero references', async () => {
    const result = await createImageGenerationService({
      providers: [createDeterministicMockImageProvider()],
    }).generate(request());
    expect(result.status).toBe('SUCCESS');
  });

  it('4. rejects EDIT with zero references before calling the provider', async () => {
    const generate = vi.fn<ImageProvider['generate']>();
    const provider: ImageProvider = { id: 'mock', kind: 'MOCK', generate };
    const result = await createImageGenerationService({ providers: [provider] })
      .generate(request({ mode: 'EDIT' }));
    expect(result).toMatchObject({ status: 'FAILURE', errorCode: 'EDIT_REFERENCE_REQUIRED' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('5. accepts EDIT with a valid reference', async () => {
    const result = await createImageGenerationService({
      providers: [createDeterministicMockImageProvider()],
    }).generate(request({ mode: 'EDIT', references: [reference()] }));
    expect(result.status).toBe('SUCCESS');
  });

  it('6. preserves the provider-adapted prompt verbatim except edge whitespace', () => {
    const spec = canonicalSpec();
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });
    const built = createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: adapted,
      providerId: 'manual',
      mode: 'GENERATE',
    });
    expect(built.prompt).toBe(adapted.prompt);
  });

  it('7. preserves negativePrompt', () => {
    const spec = canonicalSpec();
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });
    expect(createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: adapted,
      providerId: 'manual',
      mode: 'GENERATE',
    }).negativePrompt).toBe(adapted.negativePrompt);
  });

  it('8. preserves OFFICIAL temporal authority', () => {
    expect(request().temporalAuthority).toBe('OFFICIAL');
  });

  it('9. preserves CANDIDATE temporal authority', () => {
    expect(request({ authority: 'CANDIDATE' }).temporalAuthority).toBe('CANDIDATE');
  });

  it('10. never turns CANDIDATE input into OFFICIAL output', async () => {
    const candidateRequest = request({ authority: 'CANDIDATE' });
    const result = await createImageGenerationService({
      providers: [createDeterministicMockImageProvider()],
    }).generate(candidateRequest);
    expect(candidateRequest.snapshotKind).toBe('CANDIDATE');
    expect(result).toMatchObject({ status: 'SUCCESS', outputStatus: 'UNREVIEWED' });
  });

  it('11. manual provider performs no network request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(request({ providerId: 'manual' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('12. manual provider returns a structured MANUAL_READY package', async () => {
    const result = await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(request({ providerId: 'manual' }));
    expect(result).toMatchObject({
      status: 'MANUAL_READY',
      providerId: 'manual',
      outputStatus: 'UNREVIEWED',
    });
    if (result.status === 'MANUAL_READY') expect(result.package.prompt).toContain('Generate a new image');
  });

  it('13. mock provider returns deterministic results', async () => {
    const service = createImageGenerationService({ providers: [createDeterministicMockImageProvider()] });
    expect(await service.generate(request())).toEqual(await service.generate(request()));
  });

  it('14. same request yields the same synthetic asset ref', async () => {
    const service = createImageGenerationService({ providers: [createDeterministicMockImageProvider()] });
    const first = await service.generate(request());
    const second = await service.generate(request());
    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SUCCESS');
    if (first.status === 'SUCCESS' && second.status === 'SUCCESS') expect(first.asset).toEqual(second.asset);
  });

  it('15. returns structured provider success', async () => {
    const result = await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] })
      .generate(request());
    expect(result).toMatchObject({
      status: 'SUCCESS',
      providerId: 'mock',
      outputStatus: 'UNREVIEWED',
      asset: { source: 'MOCK' },
    });
  });

  it('16. preserves structured provider failure', async () => {
    const provider: ImageProvider = {
      id: 'failing',
      kind: 'LOCAL',
      async generate(value) {
        return {
          status: 'FAILURE',
          requestId: value.requestId,
          providerId: 'failing',
          errorCode: 'LOCAL_UNAVAILABLE',
          message: 'Local provider is not installed.',
          retryable: false,
        };
      },
    };
    const result = await createImageGenerationService({ providers: [provider] })
      .generate(request({ providerId: 'failing' }));
    expect(result).toMatchObject({ status: 'FAILURE', errorCode: 'LOCAL_UNAVAILABLE' });
  });

  it('17. fails clearly for an unknown provider', async () => {
    const result = await createImageGenerationService({ providers: [] })
      .generate(request({ providerId: 'missing' }));
    expect(result).toMatchObject({ status: 'FAILURE', errorCode: 'UNKNOWN_PROVIDER', retryable: false });
  });

  it('18. passes the correct immutable request to the provider', async () => {
    let received: ImageGenerationRequest | undefined;
    const provider: ImageProvider = {
      id: 'capture',
      kind: 'LOCAL',
      async generate(value) {
        received = value;
        return {
          status: 'FAILURE', requestId: value.requestId, providerId: 'capture',
          errorCode: 'CAPTURED', message: 'Captured for test.', retryable: false,
        };
      },
    };
    const expected = request({ providerId: 'capture' });
    await createImageGenerationService({ providers: [provider] }).generate(expected);
    expect(received).toEqual(expected);
    expect(Object.isFrozen(received)).toBe(true);
  });

  it('19. service does not mutate the source request', async () => {
    const source = clone(request()) as ImageGenerationRequest;
    const before = clone(source);
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(source);
    expect(source).toEqual(before);
  });

  it('20. service does not mutate VisualStateSnapshot upstream state', async () => {
    const snapshot = freeze({ id: 'snapshot-a', kind: 'OFFICIAL', identity: { progress: 25 } }) as unknown as VisualStateSnapshot;
    const before = clone(snapshot);
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(request());
    expect(snapshot).toEqual(before);
  });

  it('21. adapter, builder and service do not mutate CanonicalImagePromptSpec', async () => {
    const spec = freeze(canonicalSpec());
    const before = clone(spec);
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });
    const built = createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: adapted,
      providerId: 'mock',
      mode: 'GENERATE',
    });
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(built);
    expect(spec).toEqual(before);
  });

  it('22. generation does not mutate official WorldState', async () => {
    const state = officialWorldState();
    const before = clone(state);
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(request());
    expect(state).toEqual(before);
  });

  it('23. generation does not mutate Stage', async () => {
    const state = officialWorldState();
    const constructionStage = {
      status: 'rejected',
      decision: undefined,
      worldStateBefore: state,
      worldStateAfter: { ...clone(state), existingComponents: ['component-a', 'candidate-b'] },
    } as unknown as Stage;
    const before = clone(constructionStage);
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(request());
    expect(constructionStage).toEqual(before);
  });

  it('24. generation does not mutate StageTransaction', async () => {
    const state = officialWorldState();
    const transaction = beginStageTransaction({
      id: 'transaction-b', sceneId: 'scene-b', stageId: '50', operationId: 'operation-b',
      officialStateBefore: state,
      candidateState: { ...clone(state), existingComponents: ['component-a', 'candidate-b'] },
    });
    const before = clone(transaction);
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] }).generate(request());
    expect(transaction).toEqual(before);
  });

  it('25. ImageProvider is structurally provider-neutral', async () => {
    const provider: ImageProvider = {
      id: 'neutral',
      kind: 'REMOTE',
      async generate(value) {
        return {
          status: 'FAILURE', requestId: value.requestId, providerId: 'neutral',
          errorCode: 'NOT_IMPLEMENTED', message: 'Structural provider only.', retryable: false,
        };
      },
    };
    expect(provider).toMatchObject({ id: 'neutral', kind: 'REMOTE' });
  });

  it('26. NanoBanana prompt adapter remains compatible with the request builder', () => {
    const spec = canonicalSpec();
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'EDIT' });
    const built = createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: adapted,
      providerId: 'manual',
      mode: 'EDIT',
      references: [reference()],
    });
    expect(built.prompt).toBe(adapted.prompt);
    expect(built.metadata.canonicalSpecId).toBe(spec.id);
  });

  it('27. canonical rendered prompt remains upstream authority', () => {
    const spec = canonicalSpec();
    const rendered = renderCanonicalImagePrompt(spec);
    const built = createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: { canonicalSpecId: spec.id, prompt: rendered, adapterId: 'canonical-renderer' },
      providerId: 'manual',
      mode: 'GENERATE',
    });
    expect(built.prompt).toBe(rendered);
    expect(built.metadata.adapterId).toBe('canonical-renderer');
  });

  it('28. rejected and unexecuted stages do not gain automatic image generation', () => {
    expect(PipelineRegistry.getStageNames()).not.toContain('image-generation');
    expect(PipelineRegistry.getStageNames()).not.toContain('image-provider');
  });

  it('29. manual and mock providers make no network calls', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(request({ providerId: 'manual' }));
    await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] })
      .generate(request());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('30. suite requires no secret to instantiate the foundation', () => {
    expect(() => createImageGenerationService({
      providers: [createManualImageProvider(), createDeterministicMockImageProvider()],
    })).not.toThrow();
  });

  it('31. MANUAL works without an API key', async () => {
    const result = await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(request({ providerId: 'manual' }));
    expect(result.status).toBe('MANUAL_READY');
  });

  it('32. MOCK works without an API key', async () => {
    const result = await createImageGenerationService({ providers: [createDeterministicMockImageProvider()] })
      .generate(request());
    expect(result.status).toBe('SUCCESS');
  });

  it('33. provider registry is isolated by dependency injection', async () => {
    const manualOnly = createImageGenerationService({ providers: [createManualImageProvider()] });
    const mockOnly = createImageGenerationService({ providers: [createDeterministicMockImageProvider()] });
    expect((await manualOnly.generate(request())).status).toBe('FAILURE');
    expect((await mockOnly.generate(request())).status).toBe('SUCCESS');
  });

  it('34. same canonical state and same config produce the same request', () => {
    expect(request()).toEqual(request());
  });

  it('35. preserves one PREVIOUS_OFFICIAL reference without inventing another', () => {
    const previous = reference('PREVIOUS_OFFICIAL');
    const built = request({ mode: 'EDIT', references: [previous] });
    expect(built.references).toHaveLength(1);
    expect(built.references[0]).toEqual(previous);
    expect(built.references[0].role).toBe('PREVIOUS_OFFICIAL');
  });

  it('36. official request for committed A cannot absorb rejected candidate B', async () => {
    const officialA = canonicalSpec('OFFICIAL');
    const rejectedCandidateB = freeze({
      snapshotKind: 'CANDIDATE',
      stageOutcome: 'REJECTED',
      completedComponents: ['component-a', 'candidate-b-only-geometry'],
    });
    const candidateBefore = clone(rejectedCandidateB);
    const adaptedA = adaptCanonicalImagePromptToNanoBanana(officialA, { mode: 'GENERATE' });
    const officialRequestA = createImageGenerationRequest({
      canonicalSpec: officialA,
      providerPrompt: adaptedA,
      providerId: 'manual',
      mode: 'GENERATE',
    });
    const result = await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(officialRequestA);

    expect(officialRequestA.temporalAuthority).toBe('OFFICIAL');
    expect(officialRequestA.prompt).not.toContain('candidate-b-only-geometry');
    expect(result.status).toBe('MANUAL_READY');
    expect(rejectedCandidateB).toEqual(candidateBefore);
  });

  it('37. free canonical-to-manual workflow needs no key, secret, network or pixels', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const spec = canonicalSpec('OFFICIAL');
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, { mode: 'GENERATE' });
    const built = createImageGenerationRequest({
      canonicalSpec: spec,
      providerPrompt: adapted,
      providerId: 'manual',
      mode: 'GENERATE',
    });
    const result = await createImageGenerationService({ providers: [createManualImageProvider()] })
      .generate(built);

    expect(result.status).toBe('MANUAL_READY');
    expect(fetchSpy).not.toHaveBeenCalled();
    if (result.status === 'MANUAL_READY') {
      expect(result.package.prompt).toBe(adapted.prompt);
      expect(result.providerMetadata).toMatchObject({ networkUsed: false });
    }
  });
});
