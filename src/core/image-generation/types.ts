import type {
  VisualStageOutcome,
  VisualStateKind,
  VisualTemporalPoint,
  VisualWorldStateSource,
} from '../visual-state/visual-state-snapshot';

export type ImageGenerationMode = 'GENERATE' | 'EDIT';
export type ImageProviderKind = 'MANUAL' | 'MOCK' | 'REMOTE' | 'LOCAL';
export type ImageTemporalAuthority = VisualStateKind;
export type ImageReferenceRole =
  | 'PREVIOUS_OFFICIAL'
  | 'CHARACTER'
  | 'ENVIRONMENT'
  | 'CONSTRUCTION'
  | 'PRODUCT'
  | 'OTHER';

export type ImageMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly ImageMetadataValue[]
  | { readonly [key: string]: ImageMetadataValue };

export interface ImageAssetRef {
  readonly id: string;
  readonly source: 'MANUAL' | 'MOCK' | 'REMOTE' | 'LOCAL' | 'IMPORTED';
  readonly uri: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly checksum?: string;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ImageReference {
  readonly asset: ImageAssetRef;
  readonly role: ImageReferenceRole;
}

export interface ImageResolution {
  readonly width: number;
  readonly height: number;
}

export interface ImageGenerationRequestMetadata {
  readonly canonicalSpecId: string;
  readonly snapshotId: string;
  readonly operationId: string;
  readonly temporalPoint: VisualTemporalPoint;
  readonly stageOutcome: VisualStageOutcome;
  readonly worldStateSource: VisualWorldStateSource;
  readonly adapterId?: string;
  readonly attributes?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ImageGenerationRequest {
  readonly requestId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly providerId: string;
  readonly mode: ImageGenerationMode;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly temporalAuthority: ImageTemporalAuthority;
  readonly snapshotKind: VisualStateKind;
  readonly references: readonly ImageReference[];
  readonly aspectRatio?: number;
  readonly resolution?: ImageResolution;
  readonly metadata: ImageGenerationRequestMetadata;
}

export type ImageGenerationErrorCode =
  | 'EDIT_REFERENCE_REQUIRED'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_MISMATCH'
  | 'PROVIDER_EXECUTION_ERROR';

export interface ImageGenerationSuccess {
  readonly status: 'SUCCESS';
  readonly requestId: string;
  readonly providerId: string;
  readonly asset: ImageAssetRef;
  readonly warnings: readonly string[];
  /** Generated pixels are unreviewed output, never an official timeline commit. */
  readonly outputStatus: 'UNREVIEWED';
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ManualGenerationPackage {
  readonly requestId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly references: readonly ImageReference[];
  readonly aspectRatio?: number;
  readonly resolution?: ImageResolution;
}

export interface ImageGenerationManualReady {
  readonly status: 'MANUAL_READY';
  readonly requestId: string;
  readonly providerId: string;
  readonly package: ManualGenerationPackage;
  readonly warnings: readonly string[];
  /** A manual package is not an image and cannot advance official state. */
  readonly outputStatus: 'UNREVIEWED';
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ImageGenerationFailure {
  readonly status: 'FAILURE';
  readonly requestId: string;
  readonly providerId: string;
  readonly errorCode: ImageGenerationErrorCode | string;
  readonly message: string;
  readonly retryable: boolean;
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type ImageGenerationResult =
  | ImageGenerationSuccess
  | ImageGenerationManualReady
  | ImageGenerationFailure;

/** Provider-neutral boundary. Provider SDK, transport and credential types stay outside it. */
export interface ImageProvider {
  readonly id: string;
  readonly kind: ImageProviderKind;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
