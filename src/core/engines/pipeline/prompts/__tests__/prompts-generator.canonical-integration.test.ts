import { describe, expect, it, vi } from 'vitest';
import {
  compileDescriptionToBlueprint,
  createProjectFromDescription,
} from '../../../../blueprints/description-blueprint';
import { compileCanonicalImagePromptSpec } from '../../../../image-prompts/canonical-image-prompt-compiler';
import { adaptCanonicalImagePromptToNanoBanana } from '../../../../image-prompts/nano-banana-prompt-adapter';
import { generateKlingPrompt } from '../../../../prompts/kling';
import { DEFAULT_VISUAL_DNA, type VisualDNA } from '../../../../types/project';
import type { Operation, Scene, Stage } from '../../../../types/scene';
import { compileVisualScene } from '../../../../visual/VisualPromptCompiler';
import { worldStateToVisualSceneState } from '../../../../visual/VisualSceneState';
import { buildStageVisualStateSnapshots } from '../../../../visual-state/visual-state-snapshot';
import { DependencyBuilderStage } from '../../dependency/DependencyBuilder';
import { DNABuilderStage } from '../../dna/DNABuilder';
import { OperationsBuilderStage } from '../../operations/OperationsBuilder';
import { ScenesBuilderStage } from '../../scenes/ScenesBuilder';
import { SpatialBuilderStage } from '../../spatial/SpatialBuilder';
import { StagesExecutorStage } from '../../stages/StagesExecutor';
import type { PipelineContext } from '../../types';
import { WorldBuilderStage } from '../../world/WorldBuilder';
import type { FiscalRunner } from '../../../../fiscals/fiscal-runner';
import { PromptsGeneratorStage } from '../PromptsGenerator';

function visualDNA(context: PipelineContext): VisualDNA {
  return {
    ...structuredClone(DEFAULT_VISUAL_DNA),
    id: 'canonical-prompt-pipeline-dna',
    character: {
      ...structuredClone(DEFAULT_VISUAL_DNA.character),
      id: context.dna!.character.id,
      name: context.dna!.character.name,
      appearance: context.dna!.character.appearance,
      clothing: context.dna!.character.clothes,
    },
    updatedAt: 1,
  };
}

function createContext(operationCount: number): PipelineContext {
  const compiled = compileDescriptionToBlueprint({
    description: 'Cabana simples de madeira em terreno plano.',
    name: 'Canonical Prompt Pipeline Integration',
  });
  const context: PipelineContext = {
    config: compiled.config,
    blueprint: {
      ...compiled.blueprint,
      components: compiled.blueprint.components.slice(0, operationCount),
      operations: compiled.blueprint.operations.slice(0, operationCount),
    },
    createdAt: 1,
  };
  const setupStages = [
    new SpatialBuilderStage(),
    new DNABuilderStage(),
    new DependencyBuilderStage(),
    new WorldBuilderStage(),
    new OperationsBuilderStage(),
    new ScenesBuilderStage(),
  ];
  for (const setupStage of setupStages) {
    const result = setupStage.execute(context);
    if (!result.success) throw result.error ?? new Error(`Failed to execute ${setupStage.name}`);
  }
  context.visualDNA = visualDNA(context);
  return context;
}

function fiscalResult(approved: boolean) {
  const errors = approved
    ? []
    : [{ code: 'E-CANONICAL-PIPELINE', message: 'Candidate rejected', severity: 'ERROR' as const }];
  return {
    results: {
      dependencies: approved,
      temporal: true,
      spatial: true,
      causality: true,
      conservation: true,
      character: true,
      tools: true,
      visibility: true,
      progression: true,
      approved,
      errors,
      checks: [],
    },
    errors,
    warnings: [],
    approved,
    qualityScore: {
      continuity: 80,
      causality: 80,
      progression: approved ? 80 : 40,
      space: 80,
      rhythm: 80,
      clarity: 80,
      camera: 80,
      jumpRisk: approved ? 20 : 60,
      overall: approved ? 80 : 60,
    },
    jumpRisk: approved ? 'LOW' as const : 'HIGH' as const,
    status: approved ? 'approved' as const : 'blocked' as const,
  };
}

function executeStages(context: PipelineContext, approve: (stage: Stage) => boolean): void {
  context.fiscalRunner = {
    runAllFiscals: vi.fn(({ stage }: { stage: Stage }) => fiscalResult(approve(stage))),
  } as unknown as FiscalRunner;
  const result = new StagesExecutorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Stages executor failed');
}

