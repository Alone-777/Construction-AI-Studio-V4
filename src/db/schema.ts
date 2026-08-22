import Dexie, { type Table } from 'dexie';
import type { Project, ProjectDNA, ApprovedPattern, SceneFeedback } from '../core/types';

/* ─── Records ─── */

export interface ProjectRecord {
  id: string;
  name: string;
  data: Project;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryRecord {
  id: string;
  category: 'character' | 'terrain' | 'construction' | 'material' | 'tool' | 'camera' | 'preset';
  name: string;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface PatternRecord {
  id: string;
  pattern: ApprovedPattern;
  createdAt: number;
}

export interface FeedbackRecord {
  id: string;
  projectId: string;
  feedback: SceneFeedback;
  createdAt: number;
}

export interface SnapshotRecord {
  id: string;
  projectId: string;
  sceneIndex: number;
  stageIndex: number;
  worldStateJson: string;
  timestamp: number;
}

/* ─── Database ─── */

export class ConstructionStudioDB extends Dexie {
  projects!: Table<ProjectRecord, string>;
  libraries!: Table<LibraryRecord, string>;
  patterns!: Table<PatternRecord, string>;
  feedbacks!: Table<FeedbackRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;

  constructor() {
    super('ConstructionAIStudioV4');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      libraries: 'id, category, name, createdAt',
      patterns: 'id, createdAt',
      feedbacks: 'id, projectId, createdAt',
      snapshots: 'id, projectId, [projectId+sceneIndex], timestamp',
    });
    // A estrutura de índices é preservada; a versão registra o suporte semântico
    // à categoria `tool` para instalações já existentes.
    this.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      libraries: 'id, category, name, createdAt',
      patterns: 'id, createdAt',
      feedbacks: 'id, projectId, createdAt',
      snapshots: 'id, projectId, [projectId+sceneIndex], timestamp',
    });
  }
}

export const db = new ConstructionStudioDB();
