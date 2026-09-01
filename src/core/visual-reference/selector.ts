import type { VisualReferenceMemory } from './memory';
import type {
  VisualReferenceRecord,
  VisualReferenceSelectionTarget,
  VisualReferenceTemporalPosition,
} from './types';

export function selectBestOfficialReference(
  memory: VisualReferenceMemory,
  target: VisualReferenceSelectionTarget,
): VisualReferenceRecord | undefined {
  const prior = memory
    .findByProject(target.projectId)
    .filter(record => isSelectableOfficial(record) && isBefore(record.temporalPosition, target.temporalPosition));

  const sameScene = prior.filter(record => record.sceneId === target.sceneId);
  const candidates = sameScene.length > 0 ? sameScene : prior;

  return [...candidates].sort(compareClosestFirst)[0];
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

function compareClosestFirst(left: VisualReferenceRecord, right: VisualReferenceRecord): number {
  return (
    right.temporalPosition.sceneOrder - left.temporalPosition.sceneOrder ||
    right.temporalPosition.stageOrder - left.temporalPosition.stageOrder ||
    right.recordedAt - left.recordedAt ||
    left.id.localeCompare(right.id)
  );
}
