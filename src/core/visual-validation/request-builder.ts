import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageMetadataValue,
} from '../image-generation';
import {
  isVisualReferenceStrictlyBefore,
  type VisualReferenceRecord,
} from '../visual-reference';
import type {
  ExpectedVisualFacts,
  VisualValidationPreviousReference,
  VisualValidationRequest,
} from './types';

export interface CreateVisualValidationRequestInput {
  readonly request: ImageGenerationRequest;
  readonly result: ImageGenerationResult;
  readonly canonicalSpec: CanonicalImagePromptSpec;
  readonly previousOfficialReference?: VisualReferenceRecord | null;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export function createVisualValidationRequest(
  input: CreateVisualValidationRequestInput,
): VisualValidationRequest {
  const { request, result, canonicalSpec } = input;
  if (result.status !== 'SUCCESS' || result.outputStatus !== 'UNREVIEWED') {
    throw new Error('Visual validation requires an unreviewed SUCCESS image result.');
  }
  if (result.requestId !== request.requestId || result.providerId !== request.providerId) {
    throw new Error('Visual validation image result does not match its generation request.');
  }
  if (!result.asset.id.trim() || !result.asset.uri.trim()) {
    throw new Error('Visual validation requires a candidate asset with id and uri.');
  }
  validateCanonicalIdentity(request, canonicalSpec);

  const previousOfficialReference = input.previousOfficialReference
    ? buildPreviousReference(input.previousOfficialReference, request)
    : undefined;

  return {
    validationId: createVisualValidationId(request.requestId, result.asset.id),
    projectId: request.projectId,
    sceneId: request.sceneId,
    stageId: request.stageId,
    operationId: request.metadata.operationId,
    requestId: request.requestId,
    snapshotId: request.metadata.snapshotId,
    canonicalSpecId: request.metadata.canonicalSpecId,
    candidateAsset: structuredClone(result.asset),
    previousOfficialReference,
    temporalAuthority: request.temporalAuthority,
    snapshotKind: request.snapshotKind,
    stageOutcome: request.metadata.stageOutcome,
    temporalPoint: request.metadata.temporalPoint,
    worldStateSource: request.metadata.worldStateSource,
    temporalPosition: request.metadata.temporalPosition
      ? { ...request.metadata.temporalPosition }
      : undefined,
    expected: deriveExpectedVisualFacts(canonicalSpec),
    metadata: input.metadata ? structuredClone(input.metadata) : undefined,
  };
}

export function createVisualValidationId(requestId: string, assetId: string): string {
  return `visual-validation:${requestId}:${assetId}`;
}

export function deriveExpectedVisualFacts(
  spec: CanonicalImagePromptSpec,
): ExpectedVisualFacts {
  return {
    requiredElements: uniqueSorted(spec.currentConstruction.presentComponents),
    forbiddenFutureElements: uniqueSorted(spec.mustNotShow.futureComponents),
    expectedCharacter: {
      characterId: spec.subject.characterId,
      visualIdentityId: spec.subject.visualIdentityId,
      name: spec.subject.name,
    },
    expectedClothing: spec.subject.clothing,
    expectedEnvironment: {
      preset: spec.environment.preset,
      climate: spec.environment.climate,
      light: spec.environment.light,
      timeOfDay: spec.environment.timeOfDay,
      weather: spec.environment.weather,
      permanentObjects: uniqueSorted(spec.environment.permanentObjects),
    },
    expectedConstructionState: {
      progress: spec.currentConstruction.progress,
      targetId: spec.primaryAction.target.id,
      targetState: spec.currentConstruction.targetState,
      expectedTargetStatus: spec.primaryAction.expectedTargetStatus,
      presentComponents: uniqueSorted(spec.currentConstruction.presentComponents),
      completedComponents: uniqueSorted(spec.currentConstruction.completedComponents),
      partialComponents: uniqueSorted(spec.currentConstruction.partialComponents),
    },
    expectedMaterials: uniqueSorted([
      ...spec.primaryAction.materials,
      ...spec.materials.active,
      ...spec.materials.visible.map(material => material.materialId),
    ]),
    expectedTools: uniqueSorted(spec.primaryAction.tools),
    continuityConstraints: uniqueSorted(spec.mustPreserve),
  };
}

function validateCanonicalIdentity(
  request: ImageGenerationRequest,
  spec: CanonicalImagePromptSpec,
): void {
  const matches =
    request.metadata.canonicalSpecId === spec.id &&
    request.metadata.snapshotId === spec.identity.snapshotId &&
    request.projectId === spec.identity.projectId &&
    request.sceneId === spec.identity.sceneId &&
    request.stageId === spec.identity.stageId &&
    request.metadata.operationId === spec.identity.operationId &&
    request.temporalAuthority === spec.identity.snapshotKind &&
    request.snapshotKind === spec.identity.snapshotKind &&
    request.metadata.stageOutcome === spec.identity.stageOutcome &&
    request.metadata.temporalPoint === spec.identity.temporalPoint &&
    request.metadata.worldStateSource === spec.identity.worldStateSource;
  if (!matches) {
    throw new Error('CanonicalImagePromptSpec identity does not match the validation request.');
  }
}

function buildPreviousReference(
  record: VisualReferenceRecord,
  request: ImageGenerationRequest,
): VisualValidationPreviousReference {
  const official =
    record.approvalStatus === 'APPROVED' &&
    record.temporalAuthority === 'OFFICIAL' &&
    record.snapshotKind === 'OFFICIAL' &&
    record.stageOutcome === 'COMMITTED';
  if (!official || !isVisualReferenceStrictlyBefore(record, request)) {
    throw new Error('Previous visual validation reference must be official and temporally prior.');
  }
  return {
    recordId: record.id,
    requestId: record.requestId,
    projectId: record.projectId,
    sceneId: record.sceneId,
    stageId: record.stageId,
    asset: structuredClone(record.asset),
    temporalPosition: { ...record.temporalPosition },
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
