import type { PhysicalActionIR } from '../actions/physical-action-ir';
import type { ImageAssetRef, ImageMetadataValue } from '../image-generation';
import type { VisualReferenceTemporalPosition } from '../visual-reference';
import type { VisualStateSnapshot } from '../visual-state/visual-state-snapshot';

export type VideoProviderKind = 'MANUAL' | 'MOCK' | 'REMOTE' | 'LOCAL';

export interface VideoResolution {
  readonly width: number;
  readonly height: number;
}

export interface OfficialVideoSource {
  readonly referenceId: string;
  readonly approvalStatus: 'APPROVED';
  readonly temporalAuthority: 'OFFICIAL';
  readonly snapshotKind: 'OFFICIAL';
  readonly stageOutcome: 'COMMITTED';
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly canonicalSpecId: string;
  readonly requestId: string;
  readonly imageResultStatus: 'SUCCESS' | 'MANUAL_READY';
  readonly asset: ImageAssetRef;
  readonly temporalPoint: VisualStateSnapshot['temporalPoint'];
  readonly worldStateSource: VisualStateSnapshot['worldStateSource'];
  readonly temporalPosition: VisualReferenceTemporalPosition;
}

export interface CanonicalAnimationPromptSpec {
  readonly id: string;
  readonly identity: {
    readonly projectId: string;
    readonly sceneId: string;
    readonly stageId: string;
    readonly operationId: string;
    readonly snapshotId: string;
    readonly physicalActionIRId: string;
    readonly sourceReferenceId: string;
    readonly sourceImageAssetId: string;
  };
  readonly temporal: {
    readonly temporalAuthority: 'OFFICIAL';
    readonly snapshotKind: 'OFFICIAL';
    readonly stageOutcome: 'COMMITTED';
    readonly temporalPoint: VisualStateSnapshot['temporalPoint'];
    readonly worldStateSource: VisualStateSnapshot['worldStateSource'];
  };
  readonly motion: {
    readonly primaryAction: PhysicalActionIR['primaryAction'];
    readonly secondaryActions: readonly string[];
    readonly subjectMotion: {
      readonly characterId: string;
      readonly zoneBefore: string;
      readonly zoneAfter: string;
    };
    readonly constructionMotion: {
      readonly target: PhysicalActionIR['target'];
      readonly targetStatusBefore: PhysicalActionIR['before']['targetStatus'];
      readonly targetStatusAfter: PhysicalActionIR['after']['targetStatus'];
      readonly newlyCompletedComponents: readonly string[];
      readonly newlyPartialComponents: readonly string[];
    };
    readonly toolMotion: {
      readonly tools: readonly string[];
    };
    readonly materials: readonly string[];
  };
  readonly camera: {
    readonly cameraMode: 'IMAGE_TO_VIDEO';
    readonly cameraMovement: VisualStateSnapshot['camera']['viewpoint']['movement'];
    readonly framing: VisualStateSnapshot['camera']['framing'];
    readonly viewpointConstraints: {
      readonly cameraId: VisualStateSnapshot['camera']['id'];
      readonly allowedMovement: VisualStateSnapshot['camera']['allowedMovement'];
      readonly relativePosition: VisualStateSnapshot['camera']['relativePosition'];
      readonly orientation: number;
      readonly viewpoint: VisualStateSnapshot['camera']['viewpoint'];
    };
  };
  readonly continuity: {
    readonly preserveCharacter: {
      readonly characterId: string;
      readonly visualIdentityId: string;
    };
    readonly preserveClothing: string;
    readonly preserveEnvironment: {
      readonly preset: VisualStateSnapshot['environment']['preset'];
      readonly climate: string;
      readonly light: string;
      readonly timeOfDay: VisualStateSnapshot['environment']['timeOfDay'];
      readonly weather: VisualStateSnapshot['environment']['weather'];
      readonly permanentObjects: readonly string[];
    };
    readonly preserveConstructionGeometry: readonly string[];
    readonly preserveMaterials: readonly string[];
    readonly preserveLighting: string;
    readonly preserveCameraContinuity: {
      readonly cameraId: VisualStateSnapshot['camera']['id'];
      readonly movement: VisualStateSnapshot['camera']['viewpoint']['movement'];
    };
  };
  readonly forbidden: {
    readonly futureElements: readonly string[];
    readonly forbiddenTransformations: readonly string[];
    readonly forbiddenCameraChanges: readonly string[];
    readonly forbiddenIdentityChanges: readonly string[];
  };
  readonly output: {
    readonly durationSeconds: number;
    readonly aspectRatio: number;
    readonly resolution?: VideoResolution;
    readonly audio: 'SILENT';
  };
}

