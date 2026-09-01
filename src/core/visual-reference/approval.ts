import type {
  ImageAssetRef,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageMetadataValue,
  ImageProviderKind,
  ImageReferenceRole,
} from '../image-generation';
import { createVisualReferenceMemory, type VisualReferenceMemory } from './memory';
import type { VisualReferenceRecord, VisualReferenceTemporalPosition } from './types';

export interface ApproveGeneratedImageAsOfficialInput {
  readonly request: ImageGenerationRequest;
  readonly result: ImageGenerationResult;
  readonly providerKind: ImageProviderKind;
  readonly approval: {
    readonly approved: true;
    readonly recordedAt: number;
    readonly role?: ImageReferenceRole;
    readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
  };
  /** Required for MANUAL_READY after the user supplies the externally generated asset. */
  readonly approvedAsset?: ImageAssetRef;
}

export function approveGeneratedImageAsOfficial(
  input: ApproveGeneratedImageAsOfficialInput,
): VisualReferenceRecord {
  const { request, result } = input;
  const temporalPosition = request.metadata.temporalPosition;

  if (input.approval.approved !== true) {
    throw new Error('Explicit manual approval is required.');
  }
  if (result.status === 'FAILURE') {
    throw new Error('A failed image generation result cannot be approved as official.');
  }
  validateRequiredIdentity(request);
  if (!isValidTemporalPosition(temporalPosition)) {
    throw new Error('A valid request temporal position is required for official approval.');
  }
  if (request.temporalAuthority !== 'OFFICIAL' || request.snapshotKind !== 'OFFICIAL') {
    throw new Error('Only an OFFICIAL visual snapshot request can become an official reference.');
  }
  if (request.metadata.stageOutcome !== 'COMMITTED') {
    throw new Error('Only a COMMITTED stage image can become an official reference.');
  }
  if (result.requestId !== request.requestId || result.providerId !== request.providerId) {
    throw new Error('Image result identity does not match the approved request.');
  }

  const asset = result.status === 'SUCCESS' ? result.asset : input.approvedAsset;
  if (!asset || isBlank(asset.id) || isBlank(asset.uri)) {
    throw new Error('An approved image asset with id and uri is required.');
  }

  const record: VisualReferenceRecord = {
    id: `visual-reference:${request.requestId}:${asset.id}`,
    approvalStatus: 'APPROVED',
    temporalAuthority: 'OFFICIAL',
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    operationId: request.metadata.operationId || undefined,
    snapshotId: request.metadata.snapshotId,
    canonicalSpecId: request.metadata.canonicalSpecId,
    requestId: request.requestId,
    providerId: request.providerId,
    providerKind: input.providerKind,
    asset,
    imageResultStatus: result.status,
    temporalPoint: request.metadata.temporalPoint,
    stageOutcome: 'COMMITTED',
    snapshotKind: 'OFFICIAL',
    worldStateSource: request.metadata.worldStateSource,
    temporalPosition,
    recordedAt: input.approval.recordedAt,
    role: input.approval.role ?? 'PREVIOUS_OFFICIAL',
    metadata: input.approval.metadata,
  };

  // Reuse the memory boundary for validation, cloning and deep immutability.
  return createVisualReferenceMemory([record]).records[0];
}

function validateRequiredIdentity(request: ImageGenerationRequest): void {
  const fields: ReadonlyArray<readonly [string, string]> = [
    ['requestId', request.requestId],
    ['providerId', request.providerId],
    ['projectId', request.projectId],
    ['sceneId', request.sceneId],
    ['stageId', request.stageId],
    ['snapshotId', request.metadata.snapshotId],
    ['canonicalSpecId', request.metadata.canonicalSpecId],
  ];
  const invalid = fields.find(([, value]) => isBlank(value));
  if (invalid) throw new Error(`Image approval ${invalid[0]} is required.`);
}

function isValidTemporalPosition(
  position: VisualReferenceTemporalPosition | undefined,
): position is VisualReferenceTemporalPosition {
  return !!position &&
    Number.isInteger(position.sceneOrder) &&
    Number.isInteger(position.stageOrder) &&
    position.sceneOrder >= 0 &&
    position.stageOrder >= 0;
}

function isBlank(value: string): boolean {
  return !value.trim();
}

/** Approval never mutates memory; callers append the returned record explicitly. */
export function appendApprovedVisualReference(
  memory: VisualReferenceMemory,
  input: ApproveGeneratedImageAsOfficialInput,
): VisualReferenceMemory {
  return memory.append(approveGeneratedImageAsOfficial(input));
}
