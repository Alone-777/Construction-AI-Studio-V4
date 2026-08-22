import { db, type ProjectRecord, type LibraryRecord, type PatternRecord, type FeedbackRecord, type SnapshotRecord } from './schema';
import type { Project, ApprovedPattern, SceneFeedback, WorldState } from '../core/types';
import { parseProjectArchive } from './project-archive';

/* ─── ID Generation ─── */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/* ─── Projects ─── */

export async function saveProject(project: Project): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.projects, db.snapshots], async () => {
    const existing = await db.projects.get(project.id);
    if (existing) {
      await db.projects.update(project.id, {
        name: project.name,
        data: project,
        updatedAt: now,
      });
    } else {
      await db.projects.add({
        id: project.id,
        name: project.name,
        data: project,
        createdAt: project.createdAt || now,
        updatedAt: now,
      });
    }

    const snapshots: SnapshotRecord[] = [];
    project.scenes.forEach((scene, sceneIndex) => {
      scene.stages.forEach((stage, stageIndex) => {
        if (!stage.worldStateAfter) return;
        snapshots.push({
          id: `${project.id}:${sceneIndex}:${stageIndex}`,
          projectId: project.id,
          sceneIndex,
          stageIndex,
          worldStateJson: JSON.stringify(stage.worldStateAfter),
          timestamp: project.createdAt + sceneIndex * 100 + stageIndex,
        });
      });
    });
    if (snapshots.length > 0) await db.snapshots.bulkPut(snapshots);
  });
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const record = await db.projects.get(id);
  return record?.data;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.snapshots, db.feedbacks], async () => {
    await db.projects.delete(id);
    await db.snapshots.where('projectId').equals(id).delete();
    await db.feedbacks.where('projectId').equals(id).delete();
  });
}

export async function exportProjectJSON(id: string): Promise<string> {
  const project = await loadProject(id);
  if (!project) throw new Error(`Projeto ${id} não encontrado`);
  const snapshots = await db.snapshots.where('projectId').equals(id).toArray();
  const feedbacks = await db.feedbacks.where('projectId').equals(id).toArray();
  return JSON.stringify({
    version: '4.0.0',
    exportedAt: new Date().toISOString(),
    project,
    snapshots,
    feedbacks,
  }, null, 2);
}

export async function importProjectJSON(json: string): Promise<Project> {
  const archive = parseProjectArchive(json, generateId);
  const { project } = archive;
  await saveProject(project);
  if (archive.snapshots.length > 0) await db.snapshots.bulkPut(archive.snapshots);
  if (archive.feedbacks.length > 0) await db.feedbacks.bulkAdd(archive.feedbacks);
  return project;
}

/* ─── World State Snapshots ─── */

export async function saveSnapshot(
  projectId: string,
  sceneIndex: number,
  stageIndex: number,
  worldState: WorldState
): Promise<void> {
  await db.snapshots.put({
    id: `${projectId}:${sceneIndex}:${stageIndex}`,
    projectId,
    sceneIndex,
    stageIndex,
    worldStateJson: JSON.stringify(worldState),
    timestamp: Date.now(),
  });
}

export async function getSnapshots(projectId: string): Promise<SnapshotRecord[]> {
  return db.snapshots.where('projectId').equals(projectId).sortBy('timestamp');
}

/* ─── Libraries ─── */

export async function saveLibraryItem(
  category: LibraryRecord['category'],
  name: string,
  data: Record<string, unknown>
): Promise<string> {
  const id = generateId();
  await db.libraries.add({
    id,
    category,
    name,
    data,
    createdAt: Date.now(),
  });
  return id;
}

export async function getLibraryItems(category: LibraryRecord['category']): Promise<LibraryRecord[]> {
  return db.libraries.where('category').equals(category).toArray();
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await db.libraries.delete(id);
}

/* ─── Approved Patterns ─── */

export async function savePattern(pattern: ApprovedPattern): Promise<void> {
  await db.patterns.add({
    id: pattern.id,
    pattern,
    createdAt: Date.now(),
  });
}

export async function getPatterns(): Promise<PatternRecord[]> {
  return db.patterns.toArray();
}

export async function deletePattern(id: string): Promise<void> {
  await db.patterns.delete(id);
}

/* ─── Feedback ─── */

export async function saveFeedback(projectId: string, feedback: SceneFeedback): Promise<void> {
  await db.feedbacks.add({
    id: generateId(),
    projectId,
    feedback,
    createdAt: Date.now(),
  });
}

export async function getFeedbacks(projectId: string): Promise<FeedbackRecord[]> {
  return db.feedbacks.where('projectId').equals(projectId).sortBy('createdAt');
}

export async function getAllFeedbacks(): Promise<FeedbackRecord[]> {
  return db.feedbacks.toArray();
}

/* ─── Auto-save Debounced ─── */

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function autoSaveProject(project: Project, debounceMs = 500): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveProject(project).catch(console.error);
    autoSaveTimer = null;
  }, debounceMs);
}