export type VideoPreparationErrorCode =
  | 'INVALID_SOURCE_IMAGE'
  | 'TEMPORAL_BINDING_MISMATCH'
  | 'PHYSICAL_ACTION_BINDING_MISMATCH'
  | 'INVALID_DURATION'
  | 'INVALID_OUTPUT';

export interface VideoPreparationFailure {
  readonly status: 'FAILURE';
  readonly errorCode: VideoPreparationErrorCode;
  readonly message: string;
}

export type CanonicalAnimationPromptSpecResult =
  | {
      readonly status: 'SUCCESS';
      readonly spec: CanonicalAnimationPromptSpec;
      readonly source: OfficialVideoSource;
    }
  | VideoPreparationFailure;

export interface VideoGenerationRequest {
  readonly requestId: string;
  readonly providerId: string;
  readonly sourceImage: ImageAssetRef;
  readonly source: OfficialVideoSource;
  readonly canonicalAnimationSpec: CanonicalAnimationPromptSpec;
  readonly renderedPrompt: string;
  readonly durationSeconds: number;
  readonly aspectRatio: number;
  readonly resolution?: VideoResolution;
  readonly temporalIdentity: {
    readonly projectId: string;
    readonly sceneId: string;
    readonly stageId: string;
    readonly operationId: string;
    readonly snapshotId: string;
    readonly temporalAuthority: 'OFFICIAL';
    readonly snapshotKind: 'OFFICIAL';
    readonly stageOutcome: 'COMMITTED';
    readonly temporalPoint: VisualStateSnapshot['temporalPoint'];
    readonly worldStateSource: VisualStateSnapshot['worldStateSource'];
    readonly temporalPosition: VisualReferenceTemporalPosition;
  };
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface VideoAssetRef {
  readonly id: string;
  readonly source: VideoProviderKind | 'IMPORTED';
  readonly uri: string;
  readonly mimeType?: string;
  readonly checksum?: string;
  readonly durationSeconds?: number;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ManualVideoSubmission {
  readonly submissionId: string;
  readonly requestId: string;
  readonly asset: VideoAssetRef;
  readonly submittedAt: number;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type ManualVideoCompletionErrorCode =
  | 'MANUAL_COMPLETION_INVALID_REQUEST'
  | 'MANUAL_COMPLETION_REQUEST_ID_MISMATCH'
  | 'MANUAL_COMPLETION_INVALID_SUBMISSION'
  | 'MANUAL_COMPLETION_INVALID_ASSET'
  | 'MANUAL_COMPLETION_INVALID_RESULT_STATUS'
  | 'MANUAL_COMPLETION_PROVIDER_MISMATCH'
  | 'MANUAL_COMPLETION_INVALID_DURATION';

export type VideoGenerationErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_SOURCE_IMAGE'
  | 'TEMPORAL_BINDING_MISMATCH'
  | 'INVALID_DURATION'
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_MISMATCH'
  | 'PROVIDER_EXECUTION_ERROR'
  | ManualVideoCompletionErrorCode;

export interface VideoGenerationSuccess {
  readonly status: 'SUCCESS';
  readonly requestId: string;
  readonly providerId: string;
  readonly asset: VideoAssetRef;
  readonly warnings: readonly string[];
  readonly outputStatus: 'UNREVIEWED';
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface ManualVideoPackage {
  readonly requestId: string;
  readonly prompt: string;
  readonly sourceImage: ImageAssetRef;
  readonly durationSeconds: number;
  readonly aspectRatio: number;
  readonly resolution?: VideoResolution;
  readonly audio: 'SILENT';
}

export interface VideoGenerationManualReady {
  readonly status: 'MANUAL_READY';
  readonly requestId: string;
  readonly providerId: string;
  readonly package: ManualVideoPackage;
  readonly warnings: readonly string[];
  readonly outputStatus: 'UNREVIEWED';
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface VideoGenerationFailure {
  readonly status: 'FAILURE';
  readonly requestId: string;
  readonly providerId: string;
  readonly errorCode: VideoGenerationErrorCode | string;
  readonly message: string;
  readonly retryable: boolean;
  readonly providerMetadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VideoGenerationResult =
  | VideoGenerationSuccess
  | VideoGenerationManualReady
  | VideoGenerationFailure;

export interface VideoProvider {
  readonly id: string;
  readonly kind: VideoProviderKind;
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}
