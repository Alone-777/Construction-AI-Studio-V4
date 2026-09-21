import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createFireflyProject } from './create-firefly-project.mjs';

describe('createFireflyProject', () => {
  it('creates 5s Kling 2.5 jobs while keeping Initial Image as MANUAL_REFERENCE', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'construction-ai-bootstrap-'));
    const initialRoot = path.join(root, 'Imagem Inicial');
    await mkdir(initialRoot, { recursive: true });
    await writeFile(path.join(initialRoot, 'referencia.png'), Buffer.from('fake-png'));

    const result = await createFireflyProject({
      projectRoot: root,
      description: 'Cabana de madeira em uma floresta',
      name: 'Cabana Teste',
      createdAt: new Date('2026-09-20T20:00:00.000Z'),
    });

    expect(result.totalJobs).toBe(32);
    expect(result.firstJob.durationSeconds).toBe(5);
    expect(result.firstJob.sourceReady).toBe(false);
    expect(result.firstJob.expectedOfficialSource).toBe('inputs/official/job-001-source.png');
    expect(result.firstJob.sourceImagePrompt).toContain('MANUAL_REFERENCE');

    const workspace = path.join(root, result.workspace);
    const manifest = JSON.parse(await readFile(path.join(workspace, 'manifest.json'), 'utf8'));
    const queue = JSON.parse(await readFile(path.join(workspace, 'queue.json'), 'utf8'));
    const firstJob = JSON.parse(
      await readFile(path.join(workspace, queue.jobs[0].jobDirectory, 'job.json'), 'utf8'),
    );

    expect(manifest.initialImage.temporalRole).toBe('MANUAL_REFERENCE');
    expect(manifest.initialImage.temporalAuthority).toBe(false);
    expect(manifest.videoPolicy.provider).toBe('KLING_2_5_MANUAL');
    expect(manifest.videoPolicy.durationSeconds).toBe(5);
    expect(queue.jobs.every(job => job.durationSeconds === 5)).toBe(true);
    expect(firstJob.model).toBe('KLING_2_5');
    expect(firstJob.sourceImagePrompt).toContain('OFFICIAL');
    expect(firstJob.source.kind).toBe('KEYFRAME');

    await expect(stat(path.join(workspace, queue.jobs[0].sourcePath))).rejects.toThrow();
    expect((await stat(path.join(workspace, manifest.initialImage.workspacePath))).isFile()).toBe(true);
  });
});
