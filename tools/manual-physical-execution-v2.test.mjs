import { describe, expect, it } from 'vitest';

import {
  ADOBE_FIREFLY_MANUAL_V2_PROMPT_MAX_CHARS,
  buildManualPhysicalExecutionPlanV2,
  compileManualAdobeFireflyPromptV2,
  compileManualProviderNeutralPromptArtifactV2,
  validateManualPhysicalExecutionPlanV2,
} from './manual-physical-execution-v2.mjs';
import {
  buildManualExecutionRecipe,
} from './manual-video-execution.mjs';

function job(overrides = {}) {
  return {
    id: 'firefly:test:preparacao:0-25',
    operationType: 'preparacao',
    operationName: 'Preparação seletiva do local',
    physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
    startStagePercentage: 0,
    targetStagePercentage: 25,
    durationSeconds: 15,
    aspectRatio: '16:9',
    model: 'KLING_3_0',
    source: { kind: 'KEYFRAME', keyframeId: 'official-source:job-001' },
    continuityLocks: {
      preserveCompletedOperations: [],
      forbiddenFutureElements: ['Execução das fundações', 'Montagem da base e piso'],
    },
    ...overrides,
  };
}

function recipe(overrides = {}) {
  return {
    ...buildManualExecutionRecipe({
      operationType: 'preparacao',
      operationName: 'Preparação seletiva do local',
      physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
      startStagePercentage: 0,
      targetStagePercentage: 25,
    }),
    ...overrides,
  };
}

describe('manual Physical Execution V2 bridge', () => {
  it('builds a structured compatibility plan with causal contact, effect and stop target', () => {
    const plan = buildManualPhysicalExecutionPlanV2({
      job: job(),
      executionRecipe: recipe(),
    });
    const validation = validateManualPhysicalExecutionPlanV2(plan);

    expect(validation.ok).toBe(true);
    expect(plan.schemaVersion).toBe('construction-physical-execution-plan/2');
    expect(plan.metadata.source).toBe('EXECUTION_RECIPE');
    expect(plan.metadata.confidence).toBe('MEDIUM');
    expect(plan.officialBefore.revision).toContain('official-source:job-001');
    expect(plan.intent.canonicalProgress).toMatchObject({
      beforePercentage: 0,
      targetPercentage: 25,
    });

    const contactIndex = plan.nodes.findIndex(node => node.kind === 'CONTACT');
    const effectIndex = plan.nodes.findIndex(node =>
      node.effects.some(effect => effect.type === 'SURFACE_REMOVED')
    );
    expect(contactIndex).toBeGreaterThanOrEqual(0);
    expect(effectIndex).toBeGreaterThan(contactIndex);
    expect(plan.nodes.some(node =>
      node.effects.some(effect =>
        effect.type === 'CANONICAL_PROGRESS_ADVANCED' &&
        effect.fromPercentage === 0 &&
        effect.toPercentage === 25
      )
    )).toBe(true);
    expect(plan.nodes.at(-1)?.kind).toBe('STOP');
    expect(plan.evidence.some(item =>
      item.visibleIn === 'TERMINAL_FRAME' && item.mustPersist === true
    )).toBe(true);
  });

  it('detects an edge that references a missing node', () => {
    const plan = buildManualPhysicalExecutionPlanV2({
      job: job(),
      executionRecipe: recipe(),
    });
    plan.edges.push({
      from: plan.nodes[0].id,
      to: 'missing-node',
      relation: 'SEQUENCE',
    });

    const validation = validateManualPhysicalExecutionPlanV2(plan);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('PHYSICAL_EXECUTION_V2_EDGE_NODE_MISSING');
  });

  it('detects canonical progress mismatches', () => {
    const plan = buildManualPhysicalExecutionPlanV2({
      job: job(),
      executionRecipe: recipe(),
    });
    const effect = plan.nodes
      .flatMap(node => node.effects)
      .find(item => item.type === 'CANONICAL_PROGRESS_ADVANCED');

    expect(effect).toBeDefined();
    effect.toPercentage = 50;

    const validation = validateManualPhysicalExecutionPlanV2(plan);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('PHYSICAL_EXECUTION_V2_PROGRESS_EFFECT_MISMATCH');
  });

  it('compiles provider-neutral artifact and Adobe Firefly prompt within 1800 chars', () => {
    const plan = buildManualPhysicalExecutionPlanV2({
      job: job(),
      executionRecipe: recipe(),
    });
    const artifact = compileManualProviderNeutralPromptArtifactV2(plan);
    const compiled = compileManualAdobeFireflyPromptV2({
      artifact,
      model: 'KLING_3_0',
      durationSeconds: 15,
    });

    expect(ADOBE_FIREFLY_MANUAL_V2_PROMPT_MAX_CHARS).toBe(1800);
    expect(artifact.schemaVersion).toBe('construction-provider-neutral-prompt/2');
    expect(compiled.platform).toBe('ADOBE_FIREFLY');
    expect(compiled.characterCount).toBeLessThanOrEqual(1800);
    expect(compiled.prompt).toContain('PHYSICAL EXECUTION:');
    expect(compiled.prompt).toContain('0%→25%');
    expect(compiled.prompt).toContain('END EVIDENCE:');
  });

  it('preserves retry codes under compaction', () => {
    const plan = buildManualPhysicalExecutionPlanV2({
      job: job(),
      executionRecipe: recipe(),
    });
    const artifact = compileManualProviderNeutralPromptArtifactV2(plan, [
      {
        code: 'TOOL_ACTION_NOT_EXECUTED',
        correction:
          'Show repeated shovel-to-ground contact, scraping, lifting and depositing material beside the same bounded patch. '.repeat(5),
      },
      {
        code: 'INSUFFICIENT_PHYSICAL_PROGRESS',
        correction:
          'Each shovel stroke must visibly enlarge one contiguous exposed-soil patch until the canonical target is reached. '.repeat(5),
      },
    ]);
    const compiled = compileManualAdobeFireflyPromptV2({
      artifact,
      model: 'KLING_3_0',
      durationSeconds: 15,
    });

    expect(compiled.characterCount).toBeLessThanOrEqual(1800);
    expect(compiled.prompt).toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(compiled.prompt).toContain('INSUFFICIENT_PHYSICAL_PROGRESS');
  });
});
