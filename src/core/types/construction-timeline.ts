import { ConstructionStateSnapshot } from './construction-state';

export interface ConstructionTimelineFrame {
  id: string;
  sceneId: string;
  progress: number;

  state: ConstructionStateSnapshot;

  visualChanges: {
    added: string[];
    removed: string[];
    modified: string[];
  };

  previousFrameId?: string;
  nextFrameId?: string;

  createdAt: Date;
}

export interface ConstructionTimeline {
  id: string;
  projectId: string;

  frames: ConstructionTimelineFrame[];

  currentFrameId: string;

  createdAt: Date;
}