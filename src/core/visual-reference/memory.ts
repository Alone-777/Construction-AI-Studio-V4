import type { ImageMetadataValue } from '../image-generation';
import type { VisualReferenceRecord } from './types';

export interface VisualReferenceMemory {
  readonly records: readonly VisualReferenceRecord[];
  append(record: VisualReferenceRecord): VisualReferenceMemory;
  findByProject(projectId: string): readonly VisualReferenceRecord[];
  findBySceneStage(
    projectId: string,
    sceneId: string,
    stageId: string,
  ): readonly VisualReferenceRecord[];
}

class ImmutableVisualReferenceMemory implements VisualReferenceMemory {
  readonly records: readonly VisualReferenceRecord[];

  constructor(records: readonly VisualReferenceRecord[]) {
    this.records = Object.freeze(records.map(cloneAndValidateOfficialRecord));
    Object.freeze(this);
  }

  append(record: VisualReferenceRecord): VisualReferenceMemory {
    const cloned = cloneAndValidateOfficialRecord(record);
    const existing = this.records.find(item => item.id === cloned.id);

    if (existing) {
      if (stableSerialize(existing) !== stableSerialize(cloned)) {
        throw new Error(`Visual reference record id ${cloned.id} already has different content.`);
      }
      return this;
    }

    return new ImmutableVisualReferenceMemory([...this.records, cloned]);
  }

  findByProject(projectId: string): readonly VisualReferenceRecord[] {
    return Object.freeze(this.records.filter(record => record.projectId === projectId));
  }

  findBySceneStage(
    projectId: string,
    sceneId: string,
    stageId: string,
  ): readonly VisualReferenceRecord[] {
    return Object.freeze(
      this.records.filter(
        record =>
          record.projectId === projectId &&
          record.sceneId === sceneId &&
          record.stageId === stageId,
      ),
    );
  }
}

export function createVisualReferenceMemory(
  records: readonly VisualReferenceRecord[] = [],
): VisualReferenceMemory {
  return new ImmutableVisualReferenceMemory(records);
}

function cloneAndValidateOfficialRecord(record: VisualReferenceRecord): VisualReferenceRecord {
  if (
    record.approvalStatus !== 'APPROVED' ||
    record.temporalAuthority !== 'OFFICIAL' ||
    record.snapshotKind !== 'OFFICIAL' ||
    record.stageOutcome !== 'COMMITTED'
  ) {
    throw new Error('VisualReferenceMemory accepts only explicitly approved official committed records.');
  }
  if (!record.id || !record.projectId || !record.sceneId || !record.stageId) {
    throw new Error('Visual reference identity fields are required.');
  }
  if (!Number.isFinite(record.recordedAt)) {
    throw new Error('Visual reference recordedAt must be a finite caller-supplied value.');
  }
  if (
    !Number.isInteger(record.temporalPosition.sceneOrder) ||
    !Number.isInteger(record.temporalPosition.stageOrder) ||
    record.temporalPosition.sceneOrder < 0 ||
    record.temporalPosition.stageOrder < 0
  ) {
    throw new Error('Visual reference temporal position must contain non-negative integer orders.');
  }
  if (!record.asset.id || !record.asset.uri) {
    throw new Error('Visual reference asset must have an id and uri.');
  }

  return deepFreeze({
    ...record,
    temporalPosition: { ...record.temporalPosition },
    asset: {
      ...record.asset,
      metadata: record.asset.metadata ? cloneMetadata(record.asset.metadata) : undefined,
    },
    metadata: record.metadata ? cloneMetadata(record.metadata) : undefined,
  });
}

function cloneMetadata(
  metadata: Readonly<Record<string, ImageMetadataValue>>,
): Readonly<Record<string, ImageMetadataValue>> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, cloneMetadataValue(value)]),
  );
}

function cloneMetadataValue(value: ImageMetadataValue): ImageMetadataValue {
  if (Array.isArray(value)) return value.map(cloneMetadataValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneMetadataValue(item)]),
    );
  }
  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
