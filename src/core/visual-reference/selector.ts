import type { ImageGenerationRequest } from '../image-generation';
import type { VisualReferenceMemory } from './memory';
import type {
  VisualReferenceRecord,
  VisualReferenceTemporalPosition,
} from './types';

export function selectBestOfficialReference(
  memory: VisualReferenceMemory,
  target: ImageGenerationRequest,
): VisualReferenceRecord | undefined {
  if (!isValidTemporalPosition(target.metadata.temporalPosition)) return undefined;

  const prior = memory
    .findByProject(target.projectId)
    .filter(
      record =>
        isSelectableOfficial(record) &&
        isVisualReferenceStrictlyBefore(record, target),
    );

  const sameScene = prior.filter(record => record.sceneId === target.sceneId);
  const candidates = sameScene.length > 0 ? sameScene : prior;

  return [...candidates].sort(compareClosestFirst)[0];
}

export function isVisualReferenceStrictlyBefore(
  record: VisualReferenceRecord,
  target: ImageGenerationRequest,
): boolean {
  const targetPosition = target.metadata.temporalPosition;
  return (
    record.projectId === target.projectId &&
    isValidTemporalPosition(record.temporalPosition) &&
    isValidTemporalPosition(targetPosition) &&
    isBefore(record.temporalPosition, targetPosition)
  );
}

function isSelectableOfficial(record: VisualReferenceRecord): boolean {
  return (
    record.approvalStatus === 'APPROVED' &&
    record.temporalAuthority === 'OFFICIAL' &&
    record.snapshotKind === 'OFFICIAL' &&
    record.stageOutcome === 'COMMITTED'
  );
}

function isBefore(
  left: VisualReferenceTemporalPosition,
  right: VisualReferenceTemporalPosition,
): boolean {
  return (
    left.sceneOrder < right.sceneOrder ||
    (left.sceneOrder === right.sceneOrder && left.stageOrder < right.stageOrder)
  );
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

function compareClosestFirst(left: VisualReferenceRecord, right: VisualReferenceRecord): number {
  return (
    right.temporalPosition.sceneOrder - left.temporalPosition.sceneOrder ||
    right.temporalPosition.stageOrder - left.temporalPosition.stageOrder ||
    right.recordedAt - left.recordedAt ||
    compareStableIds(left.id, right.id)
  );
}

function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