function committedContext(operationCount = 3): PipelineContext {
  const context = createContext(operationCount);
  executeStages(context, () => true);
  const result = new PromptsGeneratorStage().execute(context);
  if (!result.success) throw result.error ?? new Error('Prompts generator failed');
  return context;
}

function stageAt(scene: Scene, percentage: Stage['percentage']): Stage {
  const stage = scene.stages.find(candidate => candidate.percentage === percentage);
  if (!stage) throw new Error(`Missing ${percentage}% stage`);
  return stage;
}

function operationFor(context: PipelineContext, scene: Scene): Operation {
  const operation = context.operations!.find(candidate => candidate.id === scene.operationId);
  if (!operation) throw new Error(`Missing operation ${scene.operationId}`);
  return operation;
}

function positivePrompt(fullText: string): string {
  return fullText.split('[TEMPORAL AND SCOPE FORBIDDEN]')[0];
}

describe('PromptsGeneratorStage - canonical Nano Banana integration', () => {
  it('gives a committed stage a canonical Nano Banana prompt', () => {
    const context = committedContext(1);
    const stage = stageAt(context.scenes![0], 100);
    expect(stage.prompts?.nanoBanana).toContain('[TEMPORAL STATE — HIGHEST PRIORITY]');
    expect(stage.prompts?.nanoBanana).toContain('OFFICIAL TIMELINE IMAGE');
  });

  it('derives stage.prompts.nanoBanana exactly from the official VisualStateSnapshot', () => {
    const context = committedContext(1);
    const scene = context.scenes![0];
    const stage = stageAt(scene, 100);
    const snapshots = buildStageVisualStateSnapshots({
      projectId: context.blueprint.id,
      scene,
      stage,
      operation: operationFor(context, scene),
      visualDNA: context.visualDNA!,
      spatialMap: context.spatialMap!,
      cameras: context.dna!.cameras,
    });
    const spec = compileCanonicalImagePromptSpec(snapshots.official)!;
    const adapted = adaptCanonicalImagePromptToNanoBanana(spec, {
      mode: 'GENERATE',
      profile: 'FULL',
    });
    expect(stage.prompts?.nanoBanana).toBe(`${adapted.prompt}\n\n${adapted.negativePrompt}`);
  });

  it('includes the primary PhysicalActionIR action', () => {
    const context = committedContext(1);
    const stage = stageAt(context.scenes![0], 50);
    expect(stage.prompts?.nanoBanana).toContain(stage.physicalActionIR!.primaryAction.description);
    expect(stage.prompts?.nanoBanana).toContain('[ONE PRIMARY PHYSICAL ACTION]');
  });

  it('preserves the PhysicalActionIR target', () => {
    const context = committedContext(1);
    const stage = stageAt(context.scenes![0], 50);
    const target = stage.physicalActionIR!.target;
    expect(stage.prompts?.nanoBanana).toContain(`target: ${target.label} (${target.id})`);
  });

  it('includes observable completion evidence', () => {
    const context = committedContext(1);
    const stage = stageAt(context.scenes![0], 50);
    expect(stage.physicalActionIR!.evidence.length).toBeGreaterThan(0);
    expect(stage.prompts?.nanoBanana).toContain(stage.physicalActionIR!.evidence[0]);
    expect(stage.prompts?.nanoBanana).toContain('[COMPLETION EVIDENCE — MUST BE VISIBLE]');
  });

  it('places future B/C components in the forbidden section after A', () => {
    const context = committedContext(3);
    const [operationA, operationB, operationC] = context.operations!;
    const sceneA = context.scenes!.find(scene => scene.operationId === operationA.id)!;
    const promptAfterA = stageAt(sceneA, 100).prompts!.nanoBanana;
    expect(promptAfterA).toContain(`no future or not-yet-built component: ${operationB.componentId}`);
    expect(promptAfterA).toContain(`no future or not-yet-built component: ${operationC.componentId}`);
  });

  it('keeps A→B→C future components out of each positive present state', () => {
    const context = committedContext(3);
    const [operationA, operationB, operationC] = context.operations!;
    const sceneA = context.scenes!.find(scene => scene.operationId === operationA.id)!;
    const sceneB = context.scenes!.find(scene => scene.operationId === operationB.id)!;
    const afterA = positivePrompt(stageAt(sceneA, 100).prompts!.nanoBanana);
    const afterB = positivePrompt(stageAt(sceneB, 100).prompts!.nanoBanana);

    expect(afterA).toContain(`present components: ${operationA.componentId}`);
    expect(afterA).not.toContain(operationB.componentId);
    expect(afterA).not.toContain(operationC.componentId);
    expect(afterB).toContain(operationA.componentId);
    expect(afterB).toContain(operationB.componentId);
    expect(afterB).not.toContain(operationC.componentId);
    expect(stageAt(sceneB, 100).prompts!.nanoBanana).toContain(
      `no future or not-yet-built component: ${operationC.componentId}`,
    );
  });

  it('does not give a rejected stage an official Nano Banana prompt', () => {
    const context = createContext(1);
    executeStages(context, stage => stage.percentage !== 50);
    const result = new PromptsGeneratorStage().execute(context);
    const rejected = stageAt(context.scenes![0], 50);

    expect(result.success).toBe(true);
    expect(rejected.status).toBe('rejected');
    expect(rejected.physicalActionIR).toBeDefined();
    expect(rejected.worldStateAfter).toBeDefined();
    expect(rejected.prompts?.nanoBanana).toBeUndefined();
  });

  it('does not give a skipped stage a fake prompt', () => {
    const context = createContext(1);
    executeStages(context, stage => stage.percentage !== 50);
    const result = new PromptsGeneratorStage().execute(context);
    const skipped = stageAt(context.scenes![0], 75);

    expect(result.success).toBe(true);
    expect(skipped.physicalActionIR).toBeUndefined();
    expect(skipped.worldStateBefore).toBeUndefined();
    expect(skipped.prompts).toBeUndefined();
  });

  it('preserves the existing Kling prompt generator output', () => {
    const context = committedContext(1);
    const scene = context.scenes![0];
    const stage = stageAt(scene, 50);
    const expected = generateKlingPrompt(
      scene,
      stage,
      stage.worldStateBefore!,
      context.dna!,
    ).fullText;
    expect(stage.prompts?.kling).toBe(expected);
  });

  it('preserves the existing visual prompt compiler output', () => {
    const context = committedContext(1);
    const stage = stageAt(context.scenes![0], 50);
    const expected = compileVisualScene(
      worldStateToVisualSceneState(stage.worldStateBefore!),
      context.visualDNA!,
      context.project?.constructionState,
    ).prompt;
    expect(stage.prompts?.visual).toBe(expected);
  });

  it('produces the same Nano Banana prompt for the same temporal state', () => {
    const first = committedContext(1);
    const second = committedContext(1);
    expect(stageAt(first.scenes![0], 50).prompts?.nanoBanana).toBe(
      stageAt(second.scenes![0], 50).prompts?.nanoBanana,
    );
  });

  it('uses GENERATE mode when no image reference is supplied', () => {
    const context = committedContext(1);
    const prompt = stageAt(context.scenes![0], 50).prompts!.nanoBanana;
    expect(prompt).toContain('[GENERATE DIRECTIVE]');
    expect(prompt).toContain('Generate a new image');
    expect(prompt).not.toContain('[EDIT DIRECTIVE]');
    expect(prompt).not.toContain('[REFERENCE GUIDANCE]');
  });

  it('fails clearly instead of silently using the legacy Nano Banana fallback', () => {
    const context = createContext(1);
    executeStages(context, () => true);
    const stage = stageAt(context.scenes![0], 50);
    stage.physicalActionIR = undefined;

    const result = new PromptsGeneratorStage().execute(context);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Missing PhysicalActionIR');
    expect(result.error?.message).toContain('Legacy Nano Banana fallback is disabled');
    expect(stage.prompts?.nanoBanana).toBeUndefined();
  });

  it('runs the canonical Nano Banana path through the complete project pipeline', () => {
    const project = createProjectFromDescription({
      description: 'Abrigo simples de madeira em uma clareira.',
      name: 'Canonical Pipeline End to End',
    });
    const stages = project.scenes.flatMap(scene => scene.stages);

    expect(stages.length).toBeGreaterThan(0);
    expect(stages.every(stage => stage.prompts?.nanoBanana.includes('OFFICIAL TIMELINE IMAGE'))).toBe(true);
    expect(stages.every(stage => stage.prompts?.visual && stage.prompts?.kling)).toBe(true);
  });
});
