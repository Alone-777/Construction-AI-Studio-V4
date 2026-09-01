import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, WorldState } from '../../core/types';

const dbMock = vi.hoisted(() => ({
  projects: {
    get: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
  },
  snapshots: {
    bulkPut: vi.fn(),
  },
  transaction: vi.fn(),
}));

vi.mock('../schema', () => ({ db: dbMock }));

import { saveProject } from '../repository';

describe('saveProject - commit integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.projects.get.mockResolvedValue(undefined);
    dbMock.transaction.mockImplementation(
      async (_mode: string, _tables: unknown[], work: () => Promise<void>) => work(),
    );
  });

  it('persists only approved snapshots while retaining rejected evidence in the Project', async () => {
    const officialState = { marker: 'official' } as unknown as WorldState;
    const rejectedCandidate = { marker: 'rejected-candidate' } as unknown as WorldState;
    const project = {
      id: 'project-snapshots',
      name: 'Snapshot Integrity',
      createdAt: 1_000,
      scenes: [{
        stages: [
          { status: 'approved', worldStateAfter: officialState },
          { status: 'rejected', worldStateAfter: rejectedCandidate },
        ],
      }],
    } as unknown as Project;

    await saveProject(project);

    expect(dbMock.snapshots.bulkPut).toHaveBeenCalledTimes(1);
    expect(dbMock.snapshots.bulkPut).toHaveBeenCalledWith([{
      id: 'project-snapshots:0:0',
      projectId: 'project-snapshots',
      sceneIndex: 0,
      stageIndex: 0,
      worldStateJson: JSON.stringify(officialState),
      timestamp: 1_000,
    }]);
    expect(project.scenes[0].stages[1].worldStateAfter).toBe(rejectedCandidate);
  });
});
