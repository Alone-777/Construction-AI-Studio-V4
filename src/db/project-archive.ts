import type { Project, SceneFeedback } from '../core/types';

interface ImportedSnapshot {
  sceneIndex: number;
  stageIndex: number;
  worldStateJson: string;
  timestamp?: number;
}

interface ImportedFeedback {
  feedback: SceneFeedback;
  createdAt?: number;
}

export interface NormalizedSnapshot extends ImportedSnapshot {
  id: string;
  projectId: string;
  timestamp: number;
}

export interface NormalizedFeedback extends ImportedFeedback {
  id: string;
  projectId: string;
  createdAt: number;
}

export interface ParsedProjectArchive {
  project: Project;
  snapshots: NormalizedSnapshot[];
  feedbacks: NormalizedFeedback[];
}

export function parseProjectArchive(
  json: string,
  generateId: () => string,
): ParsedProjectArchive {
  const data = JSON.parse(json) as {
    version?: string;
    project?: Project;
    snapshots?: ImportedSnapshot[];
    feedbacks?: ImportedFeedback[];
  };
  if (!data.project || typeof data.version !== 'string' || !data.version.startsWith('4.')) {
    throw new Error('Formato de arquivo inválido');
  }

  const projectId = generateId();
  const project: Project = {
    ...data.project,
    id: projectId,
    updatedAt: Date.now(),
  };
  const snapshotByStage = new Map<string, NormalizedSnapshot>();
  for (const snapshot of data.snapshots ?? []) {
    if (!Number.isInteger(snapshot.sceneIndex) || !Number.isInteger(snapshot.stageIndex) ||
        typeof snapshot.worldStateJson !== 'string') continue;
    const id = `${projectId}:${snapshot.sceneIndex}:${snapshot.stageIndex}`;
    snapshotByStage.set(id, {
      ...snapshot,
      id,
      projectId,
      timestamp: snapshot.timestamp ?? Date.now(),
    });
  }
  const feedbacks = (data.feedbacks ?? []).map(record => ({
    ...record,
    id: generateId(),
    projectId,
    createdAt: record.createdAt ?? Date.now(),
  }));

  return { project, snapshots: [...snapshotByStage.values()], feedbacks };
}
