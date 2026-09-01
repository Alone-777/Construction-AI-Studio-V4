import type {
  ImageAssetRef,
  ImageMetadataValue,
  ImageProviderKind,
  ImageReferenceRole,
} from '../image-generation';
import type {
  VisualTemporalPoint,
  VisualWorldStateSource,
} from '../visual-state/visual-state-snapshot';

/** Caller-supplied official ordering; never inferred from ids, dates or operations. */
export interface VisualReferenceTemporalPosition {
  readonly sceneOrder: number;
  readonly stageOrder: number;
}

export interface VisualReferenceRecord {
  readonly id: string;
  readonly approvalStatus: 'APPROVED';
  readonly temporalAuthority: 'OFFICIAL';
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId?: string;
  readonly snapshotId: string;
  readonly canonicalSpecId: string;
  readonly requestId: string;
  readonly providerId: string;
  readonly providerKind: ImageProviderKind;
  readonly asset: ImageAssetRef;
  readonly imageResultStatus: 'SUCCESS' | 'MANUAL_READY';
  readonly temporalPoint: VisualTemporalPoint;
  readonly stageOutcome: 'COMMITTED';
  readonly snapshotKind: 'OFFICIAL';
  readonly worldStateSource: VisualWorldStateSource;
  readonly temporalPosition: VisualReferenceTemporalPosition;
  readonly recordedAt: number;
  readonly role: ImageReferenceRole;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export interface VisualReferenceSelectionTarget {
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly temporalPosition: VisualReferenceTemporalPosition;
}
