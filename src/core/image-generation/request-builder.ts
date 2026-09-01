import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import type {
  ImageAssetRef,
  ImageGenerationMode,
  ImageGenerationRequest,
  ImageMetadataValue,
  ImageReference,
  ImageResolution,
  ImageTemporalPosition,
} from './types';

export interface AdaptedImagePrompt {
  readonly canonicalSpecId: string;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly mode?: ImageGenerationMode;
  readonly adapterId?: string;
}

export interface CreateImageGenerationRequestInput {
  readonly canonicalSpec: CanonicalImagePromptSpec;
  readonly providerPrompt: AdaptedImagePrompt;
  readonly providerId: string;
  readonly mode: ImageGenerationMode;
  readonly references?: readonly ImageReference[];
  readonly aspectRatio?: number;
  readonly resolution?: ImageResolution;
  readonly temporalPosition?: ImageTemporalPosition;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

type RequestIdentity = Omit<ImageGenerationRequest, 'requestId' | 'metadata'> & {
  readonly temporalPoint: ImageGenerationRequest['metadata']['temporalPoint'];
  readonly stageOutcome: ImageGenerationRequest['metadata']['stageOutcome'];
  readonly worldStateSource: ImageGenerationRequest['metadata']['worldStateSource'];
  readonly canonicalSpecId: string;
  readonly snapshotId: string;
  readonly operationId: string;
  readonly temporalPosition?: ImageTemporalPosition;
};

export function createImageGenerationRequest(
  input: CreateImageGenerationRequestInput,
): ImageGenerationRequest {
  const { canonicalSpec, providerPrompt } = input;
  const providerId = input.providerId.trim();
  const prompt = providerPrompt.prompt;

  if (!providerId) throw new Error('Image generation providerId is required.');
  if (!prompt) throw new Error('Adapted image prompt is required.');
  if (providerPrompt.canonicalSpecId !== canonicalSpec.id) {
    throw new Error('Adapted image prompt does not match the supplied CanonicalImagePromptSpec.');
  }
  if (providerPrompt.mode && providerPrompt.mode !== input.mode) {
    throw new Error('Adapted image prompt mode does not match the image generation request mode.');
  }

  const references = normalizeReferences(input.references ?? []);
  const aspectRatio = input.aspectRatio ?? canonicalSpec.camera.viewpoint.aspectRatio;
  const resolution = input.resolution ? { ...input.resolution } : undefined;
  const base = {
    projectId: canonicalSpec.identity.projectId,
    sceneId: canonicalSpec.identity.sceneId,
    stageId: canonicalSpec.identity.stageId,
    providerId,
    mode: input.mode,
    prompt,
    negativePrompt: providerPrompt.negativePrompt,
    temporalAuthority: canonicalSpec.identity.snapshotKind,
    snapshotKind: canonicalSpec.identity.snapshotKind,
    references,
    aspectRatio,
    resolution,
  } as const;
  const identity: RequestIdentity = {
    ...base,
    temporalPoint: canonicalSpec.identity.temporalPoint,
    stageOutcome: canonicalSpec.identity.stageOutcome,
    worldStateSource: canonicalSpec.identity.worldStateSource,
    canonicalSpecId: canonicalSpec.id,
    snapshotId: canonicalSpec.identity.snapshotId,
    operationId: canonicalSpec.identity.operationId,
    temporalPosition: input.temporalPosition
      ? { ...input.temporalPosition }
      : undefined,
  };

  return freezeImageGenerationRequest({
    ...base,
    requestId: createDeterministicRequestId(identity),
    metadata: {
      canonicalSpecId: canonicalSpec.id,
      snapshotId: canonicalSpec.identity.snapshotId,
      operationId: canonicalSpec.identity.operationId,
      temporalPoint: canonicalSpec.identity.temporalPoint,
      stageOutcome: canonicalSpec.identity.stageOutcome,
      worldStateSource: canonicalSpec.identity.worldStateSource,
      temporalPosition: input.temporalPosition
        ? { ...input.temporalPosition }
        : undefined,
      adapterId: providerPrompt.adapterId,
      attributes: input.metadata ? cloneMetadata(input.metadata) : undefined,
    },
  });
}

export function cloneImageGenerationRequest(request: ImageGenerationRequest): ImageGenerationRequest {
  return freezeImageGenerationRequest({
    ...request,
    references: normalizeReferences(request.references),
    resolution: request.resolution ? { ...request.resolution } : undefined,
    metadata: {
      ...request.metadata,
      temporalPosition: request.metadata.temporalPosition
        ? { ...request.metadata.temporalPosition }
        : undefined,
      attributes: request.metadata.attributes
        ? cloneMetadata(request.metadata.attributes)
        : undefined,
    },
  });
}

/** Returns a new immutable request and keeps reference changes inside request identity. */
export function withImageGenerationReferences(
  request: ImageGenerationRequest,
  references: readonly ImageReference[],
): ImageGenerationRequest {
  return rebuildImageGenerationRequest(request, { references });
}

/** Rebuilds request identity through the canonical hash while preserving upstream temporal data. */
export function withImageGenerationPrompt(
  request: ImageGenerationRequest,
  prompt: string,
  metadataAttributes?: Readonly<Record<string, ImageMetadataValue>>,
): ImageGenerationRequest {
  if (!prompt.trim()) throw new Error('Derived image generation prompt is required.');
  return rebuildImageGenerationRequest(request, { prompt, metadataAttributes });
}

interface RebuildImageGenerationRequestOverrides {
  readonly prompt?: string;
  readonly references?: readonly ImageReference[];
  readonly metadataAttributes?: Readonly<Record<string, ImageMetadataValue>>;
}

function rebuildImageGenerationRequest(
  request: ImageGenerationRequest,
  overrides: RebuildImageGenerationRequestOverrides,
): ImageGenerationRequest {
  const normalizedReferences = normalizeReferences(overrides.references ?? request.references);
  const base = {
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    providerId: request.providerId,
    mode: request.mode,
    prompt: overrides.prompt ?? request.prompt,
    negativePrompt: request.negativePrompt,
    temporalAuthority: request.temporalAuthority,
    snapshotKind: request.snapshotKind,
    references: normalizedReferences,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution ? { ...request.resolution } : undefined,
  } as const;
  const identity: RequestIdentity = {
    ...base,
    temporalPoint: request.metadata.temporalPoint,
    stageOutcome: request.metadata.stageOutcome,
    worldStateSource: request.metadata.worldStateSource,
    canonicalSpecId: request.metadata.canonicalSpecId,
    snapshotId: request.metadata.snapshotId,
    operationId: request.metadata.operationId,
    temporalPosition: request.metadata.temporalPosition
      ? { ...request.metadata.temporalPosition }
      : undefined,
  };
  const mergedAttributes = {
    ...(request.metadata.attributes ?? {}),
    ...(overrides.metadataAttributes ?? {}),
  };

  return freezeImageGenerationRequest({
    ...base,
    requestId: createDeterministicRequestId(identity),
    metadata: {
      ...request.metadata,
      temporalPosition: request.metadata.temporalPosition
        ? { ...request.metadata.temporalPosition }
        : undefined,
      attributes: Object.keys(mergedAttributes).length > 0
        ? cloneMetadata(mergedAttributes)
        : undefined,
    },
  });
}

function createDeterministicRequestId(identity: RequestIdentity): string {
  const serialized = stableSerialize(identity);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const character of serialized) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * prime) & mask;
  }

  return `image-request:${hash.toString(16).padStart(16, '0')}`;
}

function normalizeReferences(references: readonly ImageReference[]): readonly ImageReference[] {
  return references
    .map(reference => ({
      role: reference.role,
      asset: cloneAsset(reference.asset),
    }))
    .sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

function cloneAsset(asset: ImageAssetRef): ImageAssetRef {
  return {
    ...asset,
    metadata: asset.metadata ? cloneMetadata(asset.metadata) : undefined,
  };
}

function cloneMetadata(
  metadata: Readonly<Record<string, ImageMetadataValue>>,
): Readonly<Record<string, ImageMetadataValue>> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, cloneMetadataValue(value)]),
  );
}

function cloneMetadataValue(value: ImageMetadataValue): ImageMetadataValue {
  if (Array.isArray(value)) return value.map(item => cloneMetadataValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneMetadataValue(item)]),
    );
  }
  return value;
}

function referenceKey(reference: ImageReference): string {
  return stableSerialize(reference);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function freezeImageGenerationRequest(request: ImageGenerationRequest): ImageGenerationRequest {
  return deepFreeze(request);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
