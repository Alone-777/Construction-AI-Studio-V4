import type { ImageMetadataValue } from '../image-generation';
import { renderCanonicalAnimationPrompt } from './animation-prompt';
import type {
  CanonicalAnimationPromptSpec,
  OfficialVideoSource,
  VideoGenerationRequest,
} from './types';

export interface CreateVideoGenerationRequestInput {
  readonly providerId: string;
  readonly canonicalAnimationSpec: CanonicalAnimationPromptSpec;
  readonly source: OfficialVideoSource;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

type VideoRequestIdentity = Omit<VideoGenerationRequest, 'requestId' | 'metadata'>;

export function createVideoGenerationRequest(
  input: CreateVideoGenerationRequestInput,
): VideoGenerationRequest {
  const providerId = input.providerId.trim();
  if (!providerId) throw new Error('Video provider id is required.');

  const spec = clone(input.canonicalAnimationSpec);
  const source = clone(input.source);
  const renderedPrompt = renderCanonicalAnimationPrompt(spec);
  const identity: VideoRequestIdentity = {
    providerId,
    sourceImage: clone(source.asset),
    source,
    canonicalAnimationSpec: spec,
    renderedPrompt,
    durationSeconds: spec.output.durationSeconds,
    aspectRatio: spec.output.aspectRatio,
    resolution: spec.output.resolution ? { ...spec.output.resolution } : undefined,
    temporalIdentity: {
      projectId: spec.identity.projectId,
      sceneId: spec.identity.sceneId,
      stageId: spec.identity.stageId,
      operationId: spec.identity.operationId,
      snapshotId: spec.identity.snapshotId,
      temporalAuthority: spec.temporal.temporalAuthority,
      snapshotKind: spec.temporal.snapshotKind,
      stageOutcome: spec.temporal.stageOutcome,
      temporalPoint: spec.temporal.temporalPoint,
      worldStateSource: spec.temporal.worldStateSource,
      temporalPosition: { ...source.temporalPosition },
    },
  };

  return deepFreeze({
    ...identity,
    requestId: createDeterministicVideoRequestId(identity),
    metadata: input.metadata ? clone(input.metadata) : undefined,
  });
}

export function cloneVideoGenerationRequest(
  request: VideoGenerationRequest,
): VideoGenerationRequest {
  return deepFreeze(clone(request));
}

export function createDeterministicVideoRequestId(
  identity: Omit<VideoGenerationRequest, 'requestId' | 'metadata'>,
): string {
  const serialized = stableSerialize(identity);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const character of serialized) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * prime) & mask;
  }

  return `video-request:${hash.toString(16).padStart(16, '0')}`;
}

export function videoRequestIdentity(
  request: VideoGenerationRequest,
): Omit<VideoGenerationRequest, 'requestId' | 'metadata'> {
  return {
    providerId: request.providerId,
    sourceImage: request.sourceImage,
    source: request.source,
    canonicalAnimationSpec: request.canonicalAnimationSpec,
    renderedPrompt: request.renderedPrompt,
    durationSeconds: request.durationSeconds,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    temporalIdentity: request.temporalIdentity,
  };
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
