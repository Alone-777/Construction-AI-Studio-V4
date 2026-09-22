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
    expect(manifest.videoPolicy.platform).toBe('ADOBE_FIREFLY');
    expect(manifest.videoPolicy.provider).toBe('KLING_3_0_MANUAL');
    expect(manifest.videoPolicy.modelId).toBe('KLING_3_0');
    expect(manifest.videoPolicy.promptMaxChars).toBe(1800);
    expect(manifest.videoPolicy.durationSeconds).toBe(15);
    expect(queue.jobs.every(job => job.durationSeconds === 15)).toBe(true);
    expect(firstJob.platform).toBe('ADOBE_FIREFLY');
    expect(firstJob.model).toBe('KLING_3_0');
    expect(firstJob.sourceImagePrompt).toContain('OFFICIAL');
    expect(firstJob.source.kind).toBe('KEYFRAME');
    expect(manifest.executionPolicy.primarySchema).toBe('construction-physical-execution-plan/2');
    expect(manifest.executionPolicy.promptSource).toBe('PHYSICAL_EXECUTION_V2');
    expect(firstJob.promptSource).toBe('PHYSICAL_EXECUTION_V2');
    expect(firstJob.physicalExecutionV2.schema).toBe('construction-manual-physical-execution-v2/1');
    expect(firstJob.physicalExecutionV2.plan.schemaVersion).toBe('construction-physical-execution-plan/2');
    expect(firstJob.physicalExecutionV2.simulation.validation.ok).toBe(true);
    expect(firstJob.physicalExecutionV2.simulation.commitAvailable).toBe(false);
    expect(firstJob.physicalExecutionV2.logisticsShadow.mode).toBe('SHADOW');
    expect(firstJob.physicalExecutionV2.logisticsShadow.generationAuthorized).toBe(false);
    expect(firstJob.physicalExecutionV2.simulation.logisticsPreflight.commitAvailable).toBe(false);
    expect(firstJob.prompt).not.toContain('SHADOW');
    expect(firstJob.sourceImagePrompt).not.toContain('SHADOW');
    expect(firstJob.physicalExecutionV2.providerNeutralPrompt.schemaVersion).toBe('construction-provider-neutral-prompt/2');
    expect(firstJob.executionRecipe.schema).toBe('construction-manual-execution-recipe/1');
    expect(firstJob.executionRecipe.tools.length).toBeGreaterThan(0);
    expect(firstJob.prompt).toContain('[ADOBE FIREFLY VIDEO JOB]');
    expect(firstJob.prompt).toContain('PHYSICAL EXECUTION:');
    expect(firstJob.prompt).toContain(firstJob.executionRecipe.tools[0]);
    expect(firstJob.prompt).toMatch(/no pantomime/i);

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
      expect(job.physicalExecutionV2.plan.equipmentLogisticsPlan.mode).toBe('SHADOW');
      expect(job.physicalExecutionV2.simulation.logisticsPreflight.commitAvailable).toBe(false);
      expect(job.physicalExecutionV2.providerNeutralPrompt.logisticsShadow.plan)
        .toEqual(job.physicalExecutionV2.plan.equipmentLogisticsPlan);
      const shadow = job.physicalExecutionV2.logisticsShadow;
      expect(shadow.generationAuthorized).toBe(false);
      expect(shadow.sourcePreparation.changesOfficial).toBe(false);
      expect(shadow.sourcePreparation.phase).toBe(queued.sequence === 1 ? 'INITIAL_SOURCE' : 'CONTINUATION');
      if (queued.sequence > 1) expect(shadow.sourcePreparation.candidateImageInstruction).toBeNull();
      expect(job.prompt).not.toContain('SHADOW');
    }

    expect(Array.from(firstJob.prompt).length).toBeLessThanOrEqual(1800);
    expect(firstJob.prompt).toContain('Stop exactly at the target; never overshoot.');
    expect(firstJob.prompt).toContain('0%→25%');

    await expect(stat(path.join(workspace, queue.jobs[0].sourcePath))).rejects.toThrow();
    expect((await stat(path.join(workspace, manifest.initialImage.workspacePath))).isFile()).toBe(true);
    expect(await readFile(path.join(initialRoot, 'referencia.png'))).toEqual(Buffer.from('fake-png'));
  });
});
