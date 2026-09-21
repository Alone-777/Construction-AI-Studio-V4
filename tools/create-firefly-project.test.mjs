import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ANIMATION_PROMPT_MAX_CHARS,
  createFireflyProject,
} from './create-firefly-project.mjs';

describe('createFireflyProject', () => {
  it('creates 15s Kling 3.0 jobs while keeping Initial Image as MANUAL_REFERENCE', async () => {
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
    expect(result.firstJob.durationSeconds).toBe(15);
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
    expect(manifest.videoPolicy.provider).toBe('KLING_3_0_MANUAL');
    expect(manifest.videoPolicy.durationSeconds).toBe(15);
    expect(queue.jobs.every(job => job.durationSeconds === 15)).toBe(true);
    expect(firstJob.model).toBe('KLING_3_0');
    expect(firstJob.sourceImagePrompt).toContain('OFFICIAL');
    expect(firstJob.source.kind).toBe('KEYFRAME');
    expect(firstJob.executionRecipe.schema).toBe('construction-manual-execution-recipe/1');
    expect(firstJob.executionRecipe.tools).toContain('shovel');
    expect(firstJob.executionRecipe.actorAction).toMatch(/shovel/i);
    expect(firstJob.executionRecipe.visibleTransformation).toMatch(/exposed, disturbed brown soil/i);
    expect(firstJob.executionRecipe.terminalEvidence).toMatch(/25%/);
    expect(firstJob.prompt).toMatch(/Worker must physically execute this on screen using shovel/i);
    expect(firstJob.prompt).toMatch(/Push the shovel blade/i);
    expect(firstJob.prompt).toMatch(/VISIBLE CHANGE/i);
    expect(firstJob.prompt).toMatch(/No pantomime/i);

    for (const queued of queue.jobs) {
      const job = JSON.parse(
        await readFile(
          path.join(workspace, queued.jobDirectory, 'job.json'),
          'utf8',
        ),
      );
      expect(Array.from(job.prompt).length).toBeLessThanOrEqual(
        ANIMATION_PROMPT_MAX_CHARS,
      );
    }

    expect(Array.from(firstJob.prompt).length).toBeLessThanOrEqual(1800);
    expect(firstJob.prompt).toContain('Stop at the target; never overshoot.');
    expect(firstJob.prompt).toContain('Final frame = exactly 25%, visibly incomplete.');

    await expect(stat(path.join(workspace, queue.jobs[0].sourcePath))).rejects.toThrow();
    expect((await stat(path.join(workspace, manifest.initialImage.workspacePath))).isFile()).toBe(true);
  });
});
