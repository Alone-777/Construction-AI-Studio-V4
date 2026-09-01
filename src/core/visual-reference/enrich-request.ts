import {
  cloneImageGenerationRequest,
  withImageGenerationReferences,
  type ImageGenerationRequest,
} from '../image-generation';
import type { VisualReferenceRecord } from './types';

export function enrichImageGenerationRequestWithOfficialReference(
  request: ImageGenerationRequest,
  record?: VisualReferenceRecord,
): ImageGenerationRequest {
  if (!record || !isValidForRequest(record, request)) {
    return cloneImageGenerationRequest(request);
  }

  const alreadyPresent = request.references.some(
    reference => reference.asset.id === record.asset.id,
  );
  if (alreadyPresent) return cloneImageGenerationRequest(request);

  return withImageGenerationReferences(request, [
    ...request.references,
    { asset: record.asset, role: record.role },
  ]);
}

function isValidForRequest(
  record: VisualReferenceRecord,
  request: ImageGenerationRequest,
): boolean {
  return (
    record.projectId === request.projectId &&
    record.approvalStatus === 'APPROVED' &&
    record.temporalAuthority === 'OFFICIAL' &&
    record.snapshotKind === 'OFFICIAL' &&
    record.stageOutcome === 'COMMITTED'
  );
}
